// What the desktop app adds to the page: calls for the API keys in the Settings tab, the operating
// system (the window's chrome differs: see main.ts), whether the first-run tutorial was seen, and word of the window entering or leaving full
// screen. The page gets these and nothing else of Electron or Node (contextIsolation and sandbox
// are on; a sandboxed preload still has process.platform).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("helixDesktop", {
  platform: process.platform, // "darwin", "win32", or "linux"
  keyStatus: () => ipcRenderer.invoke("helix:key-status"),
  setKey: (key: string) => ipcRenderer.invoke("helix:set-key", key),
  clearKey: () => ipcRenderer.invoke("helix:clear-key"),
  keysStatus: () => ipcRenderer.invoke("helix:keys-status"),
  setProviderKey: (provider: string, key: string) => ipcRenderer.invoke("helix:set-provider-key", provider, key),
  clearProviderKey: (provider: string) => ipcRenderer.invoke("helix:clear-provider-key", provider),
  tutorialSeen: () => ipcRenderer.invoke("helix:tutorial-seen"),
  markTutorialSeen: () => ipcRenderer.invoke("helix:mark-tutorial-seen"),
  onFullScreen: (listener: (fullScreen: boolean) => void) => {
    ipcRenderer.on("helix:full-screen", (_event, fullScreen: boolean) => listener(fullScreen));
  },
});
