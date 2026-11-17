// The Mac app. Electron's main process:
//   1. starts the Helix server as a background process (Electron's own Node runs it),
//   2. waits until the server says it's listening, then opens a window on it,
//   3. keeps the API keys (Anthropic, OpenAI, Gemini, xAI, Meta), encrypted with the macOS keychain
//      (safeStorage), and hands them to the server when starting it. Keys never travel over the
//      WebSocket. Subscription tools (Codex, Claude Code, ...) keep their own logins.
//   4. on launch, checks GitHub Releases for a newer version and offers the download (updates.ts).
// Data lives in ~/Library/Application Support/Helix (HELIX_DATA_DIR overrides it, for testing).
import { BrowserWindow, app, dialog, ipcMain, nativeTheme, safeStorage, shell, utilityProcess, type UtilityProcess } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASES_REPO, isNewer, latestRelease, skipVersion, skippedVersion } from "./updates.ts";

app.setName("Helix"); // also names the data folder, so it stays "Helix" whatever the app ID
const DATA_DIR = process.env.HELIX_DATA_DIR ?? app.getPath("userData");
// Each provider's key, encrypted; useless without this Mac's keychain. The Anthropic key keeps the
// file name it had before other providers existed.
const KEYS = {
  anthropic: { file: "api-key.bin", env: "ANTHROPIC_API_KEY" },
  openai: { file: "openai-key.bin", env: "OPENAI_API_KEY" },
  google: { file: "google-key.bin", env: "GEMINI_API_KEY" },
  xai: { file: "xai-key.bin", env: "XAI_API_KEY" },
  meta: { file: "meta-key.bin", env: "META_API_KEY" },
} as const;
type KeyProvider = keyof typeof KEYS;
const isKeyProvider = (value: unknown): value is KeyProvider => typeof value === "string" && Object.hasOwn(KEYS, value);
const keyFile = (provider: KeyProvider) => join(DATA_DIR, KEYS[provider].file);
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

// ---- The API keys ----

function savedKey(provider: KeyProvider): string | null {
  const file = keyFile(provider);
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(readFileSync(file));
  } catch {
    return null; // written on another Mac, or the keychain entry is gone
  }
}

function saveKey(provider: KeyProvider, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The macOS keychain isn't available, so the key can't be stored safely.");
  writeFileSync(keyFile(provider), safeStorage.encryptString(key), { mode: 0o600 });
}

// ---- The server ----

function log(line: string): void {
  appendFileSync(LOG_FILE, line.endsWith("\n") ? line : `${line}\n`);
}

// Starts the server and resolves with its port once it's listening.
function startServer(): Promise<number> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HELIX_PORT: "0", // any free port
    HELIX_DB_PATH: join(DATA_DIR, "helix.sqlite"),
    HELIX_WEB_DIR: join(RESOURCES, "web"),
    HELIX_RESOURCES_DIR: join(RESOURCES, "helix-src"), // migrations, prompts, and the files prompt versions hash
  };
  for (const provider of Object.keys(KEYS) as KeyProvider[]) {
    const key = savedKey(provider) ?? process.env[KEYS[provider].env]; // a saved key wins over the environment
    if (key) env[KEYS[provider].env] = key;
    else delete env[KEYS[provider].env];
  }

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
    // No title bar: the UI runs to the top edge, and the window buttons sit in the sidebar's top row,
    // centered on it (the row is 48px tall, 8px down; see .app-drag in apps/web/src/index.css).
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 25 },
    // The UI's window color in the Mac's current appearance (--hx-canvas in apps/web/src/index.css),
    // so there's no flash of the wrong color before the UI paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#f2f2f4",
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
  // In full screen the window buttons are hidden, so the page stops leaving room for them.
  win.on("enter-full-screen", () => win.webContents.send("helix:full-screen", true));
  win.on("leave-full-screen", () => win.webContents.send("helix:full-screen", false));
  win.webContents.on("did-finish-load", () => win.webContents.send("helix:full-screen", win.isFullScreen())); // e.g. after saving the key reloads
  win.on("closed", () => (window = null));
  return win;
}

// ---- What the Settings tab can ask for (preload.ts exposes these) ----

function fromHelix(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(origin) && (event.senderFrame?.url ?? "").startsWith(origin);
}

function setKey(provider: unknown, key: unknown): Promise<void> {
  if (!isKeyProvider(provider)) throw new Error("Unknown provider.");
  if (typeof key !== "string" || !/^\S{10,400}$/.test(key.trim())) throw new Error("That doesn't look like an API key.");
  saveKey(provider, key.trim());
  return startAndShow(); // the server reads the keys when it starts
}

function clearKey(provider: unknown): Promise<void> {
  if (!isKeyProvider(provider)) throw new Error("Unknown provider.");
  rmSync(keyFile(provider), { force: true });
  return startAndShow();
}

// The Anthropic key alone: the bridge's first version, still used by its settings section.
ipcMain.handle("helix:key-status", (event) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  return { saved: savedKey("anthropic") !== null, canEncrypt: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle("helix:set-key", async (event, key: unknown) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  await setKey("anthropic", key);
});

ipcMain.handle("helix:clear-key", async (event) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  await clearKey("anthropic");
});

// Any provider's key.
ipcMain.handle("helix:keys-status", (event) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  const saved = Object.fromEntries((Object.keys(KEYS) as KeyProvider[]).map((p) => [p, savedKey(p) !== null]));
  return { saved, canEncrypt: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle("helix:set-provider-key", async (event, provider: unknown, key: unknown) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  await setKey(provider, key);
});

ipcMain.handle("helix:clear-provider-key", async (event, provider: unknown) => {
  if (!fromHelix(event)) throw new Error("Not allowed.");
  await clearKey(provider);
});

// ---- Updates ----

// Once per launch, in the packaged app only. HELIX_UPDATE_REPO (owner/name) points the check at
// another repository and turns it on under `pnpm start`, for testing.
const UPDATE_REPO = process.env.HELIX_UPDATE_REPO;
const NOTES_SHOWN = 600; // characters of release notes in the dialog

async function checkForUpdates(): Promise<void> {
  const current = app.getVersion();
  const release = await latestRelease(UPDATE_REPO ?? RELEASES_REPO);
  if (!release || !isNewer(release.version, current) || skippedVersion(DATA_DIR) === release.version) return;

  const notes = release.notes.length > NOTES_SHOWN ? `${release.notes.slice(0, NOTES_SHOWN).trimEnd()}…` : release.notes;
  const options: Electron.MessageBoxOptions = {
    type: "info",
    message: `Helix ${release.version} is available`,
    detail: [
      `You have ${current}.`,
      notes,
      "To update, download it, quit Helix, and drag the new Helix into Applications. Your goals and settings are kept. macOS may ask once whether the new version can use your saved API keys.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    buttons: ["Download", "Later", "Skip This Version"],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  if (response === 0) await shell.openExternal(release.downloadUrl);
  if (response === 2) skipVersion(DATA_DIR, release.version);
}

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
    // `pnpm start` runs Electron's own app, which would show Electron's icon in the Dock.
    if (!app.isPackaged) app.dock?.setIcon(join(HERE, "..", "assets", "icon.png"));
    try {
      await startAndShow();
    } catch (err) {
      dialog.showErrorBox("Helix couldn't start", err instanceof Error ? err.message : String(err));
      app.quit();
      return;
    }
    // Offline or GitHub unreachable: say nothing, note it in the log.
    if (app.isPackaged || UPDATE_REPO) {
      checkForUpdates().catch((err) => log(`update check failed: ${err instanceof Error ? err.message : String(err)}`));
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
