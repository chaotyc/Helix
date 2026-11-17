// How electron-builder packages Helix for each OS (see the dist scripts in package.json).
//
// Release files, named so an update check can pick the one for its OS and processor:
//   Helix-<version>-arm64.dmg, Helix-<version>-x64.dmg   macOS (Apple silicon, Intel)
//   Helix-Setup-<version>-x64.exe                        Windows installer
//   Helix-<version>-x86_64.AppImage, Helix-<version>-amd64.deb   Linux
//
// Signing switches on by itself when certificates are in the environment (the release workflow
// passes them from repository secrets):
//   macOS     CSC_LINK + CSC_KEY_PASSWORD (a Developer ID Application .p12, base64 or a path), or
//             CSC_NAME (a certificate already in this Mac's keychain); to notarize as well:
//             APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.
//   Windows   WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (a code-signing .pfx).
// Without them, macOS builds are signed ad hoc (Apple silicon won't run unsigned code at all) and
// Windows and Linux builds are unsigned.

// GitHub Actions passes a secret that isn't set as an empty string, and electron-builder would
// take an empty CSC_LINK for a certificate. Unset means unset.
const SIGNING_ENV = ["CSC_LINK", "CSC_KEY_PASSWORD", "CSC_NAME", "WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
for (const name of SIGNING_ENV) if (process.env[name] === "") delete process.env[name];

const env = process.env;
const macCertificate = Boolean(env.CSC_LINK || env.CSC_NAME);
const macNotarize = macCertificate && Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
const ENTITLEMENTS = "assets/entitlements.mac.plist";

/** @type {import("electron-builder").Configuration} */
export default {
  appId: "io.github.chaotyc.helix",
  productName: "Helix",
  directories: { output: "release", buildResources: "assets" },
  files: ["build/main.mjs", "build/preload.cjs", "assets/icon.png", "package.json"],
  extraResources: [
    { from: "build/server", to: "server" },
    { from: "build/helix-src", to: "helix-src" },
    { from: "build/web", to: "web" },
  ],
  npmRebuild: false, // no native modules
  publish: null, // the release workflow uploads the files; no update metadata (latest.yml) is made

  mac: {
    target: "dmg", // the processor comes from the command line: --arm64, --x64, or this Mac's
    icon: "assets/icon.icns",
    category: "public.app-category.education",
    ...(macCertificate
      ? { hardenedRuntime: true, entitlements: ENTITLEMENTS, entitlementsInherit: ENTITLEMENTS, notarize: macNotarize }
      : { identity: "-", hardenedRuntime: false, notarize: false }), // ad hoc: the hardened runtime would reject Electron's own frameworks
    gatekeeperAssess: false,
  },
  dmg: {
    title: "Helix",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    writeUpdateInfo: false,
  },

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "assets/icon.png", // electron-builder makes the .ico from it
  },
  nsis: {
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    oneClick: true, // installs for this user only, no administrator rights; data stays on uninstall
    shortcutName: "Helix",
  },

  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    executableName: "helix",
    syncDesktopName: true, // helix.desktop (desktopName in package.json), matching the window's WM_CLASS
    category: "Education",
    synopsis: "A personal AI tutor that runs on your computer",
    description: "Helix turns a goal and its source material into a concept map, measures what you know, and tutors you.",
    maintainer: "chaotyc <60454330+chaotyc@users.noreply.github.com>",
    // The icon is made from assets/icon.icns.
  },
  appImage: { artifactName: "${productName}-${version}-x86_64.${ext}" },
  deb: { artifactName: "${productName}-${version}-amd64.${ext}" },
};
