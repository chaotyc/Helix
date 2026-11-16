// Builds everything the Mac app runs into apps/desktop/build/:
//   main.mjs, preload.cjs   the Electron main process and the page's preload
//   server/server.mjs       the Helix server as one JavaScript file
//   helix-src/              server files read at runtime: migrations, prompts, and the source files
//                           prompt versions hash (so the app's versions match `pnpm dev` and the evals)
//   web/                    the built UI
// Run with: pnpm --filter @helix/desktop build   (start and dist run it first)
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(DESKTOP, "../..");
const OUT = join(DESKTOP, "build");
const NODE_TARGET = "node24"; // the Node inside Electron 45

rmSync(OUT, { recursive: true, force: true });

// In one bundled file, import.meta.filename would be the bundle for every module. Each server
// module's import.meta.filename/dirname becomes its own path inside helix-src instead.
const serverPaths = {
  name: "helix-server-paths",
  setup(b) {
    b.onLoad({ filter: /[\\/]apps[\\/]server[\\/]src[\\/].*\.ts$/ }, (args) => {
      const rel = relative(ROOT, args.path).split(sep).join("/");
      const contents = readFileSync(args.path, "utf8")
        .replaceAll("import.meta.filename", `__helixPath(${JSON.stringify(rel)})`)
        .replaceAll("import.meta.dirname", `__helixPath(${JSON.stringify(posix.dirname(rel))})`);
      return { contents, loader: "ts" };
    });
  },
};

console.log("Bundling the server…");
await build({
  entryPoints: [join(ROOT, "apps/server/src/main.ts")],
  outfile: join(OUT, "server/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: NODE_TARGET,
  external: ["bufferutil", "utf-8-validate"], // optional speedups for ws; it works without them
  plugins: [serverPaths],
  banner: {
    js: [
      'import { createRequire as __helixRequire } from "node:module";',
      'import { join as __helixJoin } from "node:path";',
      "const require = __helixRequire(import.meta.url);", // for the CommonJS packages inside (ws)
      'const __helixPath = (p) => __helixJoin(process.env.HELIX_RESOURCES_DIR ?? "", p);',
    ].join("\n"),
  },
  logLevel: "warning",
});

console.log("Copying migrations, prompts, and templates…");
cpSync(join(ROOT, "apps/server/src"), join(OUT, "helix-src/apps/server/src"), {
  recursive: true,
  filter: (path) => !path.endsWith(".test.ts"),
});
cpSync(join(ROOT, "apps/server/migrations"), join(OUT, "helix-src/apps/server/migrations"), { recursive: true });

console.log("Bundling the Electron main process and preload…");
await build({
  entryPoints: [join(DESKTOP, "src/main.ts")],
  outfile: join(OUT, "main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: NODE_TARGET,
  external: ["electron"],
  logLevel: "warning",
});
await build({
  entryPoints: [join(DESKTOP, "src/preload.ts")],
  outfile: join(OUT, "preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs", // a sandboxed preload must be CommonJS
  target: NODE_TARGET,
  external: ["electron"],
  logLevel: "warning",
});

console.log("Building the UI…");
execSync("pnpm --filter @helix/web build", { cwd: ROOT, stdio: "inherit" });
cpSync(join(ROOT, "apps/web/dist"), join(OUT, "web"), { recursive: true });

console.log(`Built ${relative(ROOT, OUT)}/`);
