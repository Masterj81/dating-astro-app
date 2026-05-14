import { describe, expect, it } from "vitest";
import { isCloudScheduled } from "../cloud-scheduler.js";

// Mocks for fetch / Anthropic / Supabase are out of scope for Step 1 — see
// the runbook in marketingagent/CLOUD-RUNBOOK.md for the manual smoke test
// that exercises the full path. This file covers only the pure decision
// helper that drives the dashboard guard.

describe("isCloudScheduled", () => {
  it("returns true when scheduledServerId is a non-empty string", () => {
    expect(isCloudScheduled({ scheduledServerId: "abc-123" })).toBe(true);
  });

  it("returns false when scheduledServerId is missing", () => {
    expect(isCloudScheduled({})).toBe(false);
  });

  it("returns false when scheduledServerId is an empty string", () => {
    expect(isCloudScheduled({ scheduledServerId: "" })).toBe(false);
  });

  it("returns false when scheduledServerId is undefined explicitly", () => {
    expect(isCloudScheduled({ scheduledServerId: undefined })).toBe(false);
  });
});
