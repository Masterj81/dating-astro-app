import { describe, expect, it } from "vitest";
import { checkBasicAuthHeader } from "../dashboard-auth.js";

// The full dashboard server is deliberately not started here (it opens a
// socket and registers setInterval schedulers). We test only the pure auth
// decision so the expected-behaviour matrix stays explicit.

function basicHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

describe("checkBasicAuthHeader", () => {
  it("allows any request when no token is configured", () => {
    expect(checkBasicAuthHeader(undefined, "")).toBe(true);
    expect(checkBasicAuthHeader("Basic foo", "")).toBe(true);
  });

  it("rejects missing Authorization when a token is required", () => {
    expect(checkBasicAuthHeader(undefined, "secret")).toBe(false);
    expect(checkBasicAuthHeader("", "secret")).toBe(false);
  });

  it("rejects non-Basic auth schemes", () => {
    expect(checkBasicAuthHeader("Bearer secret", "secret")).toBe(false);
  });

  it("accepts the correct token regardless of username", () => {
    expect(checkBasicAuthHeader(basicHeader("anyone", "secret"), "secret")).toBe(true);
    expect(checkBasicAuthHeader(basicHeader("", "secret"), "secret")).toBe(true);
  });

  it("rejects the wrong token", () => {
    expect(checkBasicAuthHeader(basicHeader("anyone", "wrong"), "secret")).toBe(false);
  });

  it("rejects a token prefix (length check defeats timing-free prefix attacks)", () => {
    expect(checkBasicAuthHeader(basicHeader("anyone", "secre"), "secret")).toBe(false);
    expect(checkBasicAuthHeader(basicHeader("anyone", "secrett"), "secret")).toBe(false);
  });

  it("handles malformed base64 without crashing", () => {
    expect(checkBasicAuthHeader("Basic !!!not-base64!!!", "secret")).toBe(false);
  });

  it("rejects a payload missing the colon separator", () => {
    const payload = Buffer.from("no-colon-here").toString("base64");
    expect(checkBasicAuthHeader(`Basic ${payload}`, "secret")).toBe(false);
  });
});
