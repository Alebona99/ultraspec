import * as fs from "node:fs";
import * as path from "node:path";
import type { UsConfig, UsEnv, UsState, HistoryEntry } from "../types.js";

export function findRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, "ultraspec", "us.config.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveEnv(cwd: string): UsEnv | null {
  const root = findRoot(cwd);
  if (!root) return null;
  const dir = path.join(root, "ultraspec");
  const configPath = path.join(dir, "us.config.json");
  const config: UsConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rel = config.state_file || "ultraspec/.us-state.json";
  const stateFile = path.join(root, rel);
  return { root, dir, configPath, stateFile, config };
}

function shapeIsValid(v: unknown): v is UsState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.workflow === "string" &&
    (s.track === "greenfield" || s.track === "brownfield") &&
    typeof s.phase === "string" &&
    Array.isArray(s.phases_done) &&
    typeof s.gates === "object" && s.gates !== null &&
    Array.isArray(s.session_log) &&
    Array.isArray(s.history)
  );
}

export function readState(env: UsEnv): { state: UsState | null; valid: boolean } {
  if (!fs.existsSync(env.stateFile)) return { state: null, valid: false };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(env.stateFile, "utf8"));
  } catch {
    return { state: null, valid: false };
  }
  if (!shapeIsValid(raw)) return { state: null, valid: false };
  return { state: raw, valid: true };
}

export function stateActive(env: UsEnv): boolean {
  return readState(env).valid;
}

export function writeState(env: UsEnv, state: UsState): void {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const withStamp = { ...state, updated_at: now };
  fs.mkdirSync(path.dirname(env.stateFile), { recursive: true });
  const tmp = `${env.stateFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(withStamp, null, 2));
  fs.renameSync(tmp, env.stateFile);
}

export function patchState(env: UsEnv, fn: (s: UsState) => UsState): UsState | null {
  const { state, valid } = readState(env);
  if (!valid || !state) return null;
  const next = fn(state);
  writeState(env, next);
  return next;
}

export function logSession(env: UsEnv, event: string, note: string, sessionId?: string): void {
  patchState(env, (s) => ({
    ...s,
    session_log: [...s.session_log, { at: nowIso(), session_id: sessionId ?? null, event, note }],
    last_session_id: sessionId || s.last_session_id,
  }));
}

export function appendHistory(env: UsEnv, entry: Omit<HistoryEntry, "at">): void {
  patchState(env, (s) => ({ ...s, history: [...s.history, { ...entry, at: nowIso() }] }));
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

// generic config accessor: cfg(env, "code_edit_allowed_from", "build")
export function cfg<T>(env: UsEnv, key: keyof UsConfig, def: T): T {
  const v = env.config[key];
  return (v === undefined || v === null) ? def : (v as unknown as T);
}

export function phaseIndex(env: UsEnv, phase: string): number {
  return env.config.phase_order.indexOf(phase);
}
