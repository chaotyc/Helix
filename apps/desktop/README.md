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

The app isn't signed by a registered developer, so the first launch needs right-click → Open.
