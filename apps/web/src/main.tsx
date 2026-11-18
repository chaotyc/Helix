import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";
import { connect } from "./connection.ts";
import { desktop, hiddenTitleBar } from "./desktop.ts";

// In the desktop app on macOS the window has no title bar. The hidden-title-bar flag lets the CSS
// leave room for the window's buttons and turn the top strips into handles that move the window
// (see index.css). In full screen the window buttons are hidden, so that room isn't needed.
// On Windows and Linux the window keeps the system's title bar, so neither is needed.
if (desktop) {
  document.documentElement.dataset.desktop = "";
  if (hiddenTitleBar) document.documentElement.dataset.hiddenTitleBar = "";
  desktop.onFullScreen?.((fullScreen) => {
    if (fullScreen) document.documentElement.dataset.fullScreen = "";
    else delete document.documentElement.dataset.fullScreen;
  });
}

// Open the server connection once, at startup, outside React.
// (Inside a component, StrictMode would run it twice in development and open two sockets.)
connect();

// Find the empty <div id="root"> in index.html and let React draw the app inside it.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
