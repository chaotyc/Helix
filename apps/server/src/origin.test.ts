import { describe, expect, it } from "vitest";
import { allowedOrigin } from "./origin.ts";

describe("allowedOrigin", () => {
  it("allows the Mac app's window, the Vite dev server, and scripts with no origin", () => {
    expect(allowedOrigin("http://127.0.0.1:53412")).toBe(true);
    expect(allowedOrigin("http://localhost:5173")).toBe(true);
    expect(allowedOrigin(undefined)).toBe(true);
  });

  it("refuses any other website, including look-alikes", () => {
    expect(allowedOrigin("https://example.com")).toBe(false);
    expect(allowedOrigin("http://localhost.example.com")).toBe(false);
    expect(allowedOrigin("null")).toBe(false); // a sandboxed or file:// page
  });
});
