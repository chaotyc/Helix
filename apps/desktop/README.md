# desktop: the Helix app for macOS, Windows, and Linux

Electron shell that starts the Helix server (in Electron's own Node), waits until it's listening,
and opens a window on it. The server serves the built UI on the same port as its WebSocket.

- **Data** (database, encrypted API keys, `server.log`) lives in the system's per-user app folder:
  `~/Library/Application Support/Helix` on macOS, `%APPDATA%\Helix` on Windows, `~/.config/Helix`
  on Linux. `HELIX_DATA_DIR` points it elsewhere, for testing.
- **API keys** are entered in Settings and encrypted with the system's secret store (Electron's
  `safeStorage`): the macOS keychain, Windows' DPAPI, or a Linux keyring (GNOME Keyring, KWallet,
  or another Secret Service). On Linux without a keyring Electron would fall back to a fixed,
  publicly known password, so Helix refuses to save keys there and Settings says so. Keys can
  still come from the environment (`ANTHROPIC_API_KEY=… helix`).
- **Window**: on macOS the window has no title bar and the UI draws around the traffic lights. On
  Windows and Linux it keeps the system's title bar; the menu bar appears when you press Alt.
- **Subscription tools** (Claude Code, Codex, ...) are found on `PATH` and in the usual install
  folders for each OS. On Windows, npm installs them as `.cmd` batch files, which can't start without
  `cmd.exe`, and `cmd.exe` would reinterpret Helix's arguments (prompts, JSON schemas). Helix reads
  the batch file instead and starts `node <the tool's script>` itself
  (`apps/server/src/ai/providers/cli/windows-shim.ts`).

## Building

```bash
pnpm --filter @helix/desktop start        # build, then run the app without packaging
pnpm --filter @helix/desktop dist         # package for this computer's OS and processor
pnpm --filter @helix/desktop dist:mac     # both macOS dmgs (Apple silicon and Intel), on a Mac
pnpm --filter @helix/desktop dist:win     # the Windows installer
pnpm --filter @helix/desktop dist:linux   # the Linux AppImage and deb
pnpm --filter @helix/desktop icon         # rebuild assets/icon.icns and icon.png (macOS only)
```

Everything lands in `apps/desktop/release/`. `dist:win` and `dist:linux` also work from a Mac,
which is handy for checking the packaging; the release workflow builds each OS on its own runner.
The icons in `assets/` are committed, so `icon` (which uses macOS's `sips` and `iconutil`) is only
needed when the icon changes; electron-builder makes the Windows and Linux icons from them.

| File | For |
| --- | --- |
| `Helix-<version>-arm64.dmg` | macOS, Apple silicon |
| `Helix-<version>-x64.dmg` | macOS, Intel |
| `Helix-Setup-<version>-x64.exe` | Windows (installs for the current user, no administrator rights) |
| `Helix-<version>-x86_64.AppImage` | Linux, any distribution |
| `Helix-<version>-amd64.deb` | Debian, Ubuntu, and their relatives |

The packaging settings are in `electron-builder.config.mjs`.

### Signing

The builds are unsigned (on macOS, signed ad hoc, the minimum Apple silicon runs). Signing turns on
by itself when certificates are present, locally as environment variables or in the release
workflow as repository secrets (Settings → Secrets and variables → Actions):

| Secret | Environment variable | What |
| --- | --- | --- |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | `CSC_LINK`, `CSC_KEY_PASSWORD` | Developer ID Application certificate (.p12, base64) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | the same | notarization, with the certificate |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | the same | Windows code-signing certificate (.pfx, base64) |

With a macOS certificate the app is signed with the hardened runtime and the entitlements in
`assets/entitlements.mac.plist`, and notarized when the Apple ID secrets are set too.

## Releases

1. Raise `"version"` in `apps/desktop/package.json` (e.g. `0.2.0`), commit, and merge to main.
2. Tag that commit and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The **Release** workflow (`.github/workflows/release.yml`) checks that the tag is `v` plus the
   version in `package.json` (and stops if not), builds on macOS, Windows, and Linux, and creates a
   **draft** release with the five files above and generated notes.
4. Review the draft on GitHub (Releases): try the files, edit the notes.
5. Publish it. Only published releases reach users: the app's update check skips drafts and
   pre-releases.

To try the builds without releasing, run the workflow by hand (Actions → Release → Run workflow)
on a branch: the files are kept on the run (Artifacts) and no release is made. Run on a tag, it
does the same as pushing the tag. A tag pushed with the wrong version: delete it
(`git push --delete origin v0.2.0`, `git tag -d v0.2.0`), fix, and tag again.

## First launch of an unsigned build

**macOS.** The first open is blocked ("Apple could not verify Helix is free of malware"). Click
**Done**, then open **System Settings → Privacy & Security**, scroll to Security, and click
**Open Anyway** next to the message about Helix; confirm with your password, then **Open**. (On
recent macOS, right-click → Open no longer gets past this.) macOS asks again for each new download.

**Windows.** SmartScreen shows "Windows protected your PC". Click **More info**, then **Run
anyway**. Helix installs for you alone (under `%LOCALAPPDATA%\Programs`) and starts; uninstall it from
Settings → Apps. Your data in `%APPDATA%\Helix` is kept.

**Linux.**
- AppImage: make it executable and run it: `chmod +x Helix-*.AppImage && ./Helix-*.AppImage`.
  It needs FUSE 2 (`sudo apt install libfuse2`, or `libfuse2t64` on Ubuntu 24.04). Ubuntu 24.04 and
  later restrict the sandbox Electron uses; if the AppImage stops with a sandbox error, use the
  deb, which installs the AppArmor profile that allows it.
- deb: `sudo apt install ./Helix-*-amd64.deb`, then start Helix from the app menu.
- To save API keys you need a keyring: GNOME Keyring or KWallet, which most desktops run already,
  and `libsecret` (the deb depends on it).

## Updates

On launch, the packaged app asks GitHub for the latest release of `chaotyc/Helix`. If it's newer
than the app's own version, a dialog offers **Download**, **Later**, or **Skip This Version**.
Nothing installs itself: without a Developer ID, macOS won't let the app replace itself. If the
check fails (offline, GitHub down), the app says nothing and notes it in `server.log`. For now
the download link is the Apple silicon dmg (`-arm64.dmg`), or the release page when there's none.

To try the dialog without publishing, point the check at any repository with a newer release:
`HELIX_UPDATE_REPO=electron/electron pnpm --filter @helix/desktop start`.
