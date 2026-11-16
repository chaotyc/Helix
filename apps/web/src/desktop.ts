// What the Mac app adds to the page (apps/desktop/src/preload.ts). Null in a browser, where the
// key lives in apps/server/.env instead.
export type KeyStatus = { saved: boolean; canEncrypt: boolean };

export type DesktopBridge = {
  keyStatus: () => Promise<KeyStatus>;
  setKey: (key: string) => Promise<void>; // restarts the server and reloads the window
  clearKey: () => Promise<void>;
};

export const desktop: DesktopBridge | null = (window as { helixDesktop?: DesktopBridge }).helixDesktop ?? null;
