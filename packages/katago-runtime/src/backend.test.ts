import { describe, expect, it } from "vitest";
import {
  BackendUnavailableError,
  isBackendPreference,
  resolveBackend,
} from "./backend";
import type { BackendCapabilities } from "./types";

describe("resolveBackend", () => {
  it("prefers WebGPU, then WebGL, then WASM in auto mode", () => {
    expect(resolveBackend("auto", { wasm: true, webgl: true, webgpu: true })).toBe("webgpu");
    expect(resolveBackend("auto", { wasm: true, webgl: true, webgpu: false })).toBe("webgl");
    expect(resolveBackend("auto", { wasm: true, webgl: false, webgpu: false })).toBe("wasm");
  });

  it("uses an explicitly requested available backend", () => {
    const capabilities: BackendCapabilities = { wasm: true, webgl: true, webgpu: true };
    expect(resolveBackend("wasm", capabilities)).toBe("wasm");
    expect(resolveBackend("webgl", capabilities)).toBe("webgl");
    expect(resolveBackend("webgpu", capabilities)).toBe("webgpu");
  });

  it("does not silently fall back when an explicit backend is unavailable", () => {
    expect(() => resolveBackend("webgpu", { wasm: true, webgl: true, webgpu: false }))
      .toThrow(BackendUnavailableError);
    expect(() => resolveBackend("webgl", { wasm: true, webgl: false, webgpu: true }))
      .toThrow(BackendUnavailableError);
  });

  it("fails clearly when auto mode has no usable backend", () => {
    expect(() => resolveBackend("auto", { wasm: false, webgl: false, webgpu: false }))
      .toThrow(/No supported inference backend/);
  });
});

describe("isBackendPreference", () => {
  it.each(["auto", "wasm", "webgl", "webgpu"])("accepts %s", value => {
    expect(isBackendPreference(value)).toBe(true);
  });

  it.each(["cpu", "cuda", "", null, 1])("rejects %s", value => {
    expect(isBackendPreference(value)).toBe(false);
  });
});
