// What the desktop app adds to the page (apps/desktop/src/preload.ts). Null in a browser, where the
// keys live in apps/server/.env instead.
export type KeyStatus = { saved: boolean; canEncrypt: boolean };

// The providers whose API keys the app keeps: the connections of kind "api".
export type KeyProvider = "anthropic" | "openai" | "google" | "xai" | "meta";
export type KeysStatus = { saved: Record<KeyProvider, boolean>; canEncrypt: boolean };

export type DesktopBridge = {
  platform?: string; // "darwin" (macOS), "win32", or "linux"; optional: older app builds (macOS only) lack it
  // The Anthropic key alone (the first version of the bridge).
  keyStatus: () => Promise<KeyStatus>;
  setKey: (key: string) => Promise<void>; // restarts the server and reloads the window
  clearKey: () => Promise<void>;
  // Any provider's key. Saving or removing one restarts the server and reloads the window.
  keysStatus: () => Promise<KeysStatus>;
  setProviderKey: (provider: KeyProvider, key: string) => Promise<void>;
  clearProviderKey: (provider: KeyProvider) => Promise<void>;
  onFullScreen?: (listener: (fullScreen: boolean) => void) => void; // optional: older app builds lack it
};

export const desktop: DesktopBridge | null = (window as { helixDesktop?: DesktopBridge }).helixDesktop ?? null;

// The operating system the desktop app runs on, or null in a browser.
export const desktopPlatform: string | null = desktop ? (desktop.platform ?? "darwin") : null;

// Only on macOS does the window have no title bar (the page draws to the top edge around the
// window's buttons). On Windows and Linux the system draws the title bar and frame.
export const hiddenTitleBar = desktopPlatform === "darwin";
