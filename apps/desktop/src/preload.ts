// What the Mac app adds to the page: calls for the API keys in the Settings tab. The page gets these
// functions and nothing else of Electron or Node (contextIsolation and sandbox are on).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("helixDesktop", {
  keyStatus: () => ipcRenderer.invoke("helix:key-status"),
  setKey: (key: string) => ipcRenderer.invoke("helix:set-key", key),
  clearKey: () => ipcRenderer.invoke("helix:clear-key"),
  keysStatus: () => ipcRenderer.invoke("helix:keys-status"),
  setProviderKey: (provider: string, key: string) => ipcRenderer.invoke("helix:set-provider-key", provider, key),
  clearProviderKey: (provider: string) => ipcRenderer.invoke("helix:clear-provider-key", provider),
});
