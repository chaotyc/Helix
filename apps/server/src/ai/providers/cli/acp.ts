// A minimal Agent Client Protocol (ACP) client: the standard way editors talk to coding agents.
// JSON-RPC 2.0, one message per line over the agent's stdin and stdout. Helix asks the agent for
// one reply and offers it nothing: no files, no terminal, and every permission request refused.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

type Message = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
};

export type AcpOptions = { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };

export class AcpClient {
  #child: ChildProcessWithoutNullStreams;
  #nextId = 1;
  #pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  #notify: (method: string, params: Record<string, unknown>) => void = () => {};
  #stderr = "";
  #exited: Error | null = null;

  constructor(options: AcpOptions) {
    this.#child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (text: string) => (this.#stderr = (this.#stderr + text).slice(-4000)));
    this.#child.stdin.on("error", () => {});
    createInterface({ input: this.#child.stdout }).on("line", (line) => this.#receive(line));
    const fail = (err: Error) => {
      this.#exited = err;
      for (const { reject } of this.#pending.values()) reject(err);
      this.#pending.clear();
    };
    this.#child.on("error", fail);
    this.#child.on("exit", (code) => fail(new Error(`the agent exited (code ${code}). ${this.#stderr.trim().split("\n").slice(-3).join(" ")}`.trim())));
  }

  onNotification(handler: (method: string, params: Record<string, unknown>) => void): void {
    this.#notify = handler;
  }

  request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (this.#exited) return Promise.reject(this.#exited);
    const id = this.#nextId++;
    this.#write({ jsonrpc: "2.0", id, method, params });
    return new Promise<T>((resolve, reject) => this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject }));
  }

  close(): void {
    this.#child.stdin.end();
    this.#child.kill("SIGTERM");
  }

  #write(message: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string): void {
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      return; // a log line on stdout
    }
    // A reply to one of our requests.
    if (msg.id !== undefined && msg.method === undefined) {
      const pending = this.#pending.get(Number(msg.id));
      if (!pending) return;
      this.#pending.delete(Number(msg.id));
      if (msg.error) pending.reject(new Error(msg.error.message ?? `error ${msg.error.code}`));
      else pending.resolve(msg.result);
      return;
    }
    // A request from the agent: refuse it. Permission requests get "cancelled", their polite no.
    if (msg.id !== undefined && msg.method) {
      if (msg.method === "session/request_permission") {
        this.#write({ jsonrpc: "2.0", id: msg.id, result: { outcome: { outcome: "cancelled" } } });
      } else {
        this.#write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Helix offers no tools." } });
      }
      return;
    }
    if (msg.method) this.#notify(msg.method, msg.params ?? {});
  }
}
