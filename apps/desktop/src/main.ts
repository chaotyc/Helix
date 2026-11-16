// The Mac app. Electron's main process:
//   1. starts the Helix server as a background process (Electron's own Node runs it),
//   2. waits until the server says it's listening, then opens a window on it,
//   3. keeps the Anthropic API key, encrypted with the macOS keychain (safeStorage), and hands it
//      to the server when starting it. The key never travels over the WebSocket.
// Data lives in ~/Library/Application Support/Helix (HELIX_DATA_DIR overrides it, for testing).
import { BrowserWindow, app, dialog, ipcMain, safeStorage, shell, utilityProcess, type UtilityProcess } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

app.setName("Helix");
const DATA_DIR = process.env.HELIX_DATA_DIR ?? app.getPath("userData");
const KEY_FILE = join(DATA_DIR, "api-key.bin"); // encrypted; useless without this Mac's keychain
const LOG_FILE = join(DATA_DIR, "server.log");
const START_TIMEOUT_MS = 20_000;

// main.mjs and preload.cjs sit together (inside the app's archive when packaged).
const HERE = dirname(fileURLToPath(import.meta.url));
// The server, its files, and the UI: the app's Resources folder when packaged, or the build
// folder when run with `pnpm start`.
const RESOURCES = app.isPackaged ? process.resourcesPath : HERE;

let server: UtilityProcess | null = null;
let origin = ""; // http://127.0.0.1:<port>, the only page the window may show
let window: BrowserWindow | null = null;

// ---- The API key ----

function savedKey(): string | null {
  if (!existsSync(KEY_FILE) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(KEY_FILE));
  } catch {
    return null; // written on another Mac, or the keychain entry is gone
  }
}

function saveKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The macOS keychain isn't available, so the key can't be stored safely.");
  writeFileSync(KEY_FILE, safeStorage.encryptString(key), { mode: 0o600 });
}

// ---- The server ----

function log(line: string): void {
  appendFileSync(LOG_FILE, line.endsWith("\n") ? line : `${line}\n`);
}

// Starts the server and resolves with its port once it's listening.
function startServer(): Promise<number> {
  const key = savedKey() ?? process.env.ANTHROPIC_API_KEY; // a saved key wins over the environment
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HELIX_PORT: "0", // any free port
    HELIX_DB_PATH: join(DATA_DIR, "helix.sqlite"),
    HELIX_WEB_DIR: join(RESOURCES, "web"),
    HELIX_RESOURCES_DIR: join(RESOURCES, "helix-src"), // migrations, prompts, and the files prompt versions hash
  };
  if (key) env.ANTHROPIC_API_KEY = key;
  else delete env.ANTHROPIC_API_KEY;

  const child = utilityProcess.fork(join(RESOURCES, "server", "server.mjs"), [], { env, stdio: "pipe", serviceName: "Helix server" });
  server = child;
  log(`--- ${new Date().toISOString()} starting the server`);
  child.stdout?.on("data", (data: Buffer) => log(data.toString()));
  child.stderr?.on("data", (data: Buffer) => log(data.toString()));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The server didn't start within ${START_TIMEOUT_MS / 1000} seconds.`)), START_TIMEOUT_MS);
    child.on("message", (message: { type?: string; port?: number }) => {
      if (message.type !== "listening" || typeof message.port !== "number") return;
      clearTimeout(timer);
      resolve(message.port);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (server === child) server = null;
      reject(new Error(`The server stopped (exit code ${code}). Details are in ${LOG_FILE}.`));
    });
  });
}

function stopServer(): void {
  server?.kill();
  server = null;
}

// Starts (or restarts) the server and points the window at it.
async function startAndShow(): Promise<void> {
  stopServer();
  const port = await startServer();
  origin = `http://127.0.0.1:${port}`;
  await (window ??= createWindow()).loadURL(`${origin}/`);
}

// ---- The window ----

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Helix",
    backgroundColor: "#09090b", // zinc-950, so there's no white flash before the UI paints
    webPreferences: {
      preload: join(HERE, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // The window only ever shows Helix. Links elsewhere open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });
  win.on("closed", () => (window = null));
  return win;
}

// ---- What the Settings tab can ask for (preload.ts exposes these) ----

function fromHelix(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(origin) && (event.senderFrame?.url ?? "").startsWith(origin);
}

ipcMain.handle("helix:key-status", (event) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  return { saved: savedKey() !== null, canEncrypt: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle("helix:set-key", async (event, key: unknown) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  if (typeof key !== "string" || !/^\S{10,400}$/.test(key.trim())) throw new Error("That doesn't look like an API key.");
  saveKey(key.trim());
  await startAndShow(); // the server reads the key when it starts
});

ipcMain.handle("helix:clear-key", async (event) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  rmSync(KEY_FILE, { force: true });
  await startAndShow();
});

// ---- App lifecycle ----

if (!app.requestSingleInstanceLock()) {
  app.quit(); // one Helix at a time: two would share one database
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  app.whenReady().then(async () => {
    mkdirSync(DATA_DIR, { recursive: true });
    try {
      await startAndShow();
    } catch (err) {
      dialog.showErrorBox("Helix couldn't start", err instanceof Error ? err.message : String(err));
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!window && origin) {
      window = createWindow();
      void window.loadURL(`${origin}/`);
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", stopServer);
}
