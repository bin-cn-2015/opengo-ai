import type { BackendCapabilities, BackendPreference, InferenceBackend } from "./types";

const AUTO_BACKEND_ORDER: readonly InferenceBackend[] = ["webgpu", "webgl", "wasm"];

export class BackendUnavailableError extends Error {
  readonly backend: InferenceBackend;

  constructor(backend: InferenceBackend) {
    super(`Requested inference backend "${backend}" is not available in this environment.`);
    this.name = "BackendUnavailableError";
    this.backend = backend;
  }
}

/**
 * Resolve a backend without silently changing an explicitly requested target.
 * "auto" prefers WebGPU, then WebGL, then the portable WASM implementation.
 */
export function resolveBackend(
  preference: BackendPreference,
  capabilities: BackendCapabilities,
): InferenceBackend {
  if (preference !== "auto") {
    if (!capabilities[preference]) {
      throw new BackendUnavailableError(preference);
    }
    return preference;
  }

  for (const backend of AUTO_BACKEND_ORDER) {
    if (capabilities[backend]) return backend;
  }

  throw new Error("No supported inference backend is available (WASM, WebGL, WebGPU).");
}

/** Narrow untrusted configuration values before passing them to resolveBackend. */
export function isBackendPreference(value: unknown): value is BackendPreference {
  return value === "auto" || value === "wasm" || value === "webgl" || value === "webgpu";
}
