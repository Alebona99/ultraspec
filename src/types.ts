export type Phase = string;
export type Track = "greenfield" | "brownfield";
export type Decision = "allow" | "deny" | "block" | "nudge";

export interface GateConfig {
  requires: string[];
  requires_approval: boolean;
}

export interface UsConfig {
  state_file: string;
  workflows_dir: string;
  handoffs_dir: string;
  memory_dir: string;
  phase_order: Phase[];
  code_edit_allowed_from: Phase;
  commit_allowed_phases: Phase[];
  stop_gated_phases: Phase[];
  protected_always_globs: string[];
  protected_globs: string[];
  always_allowed_globs: string[];
  phase_commands: Record<string, string>;
  gates: Record<string, GateConfig>;
  agent_instructions: string;
  memory: { enabled: boolean };
  handoff: { nudge_threshold: number };
}

export interface GateState extends GateConfig {
  human_approved: boolean;
}

export interface SessionLogEntry {
  at: string;
  session_id: string | null;
  event: string;
  note: string;
}

export interface HistoryEntry {
  at: string;
  event: string;
  [k: string]: unknown;
}

export interface UsState {
  workflow: string;
  track: Track;
  phase: Phase;
  phases_done: Phase[];
  harness: string | null;
  artifacts_dir: string;
  gates: Record<string, GateState>;
  session_log: SessionLogEntry[];
  last_handoff_at: string | null;
  last_session_id: string | null;
  last_session_at: string | null;
  nudge_marker: number | null;
  history: HistoryEntry[];
  updated_at?: string;
}

export interface UsEnv {
  root: string;       // US_ROOT
  dir: string;         // US_DIR ($root/ultraspec)
  configPath: string;   // US_CONFIG
  stateFile: string;     // US_STATE_FILE
  config: UsConfig;
}

export interface NormalizedEvent {
  event:
    | "session_start" | "user_prompt" | "pre_write" | "pre_bash"
    | "post_write" | "stop" | "pre_compact" | "ignore";
  harness: string;
  cwd: string | null;
  session_id: string | null;
  target_path: string | null;
  command: string | null;
  reason: string | null;
  raw: unknown;
}

export interface NormalizedDecision {
  decision: Decision;
  reason?: string;
  context?: string;
}
