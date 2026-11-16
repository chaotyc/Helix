import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { ClientMsg, type ServerMsg } from "@helix/contracts";
import { openDatabase } from "./db/open.ts";
import { handle } from "./handlers.ts";
import { allowedOrigin } from "./origin.ts";
import { staticFiles } from "./static.ts";

const HOST = "127.0.0.1"; // localhost only: other machines can't connect
// 8765 in development (Vite's proxy expects it). The Mac app passes 0: any free port.
const PORT = Number(process.env.HELIX_PORT ?? 8765);
// The built UI to serve, set by the Mac app. Unset in development, where Vite serves the UI.
const WEB_DIR = process.env.HELIX_WEB_DIR;

const db = openDatabase();

// The only way the server talks to a client. Because `msg` must be a ServerMsg,
// TypeScript rejects any reply that doesn't match the contract.
function send(socket: WebSocket, msg: ServerMsg): void {
  if (socket.readyState !== socket.OPEN) return; // the client left (e.g. mid-extraction)
  socket.send(JSON.stringify(msg));
}

// Handle one incoming message. Each guard clause rejects a bad case and returns,
// so only valid data reaches the bottom.
function handleMessage(socket: WebSocket, raw: string): void {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    send(socket, { type: "error", message: "Message is not valid JSON." });
    return;
  }

  const result = ClientMsg.safeParse(data);
  if (!result.success) {
    send(socket, { type: "error", message: z.prettifyError(result.error) });
    return;
  }

  const msg = result.data;
  handle(db, msg, (reply) => send(socket, reply)).catch((err: unknown) => {
    console.error(`Failed to handle ${msg.type}:`, err);
    send(socket, { type: "error", message: err instanceof Error ? err.message : String(err) });
  });
}

const http = createServer(
  WEB_DIR ? staticFiles(WEB_DIR) : (_req, res) => res.writeHead(404).end("In development the UI is served by Vite."),
);
const server = new WebSocketServer({ server: http, verifyClient: (info: { origin?: string }) => allowedOrigin(info.origin) });

http.on("listening", () => {
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`Helix server listening on http://${HOST}:${port}`);
  // Started by the Mac app: tell it where to point the window.
  const parentPort = (process as { parentPort?: { postMessage(message: unknown): void } }).parentPort;
  parentPort?.postMessage({ type: "listening", port });
});

http.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Is the server already running in another tab?`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});

server.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("message", (data) => handleMessage(socket, data.toString()));
  socket.on("close", () => console.log("Client disconnected"));
});

http.listen(PORT, HOST);
