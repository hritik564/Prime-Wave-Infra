import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { authLimiter } from "../../middleware/rateLimiter.middleware";

describe("auth rate limiting", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  it("limits authentication/reset attempts to ten requests per window", async () => {
    const app = express();
    app.post("/auth-test", authLimiter, (_req, res) => {
      res.status(200).json({ success: true });
    });

    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const url = `http://127.0.0.1:${address.port}/auth-test`;

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push((await fetch(url, { method: "POST" })).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});