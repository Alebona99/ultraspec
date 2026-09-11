import { describe, it, expect } from "vitest";
import type { UsState, NormalizedDecision } from "../src/types.js";

describe("types", () => {
  it("a minimal UsState literal satisfies the shape", () => {
    const s: UsState = {
      workflow: "w", track: "greenfield", phase: "intake", phases_done: [],
      harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {},
      session_log: [], last_handoff_at: null, last_session_id: null,
      last_session_at: null, nudge_marker: null, history: [],
    };
    expect(s.phase).toBe("intake");
  });
  it("a decision literal satisfies the shape", () => {
    const d: NormalizedDecision = { decision: "allow" };
    expect(d.decision).toBe("allow");
  });
});
