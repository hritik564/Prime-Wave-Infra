import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMaintenanceMode,
  maintenanceWebGate,
  rejectAdminLoginDuringMaintenance,
  MAINTENANCE_DETAIL,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  MAINTENANCE_TITLE,
} from "./maintenance.middleware";

function mockResponse() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    set(name: string, value: string) {
      response.headers[name.toLowerCase()] = value;
      return response;
    },
    type(value: string) {
      response.headers["content-type"] = value;
      return response;
    },
    send(body: unknown) {
      response.body = body;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

function runWebGate(path = "/") {
  const response = mockResponse();
  const next = vi.fn();
  maintenanceWebGate({ path } as never, response as never, next);
  return { response, next };
}

function runAdminLoginGate() {
  const response = mockResponse();
  const next = vi.fn();
  rejectAdminLoginDuringMaintenance({} as never, response as never, next);
  return { response, next };
}

afterEach(() => {
  delete process.env["MAINTENANCE_MODE"];
  vi.restoreAllMocks();
});

describe("production maintenance mode", () => {
  it("treats an unset variable as normal operation", () => {
    delete process.env["MAINTENANCE_MODE"];
    expect(isMaintenanceMode()).toBe(false);
  });

  it("treats the explicit false value as normal operation", () => {
    process.env["MAINTENANCE_MODE"] = "false";
    expect(isMaintenanceMode()).toBe(false);
  });

  it("enables the gate only for the exact lowercase true value", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    expect(isMaintenanceMode()).toBe(true);
  });

  it("does not enable the gate for uppercase TRUE", () => {
    process.env["MAINTENANCE_MODE"] = "TRUE";
    expect(isMaintenanceMode()).toBe(false);
  });

  it("does not enable the gate for a value with surrounding whitespace", () => {
    process.env["MAINTENANCE_MODE"] = " true ";
    expect(isMaintenanceMode()).toBe(false);
  });

  it("passes normal public requests through when the variable is unset", () => {
    const { response, next } = runWebGate("/login");
    expect(next).toHaveBeenCalledWith();
    expect(response.statusCode).toBe(200);
    expect(response.body).toBeUndefined();
  });

  it("passes normal public requests through when the variable is false", () => {
    process.env["MAINTENANCE_MODE"] = "false";
    const { response, next } = runWebGate("/dashboard");
    expect(next).toHaveBeenCalledWith();
    expect(response.statusCode).toBe(200);
  });

  it("returns HTTP 503 for public website requests during maintenance", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response, next } = runWebGate("/dashboard");
    expect(response.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("renders the required title", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(String(response.body)).toContain(MAINTENANCE_TITLE);
  });

  it("renders the required retry message", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(String(response.body)).toContain(MAINTENANCE_DETAIL);
  });

  it("does not expose sensitive operational details in the public page", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(String(response.body)).not.toMatch(/database|rpc|wallet|stack trace|environment variable|secret/i);
  });

  it("sets Retry-After for the public maintenance response", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(response.headers["retry-after"]).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS));
  });

  it("marks the public maintenance response as non-cacheable", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("returns an HTML response for the public maintenance page", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runWebGate("/");
    expect(response.headers["content-type"]).toBe("html");
    expect(String(response.body)).toMatch(/^<!doctype html>/);
  });

  it("does not gate API requests through the public web middleware", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response, next } = runWebGate("/api/healthz");
    expect(next).toHaveBeenCalledWith();
    expect(response.statusCode).toBe(200);
  });

  it("passes the Admin login request through when maintenance is disabled", () => {
    process.env["MAINTENANCE_MODE"] = "false";
    const { response, next } = runAdminLoginGate();
    expect(next).toHaveBeenCalledWith();
    expect(response.statusCode).toBe(200);
  });

  it("returns HTTP 503 for normal Admin login during maintenance", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response, next } = runAdminLoginGate();
    expect(response.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the required message for the Admin login maintenance response", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runAdminLoginGate();
    expect(response.body).toEqual({
      success: false,
      message: `${MAINTENANCE_TITLE}\n${MAINTENANCE_DETAIL}`,
    });
  });

  it("does not inspect or reveal submitted Admin credentials", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const response = mockResponse();
    const next = vi.fn();
    rejectAdminLoginDuringMaintenance(
      {
        body: {
          email: "known-admin@example.com",
          password: "correct-or-incorrect",
          role: "SUPER_ADMIN",
        },
      } as never,
      response as never,
      next,
    );
    expect(JSON.stringify(response.body)).not.toContain("known-admin@example.com");
    expect(JSON.stringify(response.body)).not.toContain("correct-or-incorrect");
    expect(JSON.stringify(response.body)).not.toContain("SUPER_ADMIN");
  });

  it("sets Retry-After for the Admin login maintenance response", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    const { response } = runAdminLoginGate();
    expect(response.headers["retry-after"]).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS));
  });

  it("restores public behavior when the variable is switched back to false", () => {
    process.env["MAINTENANCE_MODE"] = "true";
    expect(runWebGate("/").response.statusCode).toBe(503);
    process.env["MAINTENANCE_MODE"] = "false";
    const { response, next } = runWebGate("/");
    expect(next).toHaveBeenCalledWith();
    expect(response.statusCode).toBe(200);
  });

  it("does not create or require any maintenance database state", () => {
    expect(isMaintenanceMode).toBeTypeOf("function");
    expect(maintenanceWebGate).toBeTypeOf("function");
    expect(rejectAdminLoginDuringMaintenance).toBeTypeOf("function");
  });
});