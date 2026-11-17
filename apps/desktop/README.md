# desktop: the Mac app

Electron shell that starts the Helix server (in Electron's own Node), waits until it's listening,
and opens a window on it. The server serves the built UI on the same port as its WebSocket.

- Data: `~/Library/Application Support/Helix` (database, encrypted API key, `server.log`).
- API key: entered in Settings, encrypted with the macOS keychain (`safeStorage`).

```bash
pnpm --filter @helix/desktop start   # build, then run the app without packaging
pnpm --filter @helix/desktop dist    # build and package release/Helix-<version>-arm64.dmg
pnpm --filter @helix/desktop icon    # rebuild assets/icon.icns from the brand SVG
```

The app isn't signed by a registered developer, so macOS blocks the first launch: open it once,
then choose **Open Anyway** in System Settings → Privacy & Security.

## Updates

On launch, the packaged app asks GitHub for the latest release of `chaotyc/Helix`. If it's newer
than the app's own version, a dialog offers **Download** (opens the `.dmg`), **Later**, or **Skip
This Version**. Nothing installs itself: without an Apple Developer ID, macOS won't let the app
replace itself. If the check fails (offline, GitHub down), the app says nothing and notes it in
`server.log`.

To publish a version:

```bash
# 1. raise "version" in apps/desktop/package.json (e.g. 0.2.0), commit, and push
pnpm --filter @helix/desktop dist
gh release create v0.2.0 apps/desktop/release/Helix-0.2.0-arm64.dmg --title "Helix 0.2.0" --generate-notes
```

The tag must be `v` plus the version in `package.json`. Drafts and pre-releases are never offered.
To try the dialog without publishing, point the check at any repository with a newer release:
`HELIX_UPDATE_REPO=electron/electron pnpm --filter @helix/desktop start`.
