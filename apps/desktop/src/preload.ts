// What the Mac app adds to the page: three calls for the API key in the Settings tab, and word of
// the window entering or leaving full screen. The page gets these functions and nothing else of
// Electron or Node (contextIsolation and sandbox are on).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("helixDesktop", {
  keyStatus: () => ipcRenderer.invoke("helix:key-status"),
  setKey: (key: string) => ipcRenderer.invoke("helix:set-key", key),
  clearKey: () => ipcRenderer.invoke("helix:clear-key"),
  onFullScreen: (listener: (fullScreen: boolean) => void) => {
    ipcRenderer.on("helix:full-screen", (_event, fullScreen: boolean) => listener(fullScreen));
  },
});
