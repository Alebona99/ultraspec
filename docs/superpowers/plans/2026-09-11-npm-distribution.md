# Distribuzione npm di ultraspec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere ultraspec (state machine, hook, adapter) da bash+jq a
TypeScript/Node, pubblicarlo su npm mantenendo anche la via plugin/marketplace
di Claude Code dallo stesso `dist/`, e aggiungere `ultraspec init`/`ultraspec
update` per scaffoldare/aggiornare un progetto ospite senza copiare a mano il
codice del tool.

**Architecture:** Porting 1:1 del contratto esistente (evento normalizzato →
decisione normalizzata, `.us-state.json` come unica fonte di verità, gate
deterministici) da moduli bash a moduli TypeScript puri e testabili
(`src/lib/*`), con due entrypoint sottili sopra la stessa logica: `src/cli.ts`
(CLI `us`/`ultraspec`, usato da entrambe le vie di installazione) e
`src/adapters/*.ts` (traduzione evento nativo ↔ normalizzato per harness).
`ultraspec init`/`update` sono comandi nuovi, non un porting.

**Tech Stack:** TypeScript, Node.js (>=18), Vitest per i test. Zero
dipendenze runtime esterne (niente `jq`, niente `commander`: parsing
argomenti a mano, come faceva `bin/us` con lo `case` bash — coerente con la
scala ponytail del progetto, `docs/design.md` D12).

**Spec:** `docs/superpowers/specs/2026-09-11-npm-distribution-design.md`

## Global Constraints

- Node >= 18, TypeScript strict mode, zero dipendenze runtime esterne (solo
  `devDependencies`: `typescript`, `vitest`, `@types/node`).
- Ogni modulo `src/lib/*.ts` è puro/testabile senza mock di filesystem dove
  possibile; dove serve I/O reale (state file, config), i test usano
  directory temporanee (`fs.mkdtempSync`), mai il repo stesso.
- Il contratto evento-normalizzato → decisione-normalizzata (`{decision:
  allow|deny|block|nudge, reason?, context?}`) NON cambia: è quello già
  documentato in `docs/design.md` e usato dai test bash esistenti — il
  porting deve produrre output bit-per-bit compatibile per gli stessi input.
- Ogni file bash sostituito va **cancellato** nello stesso task (o nel task
  finale di pulizia) — niente bash e TS in parallelo per lo stesso modulo a
  fine piano (decisione del design: "zero logica duplicata").
- Ogni task che porta un file `tests/test_*.sh` deve coprire **tutti** i casi
  di quel file (stessi input/output), non un sottoinsieme: il file bash resta
  la specifica comportamentale finché non è cancellato nello stesso task.
- Commit frequenti, un commit per step "Commit" di ogni task.

---

## File Structure

```
src/
  types.ts                 # State, Config, NormalizedEvent, Decision, UsEnv
  lib/state.ts              # findRoot, resolveEnv, config accessors, state read/write/patch/log/history
  lib/event.ts               # normalizeEvent(harness, raw): NormalizedEvent
  lib/decision.ts            # emit, globToRegExp, pathMatchesAny, relPath, phaseAllowsCode/Commit, decidePreWrite, decidePreBash
  lib/context.ts             # artifactsDirAbs, missingArtifacts, gateApproved, phaseBannerShort/Full, latestHandoff, recentHandoffBlob, sessionLogSummary, memoryBlob, stopDecision
  hooks/gate.ts               # decide(event) per pre_write/pre_bash — usa decision.ts
  hooks/banner.ts             # decide(event) per session_start/user_prompt — usa context.ts
  hooks/stopCheck.ts          # decide(event) per stop/pre_compact — usa context.ts
  hooks/nudge.ts               # decide(event) per post_write — usa context.ts + state.ts (log)
  adapters/claudeCode.ts       # nativePayload -> normalizedEvent (event.ts) + decision -> {exitCode, stdout, stderr}
  adapters/openCode.ts         # stesso ruolo, per il plugin OpenCode (chiamato in-process, non più via spawnSync)
  commands/*.ts                # cmdStart, cmdApprove, cmdAdvance, cmdReopen, cmdSetTrack, cmdStatus, cmdBoard, cmdHandoffPath, cmdHandoffDone — porting di bin/us
  init.ts                       # ultraspec init: scaffold progetto ospite
  update.ts                     # ultraspec update: rigenera file protetti, drift-check su workflow/*.md
  cli.ts                        # entrypoint: dispatch sottocomandi (start/approve/.../init/update/hook)
tests/
  lib/state.test.ts, event.test.ts, decision.test.ts, context.test.ts
  hooks/gate.test.ts, banner.test.ts, stopCheck.test.ts, nudge.test.ts
  adapters/claudeCode.test.ts, openCode.test.ts
  commands.test.ts, cli.test.ts
  init.test.ts, update.test.ts
  e2e.test.ts
adapters/opencode/plugin.ts     # riscritto per chiamare src/hooks/* in-process invece di spawnSync bash
adapters/generic-git/{install.sh,pre-commit}   # INVARIATI (git hook nativo, non ha senso in TS)
adapters/claude-code/hooks.json                 # comandi aggiornati a `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook claude-code <core>`
commands/*.md                                   # invariati nel contenuto, solo `bash ".../bin/us"` -> `node ".../dist/cli.js"`
dist/                                             # build compilata, COMMITTATA (eccezione al gitignore, la usa la via marketplace)
package.json, tsconfig.json, vitest.config.ts
```

Il bash sostituito (cancellato nei task che lo portano, o nel Task 12 se
rimasto):
`bin/us`, `hooks/us-*.sh`, `hooks/lib/us-*.sh`, `adapters/claude-code/
dispatch.sh`, `tests/*.sh`.

---

### Task 1: Scaffolding del pacchetto + tipi condivisi

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
  (aggiornato: `dist/` NON ignorato — vedi vincolo sopra), `src/types.ts`
- Test: `tests/types.test.ts` (solo uno smoke test — i tipi non hanno
  comportamento da testare direttamente, ma verifica che il modulo importi
  senza errori e che un oggetto di esempio soddisfi lo shape)

**Interfaces:**
- Produce: i tipi che ogni modulo successivo importa —

```ts
// src/types.ts
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
```

- [ ] **Step 1: `package.json`**

```json
{
  "name": "ultraspec",
  "version": "0.1.0",
  "description": "Pipeline di sviluppo imposta (discover -> spec -> plan -> build -> review -> archive) con onramp greenfield/brownfield e gate deterministici, cross-harness. Standalone.",
  "type": "module",
  "bin": { "us": "./dist/cli.js", "ultraspec": "./dist/cli.js" },
  "files": ["dist", "commands", "workflow", "templates", "adapters/generic-git", "adapters/claude-code/hooks.json", "us.config.json", "README.md", "LICENSE"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm test"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.19.0"
  },
  "license": "MIT",
  "author": { "name": "Alessio Bonanno" },
  "repository": { "type": "git", "url": "https://github.com/Alebona99/ultraspec" }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": false,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 4: rimuovi `dist/` da `.gitignore`** (se presente da uno scaffold
  precedente) — deve essere committata (vedi vincolo globale).

- [ ] **Step 5: crea `src/types.ts`** col contenuto sopra.

- [ ] **Step 6: scrivi `tests/types.test.ts`**

```ts
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
```

- [ ] **Step 7: installa le dipendenze e verifica la build**

```bash
npm install
npm run build
```
Expected: `dist/` viene creata (vuota a parte eventuali .d.ts non emessi),
nessun errore TypeScript.

- [ ] **Step 8: esegui i test**

```bash
npm test
```
Expected: 2 test PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/types.ts tests/types.test.ts package-lock.json
git commit -m "npm: scaffolding pacchetto TS + tipi condivisi"
```

---

### Task 2: `src/lib/state.ts` — porting di `hooks/lib/us-state.sh`

**Files:**
- Create: `src/lib/state.ts`
- Test: `tests/lib/state.test.ts`
- Delete (a fine task, dopo che i test passano): `hooks/lib/us-state.sh`,
  `tests/test_state.sh` (i loro casi vivono ora in `state.test.ts`)

**Interfaces:**
- Consumes: `UsConfig`, `UsState`, `UsEnv` da `src/types.ts` (Task 1)
- Produces (usato da OGNI modulo successivo):
  - `findRoot(cwd: string): string | null`
  - `resolveEnv(cwd: string): UsEnv | null`
  - `cfg<T>(env: UsEnv, path: string, def: T): T` — accessor generico su
    `env.config` (sostituisce `us_cfg`/jq filter con un getter a path
    puntato, es. `cfg(env, "code_edit_allowed_from", "build")`)
  - `phaseIndex(env: UsEnv, phase: string): number`
  - `readState(env: UsEnv): { state: UsState | null; valid: boolean }` (rc3
    bash → `valid:false`, sempre fail-open: mai lanciare)
  - `stateActive(env: UsEnv): boolean`
  - `getState<T>(env: UsEnv, pick: (s: UsState) => T): T | undefined`
  - `writeState(env: UsEnv, state: UsState): void` (scrittura atomica:
    tmp-file + rename, refresh `updated_at`)
  - `patchState(env: UsEnv, fn: (s: UsState) => UsState): UsState | null`
  - `logSession(env: UsEnv, event: string, note: string, sessionId?: string): void`
  - `appendHistory(env: UsEnv, entry: Omit<HistoryEntry, "at">): void`

- [ ] **Step 1: scrivi i test (porting di `tests/test_state.sh`, 88 righe —
  porta OGNI caso: root non trovata, root trovata risalendo più livelli,
  config assente, stato assente (fail-open), stato corrotto/non-JSON
  (fail-open), stato che non rispetta lo shape (fail-open ma testo
  ritornato), scrittura atomica, patch che concatena `session_log`, patch
  che concatena `history`, `stateActive` false su stato assente)**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findRoot, resolveEnv, readState, stateActive, writeState, patchState,
  logSession, appendHistory,
} from "../../src/lib/state.js";
import type { UsState } from "../../src/types.js";

function mkProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-state-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "ultraspec", "us.config.json"),
    JSON.stringify({
      state_file: "ultraspec/.us-state.json",
      workflows_dir: "ultraspec/workflows",
      handoffs_dir: "ultraspec/handoffs",
      memory_dir: "ultraspec/memory",
      phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
      code_edit_allowed_from: "build",
      commit_allowed_phases: ["build", "review", "archive"],
      stop_gated_phases: ["review"],
      protected_always_globs: [], protected_globs: [], always_allowed_globs: [],
      phase_commands: {}, gates: {}, agent_instructions: "auto",
      memory: { enabled: false }, handoff: { nudge_threshold: 15 },
    }),
  );
  return root;
}

const baseState: UsState = {
  workflow: "w", track: "greenfield", phase: "intake", phases_done: [],
  harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {},
  session_log: [], last_handoff_at: null, last_session_id: null,
  last_session_at: null, nudge_marker: null, history: [],
};

let root: string;
beforeEach(() => { root = mkProject(); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("findRoot / resolveEnv", () => {
  it("finds the root from a nested cwd", () => {
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findRoot(nested)).toBe(fs.realpathSync(root));
  });
  it("returns null when no ultraspec/us.config.json exists up the tree", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "us-none-"));
    expect(findRoot(other)).toBeNull();
    fs.rmSync(other, { recursive: true, force: true });
  });
  it("resolveEnv loads the config", () => {
    const env = resolveEnv(root)!;
    expect(env.config.code_edit_allowed_from).toBe("build");
  });
});

describe("readState / stateActive — fail-open", () => {
  it("no state file -> valid:false, state:null, not active", () => {
    const env = resolveEnv(root)!;
    const { valid, state } = readState(env);
    expect(valid).toBe(false);
    expect(state).toBeNull();
    expect(stateActive(env)).toBe(false);
  });
  it("corrupt (non-JSON) state -> fail-open", () => {
    const env = resolveEnv(root)!;
    fs.writeFileSync(env.stateFile, "not json");
    expect(readState(env).valid).toBe(false);
    expect(stateActive(env)).toBe(false);
  });
  it("valid state -> valid:true, active", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const { valid, state } = readState(env);
    expect(valid).toBe(true);
    expect(state?.workflow).toBe("w");
    expect(stateActive(env)).toBe(true);
  });
});

describe("writeState / patchState", () => {
  it("writeState is atomic and refreshes updated_at", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const raw = JSON.parse(fs.readFileSync(env.stateFile, "utf8"));
    expect(typeof raw.updated_at).toBe("string");
  });
  it("patchState mutates and persists", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    patchState(env, (s) => ({ ...s, phase: "discover" }));
    expect(readState(env).state?.phase).toBe("discover");
  });
});

describe("logSession / appendHistory", () => {
  it("logSession appends to session_log and sets last_session_id", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    logSession(env, "post_write", "scrittura: x", "sess-1");
    const s = readState(env).state!;
    expect(s.session_log).toHaveLength(1);
    expect(s.session_log[0].event).toBe("post_write");
    expect(s.last_session_id).toBe("sess-1");
  });
  it("appendHistory appends with a timestamp", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    appendHistory(env, { event: "advance", from: "intake", to: "discover" });
    const s = readState(env).state!;
    expect(s.history).toHaveLength(1);
    expect(s.history[0].event).toBe("advance");
    expect(typeof s.history[0].at).toBe("string");
  });
});
```

- [ ] **Step 2: esegui i test, verifica che falliscano** (i moduli non
  esistono ancora)

```bash
npx vitest run tests/lib/state.test.ts
```
Expected: FAIL con "Cannot find module '../../src/lib/state.js'".

- [ ] **Step 3: implementa `src/lib/state.ts`**

```ts
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
```

- [ ] **Step 4: esegui i test, verifica che passino**

```bash
npx vitest run tests/lib/state.test.ts
```
Expected: tutti PASS.

- [ ] **Step 5: cancella il bash sostituito**

```bash
git rm hooks/lib/us-state.sh tests/test_state.sh
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/state.ts tests/lib/state.test.ts
git commit -m "ts: porta us-state.sh -> src/lib/state.ts (rimosso bash)"
```

---

### Task 3: `src/lib/event.ts` — porting di `hooks/lib/us-event.sh`

**Files:**
- Create: `src/lib/event.ts`
- Test: `tests/lib/event.test.ts`
- Delete: `hooks/lib/us-event.sh`, `tests/test_event.sh` (86 righe — porta
  ogni caso: claude-code pre_write/pre_bash/post_write/session_start/
  user_prompt/stop/subagent_stop/pre_compact/tool-non-gestito, opencode
  tool.execute.before write/bash + after + session events, generic-git,
  passthrough per harness sconosciuto, input non-JSON)

**Interfaces:**
- Consumes: `NormalizedEvent` da `src/types.ts`
- Produces: `normalizeEvent(harness: string, raw: unknown): NormalizedEvent`
  — usata da `src/adapters/*.ts` e dalla test suite di `hooks/*`.

- [ ] **Step 1: test (porting di `tests/test_event.sh`)** — casi minimi
  riportati qui, il resto (ogni combinazione hook_event_name/tool_name di
  Claude Code, ogni kind/tool di OpenCode) va portato 1:1 dal file bash:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEvent } from "../../src/lib/event.js";

describe("normalizeEvent — claude-code", () => {
  it("PreToolUse Write -> pre_write with target_path", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: "/a/b.ts" }, cwd: "/a", session_id: "s1",
    });
    expect(ev).toMatchObject({ event: "pre_write", target_path: "/a/b.ts", cwd: "/a", session_id: "s1", harness: "claude-code" });
  });
  it("PreToolUse Bash -> pre_bash with command", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command: "git commit -m x" },
    });
    expect(ev).toMatchObject({ event: "pre_bash", command: "git commit -m x" });
  });
  it("PostToolUse Edit -> post_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PostToolUse", tool_name: "Edit",
      tool_input: { file_path: "/a/c.ts" },
    });
    expect(ev.event).toBe("post_write");
  });
  it("SessionStart -> session_start; UserPromptSubmit -> user_prompt", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "SessionStart" }).event).toBe("session_start");
    expect(normalizeEvent("claude-code", { hook_event_name: "UserPromptSubmit" }).event).toBe("user_prompt");
  });
  it("Stop and SubagentStop -> stop; PreCompact -> pre_compact", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "Stop" }).event).toBe("stop");
    expect(normalizeEvent("claude-code", { hook_event_name: "SubagentStop" }).event).toBe("stop");
    expect(normalizeEvent("claude-code", { hook_event_name: "PreCompact" }).event).toBe("pre_compact");
  });
  it("unhandled tool/event -> ignore", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Read" }).event).toBe("ignore");
    expect(normalizeEvent("claude-code", { hook_event_name: "Notification" }).event).toBe("ignore");
  });
});

describe("normalizeEvent — opencode", () => {
  it("tool.execute.before write -> pre_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before", tool: "write", args: { filePath: "/a/b.ts" },
    });
    expect(ev).toMatchObject({ event: "pre_write", target_path: "/a/b.ts" });
  });
  it("tool.execute.before bash -> pre_bash", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before", tool: "bash", args: { command: "git push" },
    });
    expect(ev).toMatchObject({ event: "pre_bash", command: "git push" });
  });
  it("tool.execute.after -> post_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.after", args: { filePath: "/a/b.ts" },
    });
    expect(ev.event).toBe("post_write");
  });
});

describe("normalizeEvent — generic-git / unknown / malformed", () => {
  it("generic-git -> pre_bash with 'git commit' default command", () => {
    const ev = normalizeEvent("generic-git", {});
    expect(ev).toMatchObject({ event: "pre_bash", command: "git commit" });
  });
  it("unknown harness -> passthrough of an already-normalized-ish payload", () => {
    const ev = normalizeEvent("mystery-agent", { event: "pre_write", target_path: "/x" });
    expect(ev).toMatchObject({ event: "pre_write", target_path: "/x", harness: "mystery-agent" });
  });
  it("non-object raw -> event ignore, harness preserved", () => {
    const ev = normalizeEvent("claude-code", "not an object" as unknown);
    expect(ev.event).toBe("ignore");
    expect(ev.harness).toBe("claude-code");
  });
});
```

- [ ] **Step 2: verifica che falliscano** (`npx vitest run tests/lib/event.test.ts` → FAIL, modulo assente)

- [ ] **Step 3: implementa `src/lib/event.ts`**

```ts
import type { NormalizedEvent } from "../types.js";

function finish(harness: string, raw: any, partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: (partial.event as NormalizedEvent["event"]) ?? "ignore",
    harness,
    cwd: raw?.cwd ?? raw?.workspace ?? raw?.directory ?? null,
    session_id: raw?.session_id ?? raw?.sessionID ?? raw?.sessionId ?? raw?.session ?? null,
    target_path: partial.target_path ?? null,
    command: partial.command ?? null,
    reason: partial.reason ?? raw?.reason ?? raw?.source ?? null,
    raw,
  };
}

function claudeCode(raw: any): NormalizedEvent {
  const hev = raw?.hook_event_name;
  const tool = raw?.tool_name;
  let partial: Partial<NormalizedEvent> = { event: "ignore" };
  const writeTools = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
  if (hev === "PreToolUse") {
    if (writeTools.includes(tool)) {
      partial = { event: "pre_write", target_path: raw?.tool_input?.file_path ?? raw?.tool_input?.path ?? raw?.tool_input?.notebook_path ?? null };
    } else if (tool === "Bash") {
      partial = { event: "pre_bash", command: raw?.tool_input?.command ?? null };
    }
  } else if (hev === "PostToolUse" && writeTools.includes(tool)) {
    partial = { event: "post_write", target_path: raw?.tool_input?.file_path ?? raw?.tool_input?.path ?? null };
  } else if (hev === "SessionStart") partial = { event: "session_start" };
  else if (hev === "UserPromptSubmit") partial = { event: "user_prompt" };
  else if (hev === "Stop" || hev === "SubagentStop") partial = { event: "stop" };
  else if (hev === "PreCompact") partial = { event: "pre_compact" };
  return finish("claude-code", raw, partial);
}

function openCode(raw: any): NormalizedEvent {
  const kind = raw?.kind ?? raw?.hook;
  const tool = raw?.tool;
  let partial: Partial<NormalizedEvent> = { event: "ignore" };
  if (kind === "tool.execute.before" || kind === "pre_tool") {
    if (["write", "edit", "patch"].includes(tool)) {
      partial = { event: "pre_write", target_path: raw?.args?.filePath ?? raw?.args?.path ?? raw?.args?.file ?? null };
    } else if (["bash", "shell"].includes(tool)) {
      partial = { event: "pre_bash", command: raw?.args?.command ?? null };
    }
  } else if (kind === "tool.execute.after" || kind === "post_tool") {
    partial = { event: "post_write", target_path: raw?.args?.filePath ?? raw?.args?.path ?? null };
  } else if (kind === "session.start" || kind === "session_start") partial = { event: "session_start" };
  else if (kind === "session.idle" || kind === "stop") partial = { event: "stop" };
  return finish("opencode", raw, partial);
}

function genericGit(raw: any): NormalizedEvent {
  return finish("generic-git", raw, { event: "pre_bash", command: raw?.command ?? "git commit" });
}

function passthrough(raw: any, harness: string): NormalizedEvent {
  return finish(harness, raw, {
    event: (raw?.event as NormalizedEvent["event"]) ?? "ignore",
    target_path: raw?.target_path ?? null,
    command: raw?.command ?? null,
  });
}

export function normalizeEvent(harness: string, raw: unknown): NormalizedEvent {
  if (typeof raw !== "object" || raw === null) {
    return { event: "ignore", harness, cwd: null, session_id: null, target_path: null, command: null, reason: null, raw };
  }
  switch (harness) {
    case "claude-code": return claudeCode(raw);
    case "opencode": return openCode(raw);
    case "generic-git": return genericGit(raw);
    default: return passthrough(raw, harness);
  }
}
```

- [ ] **Step 4: verifica che passino** (`npx vitest run tests/lib/event.test.ts`)

- [ ] **Step 5: cancella il bash** — `git rm hooks/lib/us-event.sh tests/test_event.sh`

- [ ] **Step 6: Commit** — `git commit -m "ts: porta us-event.sh -> src/lib/event.ts (rimosso bash)"`

---

### Task 4: `src/lib/decision.ts` — porting di `hooks/lib/us-decision.sh`

**Files:**
- Create: `src/lib/decision.ts`
- Test: `tests/lib/decision.test.ts`
- Delete: `hooks/lib/us-decision.sh` (la parte di `tests/test_gate.sh` che
  esercita SOLO queste funzioni pure va portata qui; la parte end-to-end via
  hook resta per il Task 6)

**Interfaces:**
- Consumes: `UsEnv` (Task 2), `stateActive/getState` da `state.ts`
- Produces:
  - `emit(decision: Decision, reason?: string, context?: string): NormalizedDecision`
  - `globToRegExp(glob: string): RegExp`
  - `pathMatchesAny(rel: string, globs: string[]): boolean`
  - `relPath(env: UsEnv, targetPath: string): string`
  - `phaseAllowsCode(env: UsEnv, state: UsState): boolean`
  - `phaseAllowsCommit(env: UsEnv, state: UsState): boolean`
  - `decidePreWrite(env: UsEnv, state: UsState, targetPath: string): NormalizedDecision`
  - `decidePreBash(env: UsEnv, state: UsState, command: string): NormalizedDecision`

- [ ] **Step 1: test** (porta ogni caso rilevante di `tests/test_gate.sh`
  100 righe che esercita glob-matching e le due decisioni: `protected_always_globs`
  vince su tutto — incluso in fase `build`; `always_allowed_globs` passa
  sempre; path non in `protected_globs` passa sempre; path protetto blocca
  prima di `code_edit_allowed_from`, passa dopo; `git commit`/`git push`
  bloccati fuori da `commit_allowed_phases`, passano dentro; comando che non
  è commit/push passa sempre; matching `**` e `*` nei glob)

```ts
import { describe, it, expect } from "vitest";
import { emit, pathMatchesAny, decidePreWrite, decidePreBash } from "../../src/lib/decision.js";
import type { UsConfig, UsEnv, UsState } from "../../src/types.js";

function mkEnv(overrides: Partial<UsConfig> = {}): UsEnv {
  const config: UsConfig = {
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: ["review"],
    protected_always_globs: ["**/.us-state.json", "ultraspec/us.config.json", "ultraspec/hooks/**"],
    protected_globs: ["src/**", "app/**"],
    always_allowed_globs: ["ultraspec/**", "docs/**", "**/*.md"],
    phase_commands: {}, gates: {}, agent_instructions: "auto",
    memory: { enabled: false }, handoff: { nudge_threshold: 15 },
    ...overrides,
  };
  return { root: "/repo", dir: "/repo/ultraspec", configPath: "/repo/ultraspec/us.config.json", stateFile: "/repo/ultraspec/.us-state.json", config };
}
function mkState(phase: string): UsState {
  return { workflow: "w", track: "greenfield", phase, phases_done: [], harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {}, session_log: [], last_handoff_at: null, last_session_id: null, last_session_at: null, nudge_marker: null, history: [] };
}

describe("emit", () => {
  it("bare allow", () => expect(emit("allow")).toEqual({ decision: "allow" }));
  it("deny with reason", () => expect(emit("deny", "no")).toEqual({ decision: "deny", reason: "no" }));
});

describe("pathMatchesAny (glob)", () => {
  it("** matches any depth", () => expect(pathMatchesAny("ultraspec/hooks/gate.sh", ["ultraspec/hooks/**"])).toBe(true));
  it("* does not cross /", () => expect(pathMatchesAny("a/b/c.ts", ["a/*.ts"])).toBe(false));
  it("no match", () => expect(pathMatchesAny("x/y.ts", ["src/**"])).toBe(false));
});

describe("decidePreWrite", () => {
  const env = mkEnv();
  it("protected_always_globs wins even in build", () => {
    const d = decidePreWrite(env, mkState("build"), "ultraspec/us.config.json");
    expect(d.decision).toBe("deny");
  });
  it("always_allowed_globs -> allow regardless of phase", () => {
    const d = decidePreWrite(env, mkState("intake"), "docs/x.md");
    expect(d.decision).toBe("allow");
  });
  it("not a protected path -> allow", () => {
    const d = decidePreWrite(env, mkState("intake"), "README.md");
    expect(d.decision).toBe("allow");
  });
  it("protected path before code_edit_allowed_from -> deny", () => {
    const d = decidePreWrite(env, mkState("plan"), "src/x.ts");
    expect(d.decision).toBe("deny");
  });
  it("protected path at/after code_edit_allowed_from -> allow", () => {
    const d = decidePreWrite(env, mkState("build"), "src/x.ts");
    expect(d.decision).toBe("allow");
    const d2 = decidePreWrite(env, mkState("review"), "src/x.ts");
    expect(d2.decision).toBe("allow");
  });
});

describe("decidePreBash", () => {
  const env = mkEnv();
  it("git commit outside commit_allowed_phases -> deny", () => {
    expect(decidePreBash(env, mkState("plan"), "git commit -m x").decision).toBe("deny");
  });
  it("git push inside commit_allowed_phases -> allow", () => {
    expect(decidePreBash(env, mkState("build"), "git push origin main").decision).toBe("allow");
  });
  it("non commit/push command -> allow", () => {
    expect(decidePreBash(env, mkState("intake"), "ls -la").decision).toBe("allow");
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa `src/lib/decision.ts`**

```ts
import type { UsEnv, UsState, NormalizedDecision, Decision } from "../types.js";
import { phaseIndex, cfg } from "./state.js";

export function emit(decision: Decision, reason?: string, context?: string): NormalizedDecision {
  const out: NormalizedDecision = { decision };
  if (reason) out.reason = reason;
  if (context) out.context = context;
  return out;
}

// glob (con ** e *) -> RegExp ancorata; stessa semantica di us_glob_to_ere
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; out += "(.*/)?"; } else out += ".*";
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === ".") out += "\\.";
    else if (/[a-zA-Z0-9_\-/]/.test(c)) out += c;
    else out += `[${c}]`;
  }
  return new RegExp(`^${out}$`);
}

export function pathMatchesAny(rel: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(rel));
}

export function relPath(env: UsEnv, targetPath: string): string {
  if (targetPath.startsWith(env.root + "/")) return targetPath.slice(env.root.length + 1);
  if (targetPath.startsWith("./")) return targetPath.slice(2);
  return targetPath;
}

export function phaseAllowsCode(env: UsEnv, state: UsState): boolean {
  const from = cfg(env, "code_edit_allowed_from", "build");
  const ci = phaseIndex(env, state.phase), fi = phaseIndex(env, from);
  return ci >= 0 && fi >= 0 && ci >= fi;
}

export function phaseAllowsCommit(env: UsEnv, state: UsState): boolean {
  return env.config.commit_allowed_phases.includes(state.phase);
}

export function decidePreWrite(env: UsEnv, state: UsState, targetPath: string): NormalizedDecision {
  const rel = relPath(env, targetPath);
  if (!rel) return emit("allow", "no target path");
  if (pathMatchesAny(rel, env.config.protected_always_globs)) {
    return emit("deny", `BLOCCATO: '${rel}' è protetto in ogni fase (stato/config/hook di ultraspec). Modifica lo stato solo tramite /ultraspec:advance, /ultraspec:approve, /ultraspec:reopen.`);
  }
  if (pathMatchesAny(rel, env.config.always_allowed_globs)) return emit("allow", "planning/docs/test path");
  if (!pathMatchesAny(rel, env.config.protected_globs)) return emit("allow", "not a protected code path");
  if (phaseAllowsCode(env, state)) return emit("allow", "phase permits code edits");
  const from = cfg(env, "code_edit_allowed_from", "build");
  return emit("deny", `BLOCCATO: fase '${state.phase}'. Le modifiche a codice (${rel}) richiedono la fase '${from}'. Avanza con /ultraspec:advance dopo aver superato i gate.`);
}

export function decidePreBash(env: UsEnv, state: UsState, command: string): NormalizedDecision {
  if (/(^|\s)git (commit|push)(\s|$)/.test(command)) {
    if (phaseAllowsCommit(env, state)) return emit("allow", "phase permits commit");
    const allowed = env.config.commit_allowed_phases.join(", ");
    return emit("deny", `BLOCCATO: 'git commit/push' non consentito in fase '${state.phase}'. Consentito solo nelle fasi: ${allowed}.`);
  }
  return emit("allow", "not a commit/push");
}
```

- [ ] **Step 4: verifica passaggio test**

- [ ] **Step 5: aggiorna `tests/test_gate.sh`** — rimuovi solo i casi ora
  coperti da `decision.test.ts`; il file resta per il Task 6 (copre ancora
  il comportamento end-to-end via hook: no-jq/no-root/no-workflow -> allow).
  Se dopo la rimozione il file è vuoto, cancellalo qui invece che al Task 6.

- [ ] **Step 6: Commit** — `git commit -m "ts: porta us-decision.sh -> src/lib/decision.ts"`

---

### Task 5: `src/lib/context.ts` — porting di `hooks/lib/us-context.sh`

**Files:**
- Create: `src/lib/context.ts`
- Test: `tests/lib/context.test.ts`
- Delete: `hooks/lib/us-context.sh`, e i casi corrispondenti di
  `tests/test_context.sh` (135 righe: banner testuale, missing_artifacts,
  gate_approved, handoff freshness by mtime, session_log summary, memory
  blob) e `tests/test_continuity.sh` (93 righe: handoff-path, freschezza
  handoff vs `last_session_at`, memory opt-in) — porta ogni caso.

**Interfaces:**
- Consumes: `UsEnv`, `UsState` da `state.ts`/`types.ts`
- Produces:
  - `artifactsDirAbs(env: UsEnv, state: UsState): string`
  - `missingArtifacts(env: UsEnv, state: UsState, phase: string): string[]`
  - `gateApproved(env: UsEnv, state: UsState, phase: string): boolean`
  - `phaseBannerShort(env: UsEnv, state: UsState): string`
  - `phaseBanner(env: UsEnv, state: UsState): string` (short + continuity)
  - `latestHandoff(env: UsEnv, state: UsState): string | null` (path assoluto)
  - `recentHandoffBlob(env: UsEnv, state: UsState): string`
  - `sessionLogSummary(state: UsState): string`
  - `memoryBlob(env: UsEnv): string`
  - `stopDecision(env: UsEnv, state: UsState, event: "stop" | "pre_compact"): NormalizedDecision`
    (usa `patchState` per il `nudge_marker`, quindi prende `env` e rilegge/
    scrive stato — a differenza delle altre funzioni "pure" sopra)

- [ ] **Step 1: test** — porta 1:1 da `test_context.sh` + `test_continuity.sh`;
  casi minimi qui, il resto va aggiunto dal file bash:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, writeState, patchState } from "../../src/lib/state.js";
import {
  missingArtifacts, gateApproved, phaseBannerShort, latestHandoff,
  sessionLogSummary, memoryBlob, stopDecision,
} from "../../src/lib/context.js";
import type { UsState } from "../../src/types.js";

function mkProject(gates: Record<string, any> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-ctx-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: ["review"], protected_always_globs: [], protected_globs: [],
    always_allowed_globs: [], phase_commands: { discover: "discover" }, gates,
    agent_instructions: "auto", memory: { enabled: false }, handoff: { nudge_threshold: 2 },
  }));
  return root;
}
const baseState: UsState = {
  workflow: "w", track: "greenfield", phase: "discover", phases_done: [],
  harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {
    discover: { requires: ["discovery.md"], requires_approval: false, human_approved: false },
  }, session_log: [], last_handoff_at: null, last_session_id: null,
  last_session_at: null, nudge_marker: null, history: [],
};

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("missingArtifacts / gateApproved", () => {
  it("reports the missing required file for the phase", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    expect(missingArtifacts(env, baseState, "discover")).toEqual(["discovery.md"]);
  });
  it("empty once the artifact exists on disk", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/discovery.md"), "x");
    expect(missingArtifacts(env, baseState, "discover")).toEqual([]);
  });
  it("gateApproved is true when requires_approval is false", () => {
    root = mkProject({ discover: { requires: [], requires_approval: false } });
    const env = resolveEnv(root)!;
    expect(gateApproved(env, baseState, "discover")).toBe(true);
  });
  it("gateApproved reflects gates.<phase>.human_approved when required", () => {
    root = mkProject({ spec: { requires: [], requires_approval: true } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: [], requires_approval: true, human_approved: false } } };
    expect(gateApproved(env, s, "spec")).toBe(false);
    expect(gateApproved(env, { ...s, gates: { spec: { ...s.gates.spec, human_approved: true } } }, "spec")).toBe(true);
  });
});

describe("phaseBannerShort", () => {
  it("includes workflow/track/phase and the phase command", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const text = phaseBannerShort(env, baseState);
    expect(text).toContain("workflow=w");
    expect(text).toContain("track=greenfield");
    expect(text).toContain("phase=discover");
    expect(text).toContain("/ultraspec:discover");
  });
});

describe("continuity", () => {
  it("sessionLogSummary is empty for an empty log", () => {
    expect(sessionLogSummary(baseState)).toBe("");
  });
  it("sessionLogSummary lists recent entries when non-empty", () => {
    const s: UsState = { ...baseState, session_log: [{ at: "2026-01-01T00:00:00Z", session_id: null, event: "post_write", note: "scrittura: x" }] };
    expect(sessionLogSummary(s)).toContain("post_write: scrittura: x");
  });
  it("latestHandoff returns null when no handoffs dir", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    expect(latestHandoff(env, baseState)).toBeNull();
  });
  it("memoryBlob empty when memory.enabled is false", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    expect(memoryBlob(env)).toBe("");
  });
});

describe("stopDecision", () => {
  it("blocks stop when the phase is stop-gated and artifacts are missing", () => {
    root = mkProject({ review: { requires: ["review.md"], requires_approval: true } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "review", gates: { review: { requires: ["review.md"], requires_approval: true, human_approved: false } } };
    writeState(env, s);
    const d = stopDecision(env, s, "stop");
    expect(d.decision).toBe("block");
  });
  it("allows stop when nothing is gated", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    expect(stopDecision(env, baseState, "stop").decision).toBe("allow");
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa `src/lib/context.ts`**

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { UsEnv, UsState, NormalizedDecision } from "../types.js";
import { cfg, patchState, nowIso } from "./state.js";
import { emit } from "./decision.js";

export function artifactsDirAbs(env: UsEnv, state: UsState): string {
  const d = state.artifacts_dir || `${cfg(env, "workflows_dir", "ultraspec/workflows")}/${state.workflow}`;
  return d.startsWith("/") ? d : path.join(env.root, d);
}

export function missingArtifacts(env: UsEnv, state: UsState, phase: string): string[] {
  const dir = artifactsDirAbs(env, state);
  const required = env.config.gates[phase]?.requires ?? [];
  return required.filter((f) => !fs.existsSync(path.join(dir, f)));
}

export function gateApproved(env: UsEnv, state: UsState, phase: string): boolean {
  const gateCfg = env.config.gates[phase];
  if (!gateCfg?.requires_approval) return true;
  return state.gates[phase]?.human_approved === true;
}

export function phaseBannerShort(env: UsEnv, state: UsState): string {
  const { phase, workflow, track } = state;
  const from = cfg(env, "code_edit_allowed_from", "build");
  const allowed = env.config.commit_allowed_phases.join(", ");
  const nextcmd = env.config.phase_commands[phase];
  const lines: string[] = [`[ultraspec] workflow=${workflow}  track=${track}  phase=${phase}`];
  const phaseIdx = env.config.phase_order.indexOf(phase);
  const fromIdx = env.config.phase_order.indexOf(from);
  if (phaseIdx >= 0 && fromIdx >= 0 && phaseIdx >= fromIdx) lines.push("Modifiche a codice: CONSENTITE in questa fase.");
  else lines.push(`BLOCCATO in questa fase: modifiche a codice di prodotto (fino alla fase "${from}") e git commit/push (consentiti in: ${allowed}).`);
  if (nextcmd) {
    lines.push(`Comando di fase: /ultraspec:${nextcmd}   (stato completo: /ultraspec:status)`);
    if (["discover", "spec", "plan", "build", "review", "archive"].includes(nextcmd)) {
      lines.push(`Azione: se non l'hai già svolta in questa sessione, esegui la procedura ultraspec/workflow/${nextcmd}.md, poi fermati al gate (artefatto + eventuale /ultraspec:approve). Non eseguire advance/approve da solo.`);
    }
  }
  const missing = missingArtifacts(env, state, phase);
  if (missing.length) lines.push(`Gate: mancano ${missing.join(", ")}`);
  else if (env.config.gates[phase]) {
    lines.push(gateApproved(env, state, phase) ? "Gate: soddisfatto — /ultraspec:advance" : `Gate: artefatti pronti, manca /ultraspec:approve ${phase}`);
  }
  return lines.join("\n");
}

export function sessionLogSummary(state: UsState): string {
  if (!state.session_log.length) return "";
  const tail = state.session_log.slice(-8);
  const lines = ["", "--- Attività recente (machine log, ultime voci) ---", ...tail.map((e) => `- ${e.event}: ${e.note}`), "Nessun /ultraspec:handoff scritto per questa sessione."];
  return lines.join("\n");
}

export function latestHandoff(env: UsEnv, state: UsState): string | null {
  const dir = path.join(env.root, cfg(env, "handoffs_dir", "ultraspec/handoffs"));
  if (!fs.existsSync(dir)) return null;
  const prefix = `${state.workflow}-`;
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(dir, files[0].f) : null;
}

export function recentHandoffBlob(env: UsEnv, state: UsState): string {
  const hf = latestHandoff(env, state);
  if (hf) {
    const hfEpoch = fs.statSync(hf).mtimeMs;
    const lastAt = state.last_session_at ? Date.parse(state.last_session_at) : 0;
    if (hfEpoch >= lastAt) {
      return `\n--- Handoff dalla sessione precedente (${path.basename(hf)}) ---\n${fs.readFileSync(hf, "utf8")}\n--- fine handoff ---\n`;
    }
  }
  return sessionLogSummary(state);
}

export function memoryBlob(env: UsEnv): string {
  if (!env.config.memory?.enabled) return "";
  const mf = path.join(env.root, cfg(env, "memory_dir", "ultraspec/memory"), "MEMORY.md");
  if (!fs.existsSync(mf)) return "";
  return `\n--- ultraspec project memory ---\n${fs.readFileSync(mf, "utf8")}\n--- fine memory ---\n`;
}

export function phaseBanner(env: UsEnv, state: UsState): string {
  return [phaseBannerShort(env, state), recentHandoffBlob(env, state), memoryBlob(env)].filter(Boolean).join("\n");
}

export function stopDecision(env: UsEnv, state: UsState, event: "stop" | "pre_compact"): NormalizedDecision {
  if (event === "stop" && env.config.stop_gated_phases.includes(state.phase)) {
    const missing = missingArtifacts(env, state, state.phase);
    if (missing.length) return emit("block", `Fase '${state.phase}' non completata: manca ${missing.join(", ")}. Completa la fase prima di chiudere il turno.`);
  }
  const threshold = cfg(env, "handoff", { nudge_threshold: 15 }).nudge_threshold || 15;
  const since = state.session_log.filter((e) => e.event === "post_write").length;
  const bucket = Math.floor(since / threshold);
  if (bucket >= 1 && state.nudge_marker !== bucket) {
    patchState(env, (s) => ({ ...s, nudge_marker: bucket }));
    return emit("nudge", "", `Molto lavoro dall'ultimo handoff (${since} scritture). Scrivi /ultraspec:handoff prima di chiudere o compattare, così la prossima sessione riparte pulita.`);
  }
  return emit("allow", `nothing to gate at ${event}`);
}
```

- [ ] **Step 4: verifica passaggio**

- [ ] **Step 5: cancella `hooks/lib/us-context.sh`**, `tests/test_context.sh`,
  `tests/test_continuity.sh`

- [ ] **Step 6: Commit** — `git commit -m "ts: porta us-context.sh -> src/lib/context.ts"`

---

### Task 6: `src/hooks/*.ts` — porting di `hooks/us-{gate,banner,stop-check,nudge}.sh`

**Files:**
- Create: `src/hooks/gate.ts`, `src/hooks/banner.ts`, `src/hooks/stopCheck.ts`, `src/hooks/nudge.ts`
- Test: `tests/hooks/gate.test.ts`, `banner.test.ts`, `stopCheck.test.ts`, `nudge.test.ts`
- Delete: `hooks/us-gate.sh`, `hooks/us-banner.sh`, `hooks/us-stop-check.sh`,
  `hooks/us-nudge.sh`, il resto di `tests/test_gate.sh` (fail-open: nessuna
  root, nessun workflow attivo -> sempre allow)

**Interfaces:**
- Consumes: `NormalizedEvent`, `resolveEnv`/`stateActive`/`readState` (state.ts),
  `decidePreWrite`/`decidePreBash` (decision.ts), `phaseBanner*`/`stopDecision`
  (context.ts), `logSession`/`missingArtifacts` per il nudge.
- Produces: ogni modulo esporta `decide(cwd: string, event: NormalizedEvent):
  NormalizedDecision` — **fail-open sempre**: nessuna root trovata o nessun
  workflow attivo → `{decision:"allow"}`, mai un'eccezione propagata al
  chiamante (try/catch interno).

- [ ] **Step 1: test** (porta i casi fail-open + i casi "happy path" di
  `tests/test_gate.sh` end-to-end rimasti dopo il Task 4)

```ts
// tests/hooks/gate.test.ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { decide as gateDecide } from "../../src/hooks/gate.js";
import type { NormalizedEvent } from "../../src/types.js";

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return { event: "pre_write", harness: "claude-code", cwd: root, session_id: null, target_path: null, command: null, reason: null, raw: {}, ...partial };
}

describe("gate.decide — fail-open", () => {
  it("no ultraspec root -> allow", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(gateDecide(root, ev({ target_path: "/x/src/a.ts" })).decision).toBe("allow");
  });
});

// analoghi per banner.test.ts (session_start senza root -> {decision:"allow"}, nessun context),
// stopCheck.test.ts (stop senza workflow attivo -> allow),
// nudge.test.ts (post_write senza workflow attivo -> allow, nessuna scrittura di stato)
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa i 4 moduli**

```ts
// src/hooks/gate.ts
import { resolveEnv, readState } from "../lib/state.js";
import { decidePreWrite, decidePreBash, emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow", "no ultraspec root");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow", "no active workflow");
  if (event.event === "pre_write" && event.target_path) return decidePreWrite(env, state, event.target_path);
  if (event.event === "pre_bash" && event.command) return decidePreBash(env, state, event.command);
  return emit("allow", `event not gated: ${event.event}`);
}
```

```ts
// src/hooks/banner.ts
import { resolveEnv, readState, patchState, nowIso } from "../lib/state.js";
import { phaseBanner, phaseBannerShort } from "../lib/context.js";
import { emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow");
  let banner: string;
  if (event.event === "user_prompt") {
    banner = phaseBannerShort(env, state);
  } else {
    banner = phaseBanner(env, state);
    patchState(env, (s) => ({ ...s, last_session_at: nowIso(), last_session_id: event.session_id || s.last_session_id }));
  }
  return banner ? emit("allow", "", banner) : emit("allow");
}
```

```ts
// src/hooks/stopCheck.ts
import { resolveEnv, readState } from "../lib/state.js";
import { stopDecision } from "../lib/context.js";
import { emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow");
  if (event.event === "stop" || event.event === "pre_compact") return stopDecision(env, state, event.event);
  return emit("allow", `event not gated: ${event.event}`);
}
```

```ts
// src/hooks/nudge.ts
import { resolveEnv, readState, logSession } from "../lib/state.js";
import { missingArtifacts } from "../lib/context.js";
import { relPath, emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow");
  const rel = event.target_path ? relPath(env, event.target_path) : "?";
  logSession(env, "post_write", `scrittura: ${rel}`, event.session_id ?? undefined);
  const missing = missingArtifacts(env, state, state.phase);
  if (missing.length) return emit("nudge", "", `Fase '${state.phase}': artefatti ancora mancanti per il gate: ${missing.join(", ")}.`);
  return emit("allow");
}
```

- [ ] **Step 4: verifica passaggio di tutti e 4**

- [ ] **Step 5: cancella `hooks/us-*.sh`, `tests/test_gate.sh`**

- [ ] **Step 6: Commit** — `git commit -m "ts: porta hooks/us-{gate,banner,stop-check,nudge}.sh"`

---

### Task 7: `src/commands/*.ts` — porting delle sottocomandi di `bin/us`

**Files:**
- Create: `src/commands/{start,setTrack,board,approve,advance,reopen,status,handoff}.ts`
- Test: `tests/commands.test.ts`
- Delete: (rimane `bin/us` fino al Task 9, quando `cli.ts` lo sostituisce
  interamente — qui si portano solo le funzioni, non ancora l'entrypoint)

**Interfaces:**
- Consumes: `resolveEnv`, `readState`, `writeState`, `patchState`,
  `appendHistory`, `nowIso` (state.ts); `missingArtifacts`, `gateApproved`
  (context.ts); `phaseIndex` (state.ts)
- Produces: ogni funzione `cmdX(env: UsEnv, args: string[]): string` (ritorna
  il testo da stampare; lancia `Error(message)` sugli stessi casi in cui
  `bin/us` chiamava `die` — il layer CLI, Task 9, cattura l'eccezione e la
  stampa su stderr con `exit 1`, replicando `die()`)

- [ ] **Step 1: test** (porta 1:1 `tests/test_cli.sh`, 139 righe: `start`
  crea lo stato iniziale in fase `intake` e rifiuta se un workflow è già
  attivo; `set-track` funziona solo in intake/discover e rifiuta altrove;
  `approve` rifiuta una fase senza gate; `advance` rifiuta con artefatti
  mancanti, rifiuta senza approvazione quando richiesta, avanza e registra
  la history; `reopen` rifiuta senza `--reason`, rifiuta di andare avanti,
  azzera le approvazioni a valle; `status --json` produce lo shape atteso)
  — casi minimi qui, il resto va portato dal bash:

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv } from "../src/lib/state.js";
import { cmdStart } from "../src/commands/start.js";
import { cmdAdvance } from "../src/commands/advance.js";
import { cmdApprove } from "../src/commands/approve.js";

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cmd-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: ["review"], protected_always_globs: [], protected_globs: [],
    always_allowed_globs: [], phase_commands: {},
    gates: { discover: { requires: ["discovery.md"], requires_approval: false } },
    agent_instructions: "auto", memory: { enabled: false }, handoff: { nudge_threshold: 15 },
  }));
  return root;
}

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("cmdStart", () => {
  it("creates state in phase intake", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    cmdStart(env, ["demo", "--track", "greenfield"]);
    const env2 = resolveEnv(root)!;
    expect(JSON.parse(fs.readFileSync(env2.stateFile, "utf8")).phase).toBe("intake");
  });
  it("refuses a second start while a workflow is active", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    cmdStart(env, ["demo", "--track", "greenfield"]);
    expect(() => cmdStart(resolveEnv(root)!, ["altro", "--track", "greenfield"])).toThrow(/esiste già un workflow attivo/);
  });
});

describe("cmdAdvance", () => {
  it("refuses when required artifacts are missing", () => {
    root = mkProject();
    cmdStart(resolveEnv(root)!, ["demo", "--track", "greenfield"]);
    // avanza da intake (nessun gate) a discover manualmente via advance...
    cmdAdvance(resolveEnv(root)!, []);
    expect(() => cmdAdvance(resolveEnv(root)!, [])).toThrow(/mancano gli artefatti/);
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa** `src/commands/{start,setTrack,advance,approve,reopen,status,board,handoff}.ts`,
  ciascuno porting diretto della funzione bash omonima (`cmd_start` →
  `cmdStart`, ecc.), usando `patchState`/`appendHistory`/`missingArtifacts`/
  `gateApproved`/`phaseIndex` dai moduli già scritti. La logica è quella già
  letta da `bin/us` (righe 20-220) — stessa validazione, stessi messaggi
  d'errore in italiano (i test dei task precedenti già fissano il contratto
  dei messaggi dove serve).

- [ ] **Step 4: verifica passaggio**

- [ ] **Step 5: Commit** — `git commit -m "ts: porta i comandi di bin/us in src/commands/*.ts"`

---

### Task 8: `src/adapters/claudeCode.ts` — porting di `dispatch.sh` + `hooks.json`

**Files:**
- Create: `src/adapters/claudeCode.ts`
- Modify: `adapters/claude-code/hooks.json` (comandi aggiornati)
- Test: `tests/adapters/claudeCode.test.ts`
- Delete: `adapters/claude-code/dispatch.sh`, i casi Claude Code di
  `tests/test_adapters.sh` (114 righe)

**Interfaces:**
- Consumes: `normalizeEvent` (event.ts), `decide` dei 4 moduli hook (Task 6)
- Produces: `handleClaudeCodeHook(core: "gate"|"banner"|"stop"|"nudge", cwd: string, nativePayload: unknown): { exitCode: number; stdout: string; stderr: string }`
  — traduce la decisione normalizzata nel contratto nativo di Claude Code
  (exit 2 + stderr su `deny`/`block`/`nudge` dei core che bloccano; JSON
  `hookSpecificOutput` su stdout per `banner`/`nudge` quando c'è `context`)

- [ ] **Step 1: test** (porta i casi Claude-Code di `test_adapters.sh`: gate
  allow → exit 0 senza output; gate deny → exit 2 con reason su stderr;
  banner con context → JSON `hookSpecificOutput.additionalContext` su
  stdout, hookEventName `SessionStart` o `UserPromptSubmit` a seconda
  dell'evento; stop block → exit 2; nudge con context → JSON su stdout con
  hookEventName `PostToolUse`)

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, writeState } from "../../src/lib/state.js";
import { handleClaudeCodeHook } from "../../src/adapters/claudeCode.js";

function mkActiveProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cc-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: [], protected_always_globs: [], protected_globs: ["src/**"],
    always_allowed_globs: [], phase_commands: {}, gates: {}, agent_instructions: "auto",
    memory: { enabled: false }, handoff: { nudge_threshold: 15 },
  }));
  const env = resolveEnv(root)!;
  writeState(env, { workflow: "w", track: "greenfield", phase: "intake", phases_done: [], harness: "claude-code", artifacts_dir: "ultraspec/workflows/w", gates: {}, session_log: [], last_handoff_at: null, last_session_id: null, last_session_at: null, nudge_marker: null, history: [] });
  return root;
}

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("handleClaudeCodeHook — gate", () => {
  it("deny -> exit 2, reason on stderr", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("gate", root, {
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/src/a.ts` }, cwd: root,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("BLOCCATO");
  });
  it("allow -> exit 0, no output", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("gate", root, {
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/README.md` }, cwd: root,
    });
    expect(r.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa**

```ts
import { normalizeEvent } from "../lib/event.js";
import { decide as gateDecide } from "../hooks/gate.js";
import { decide as bannerDecide } from "../hooks/banner.js";
import { decide as stopDecide } from "../hooks/stopCheck.js";
import { decide as nudgeDecide } from "../hooks/nudge.js";

export function handleClaudeCodeHook(
  core: "gate" | "banner" | "stop" | "nudge",
  cwd: string,
  nativePayload: unknown,
): { exitCode: number; stdout: string; stderr: string } {
  const event = normalizeEvent("claude-code", nativePayload);
  const decisionFn = { gate: gateDecide, banner: bannerDecide, stop: stopDecide, nudge: nudgeDecide }[core];
  const d = decisionFn(cwd, event);

  const emitJson = (hookEventName: string, context: string) =>
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: context } });

  if (core === "gate") {
    if (d.decision === "deny") return { exitCode: 2, stdout: "", stderr: d.reason ?? "blocked by ultraspec" };
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  if (core === "banner") {
    const hk = event.event === "user_prompt" ? "UserPromptSubmit" : "SessionStart";
    return { exitCode: 0, stdout: d.context ? emitJson(hk, d.context) : "", stderr: "" };
  }
  if (core === "stop") {
    if (d.decision === "block" || d.decision === "nudge") return { exitCode: 2, stdout: "", stderr: d.reason ?? "ultraspec: fase non completata" };
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  // nudge
  return { exitCode: 0, stdout: d.context ? emitJson("PostToolUse", d.context) : "", stderr: "" };
}
```

- [ ] **Step 4: aggiorna `adapters/claude-code/hooks.json`** — sostituisci
  ogni `"command": "bash \"${CLAUDE_PLUGIN_ROOT}/adapters/claude-code/dispatch.sh\" <core>"`
  con `"command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/cli.js\" hook claude-code <core>"`
  (rimuovi anche `"shell": "bash"`, non serve più).

- [ ] **Step 5: verifica passaggio test, cancella `dispatch.sh` e i casi
  Claude Code di `tests/test_adapters.sh`**

- [ ] **Step 6: Commit** — `git commit -m "ts: porta adapters/claude-code/dispatch.sh -> src/adapters/claudeCode.ts"`

---

### Task 9: `src/cli.ts` — entrypoint unico (sostituisce `bin/us`)

**Files:**
- Create: `src/cli.ts`
- Test: `tests/cli.test.ts`
- Delete: `bin/us`, `tests/test_cli.sh` (se non già svuotato dal Task 7)

**Interfaces:**
- Consumes: tutti i `cmdX` (Task 7), `handleClaudeCodeHook` (Task 8),
  `resolveEnv` (state.ts)
- Produces: `main(argv: string[]): number` (return code) — invocato da
  `#!/usr/bin/env node` in cima al file, che chiama
  `process.exit(main(process.argv.slice(2)))`. Sottocomandi: gli stessi di
  `bin/us` (`start|approve|advance|reopen|status|board|set-track|
  handoff-path|handoff-done`) + `hook <harness> <core>` (stdin = payload
  nativo, stdout/stderr/exit come da Task 8; per ora solo `claude-code`,
  `opencode` si aggiunge al Task 11) + `init`/`update` (aggiunti nei Task
  10-11 come stub che rimandano "not yet implemented" fino ad allora, per
  non rompere `us --help`).

- [ ] **Step 1: test** (invocazione end-to-end via `main()`, non spawnando
  un processo — porta i casi rilevanti già coperti per i singoli `cmdX`,
  qui si verifica solo il *routing* e la resa dei messaggi d'errore su
  stderr/return code, replicando `die()`/`case "$sub"` di `bin/us`)

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../src/cli.js";

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

function mkProject() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cli-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover"], code_edit_allowed_from: "build",
    commit_allowed_phases: [], stop_gated_phases: [], protected_always_globs: [],
    protected_globs: [], always_allowed_globs: [], phase_commands: {}, gates: {},
    agent_instructions: "auto", memory: { enabled: false }, handoff: { nudge_threshold: 15 },
  }));
}

describe("cli main()", () => {
  it("unknown subcommand -> rc 1, message on stderr", () => {
    mkProject();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rc = main(["mistero"], root);
    expect(rc).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("sotto-comando sconosciuto"));
    errSpy.mockRestore();
  });
  it("start then status --json round-trips through the real fs", () => {
    mkProject();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    main(["start", "demo", "--track", "greenfield"], root);
    const rc = main(["status", "--json"], root);
    expect(rc).toBe(0);
    const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain('"phase": "intake"');
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa `src/cli.ts`** — porting dello switch finale di
  `bin/us` (righe 234-249): parsing argomenti posizionali/`--flag value`
  identico a quello già scritto per `cmdStart`/`cmdReopen` nel Task 7,
  `resolveEnv(cwd)` una volta sola, dispatch a `cmdX`, cattura eccezioni →
  stampa su `console.error` con prefisso `"us: "` e ritorna 1 (replica
  `die()`); il sottocomando `hook <harness> <core>` legge stdin fino a EOF,
  fa `JSON.parse`, chiama l'adapter giusto (solo `claudeCode` per ora),
  scrive stdout/stderr e ritorna l'exit code dell'adapter.

- [ ] **Step 4: aggiungi lo shebang e rendi eseguibile**

`src/cli.ts` inizia con `#!/usr/bin/env node` come prima riga (TypeScript
lo preserva nel build); dopo `npm run build`, `chmod +x dist/cli.js`
(aggiungi questo `chmod` come riga dello script `build` in `package.json`:
`"build": "tsc -p tsconfig.json && chmod +x dist/cli.js"`).

- [ ] **Step 5: verifica passaggio, cancella `bin/us` e `tests/test_cli.sh`
  residuo**

- [ ] **Step 6: verifica manuale end-to-end**

```bash
npm run build
mkdir -p /tmp/us-manual/ultraspec
cp us.config.json /tmp/us-manual/ultraspec/
cd /tmp/us-manual && node <path-assoluto-repo>/dist/cli.js start demo --track greenfield
node <path-assoluto-repo>/dist/cli.js status
```
Expected: stesso output (a meno della lingua/wording già verificata dai
test) di `bash bin/us start demo --track greenfield` prima della rimozione.

- [ ] **Step 7: Commit** — `git commit -m "ts: cli.ts sostituisce bin/us"`

---

### Task 10: `ultraspec init` — scaffold del progetto ospite

**Files:**
- Create: `src/init.ts`
- Modify: `src/cli.ts` (aggiungi il sottocomando `init [path]`)
- Test: `tests/init.test.ts`
- Nessun bash da cancellare (comando nuovo)

**Interfaces:**
- Consumes: `us.config.json` di default (quello già al root del pacchetto,
  incluso in `files`), `workflow/*.md`, `commands/*.md`, `adapters/
  generic-git/{install.sh,pre-commit}` — tutti letti da
  `path.join(packageRoot, ...)` dove `packageRoot` è la directory del
  pacchetto installato (risolta via `import.meta.url`, come fa già
  `adapters/opencode/plugin.ts` con `fileURLToPath`).
- Produces: `runInit(targetPath: string, packageRoot: string): string[]`
  (ritorna la lista dei file scritti/aggiornati, per il messaggio finale e
  per i test)

Comportamento (dal design, sezione 2):
1. Se `<target>/ultraspec/us.config.json` non esiste: crealo copiando
   quello del pacchetto; crea `ultraspec/{workflows,handoffs}` vuote.
2. Copia `workflow/*.md` del pacchetto in `<target>/ultraspec/workflow/*.md`
   **solo i file assenti o non modificati** (drift-check, vedi Task 11 per
   il manifest completo — qui basta scrivere il manifest iniziale
   `<target>/ultraspec/.manifest.json`: `{ "<file>": { "packageVersion":
   "0.1.0", "hash": "<sha256 del contenuto scritto>" } }` per ogni file di
   `workflow/` copiato).
3. Genera `<target>/.claude/commands/ultraspec/*.md`: per ogni file in
   `commands/*.md` del pacchetto, scrivi lo stesso contenuto con
   `${CLAUDE_PLUGIN_ROOT}/dist/cli.js` sostituito dalla stringa letterale
   `us` (assume l'eseguibile in PATH da `npm i -g`).
4. Genera/mergia `<target>/.claude/settings.json`: aggiungi (senza
   sovrascrivere hook di altri tool) le 6 entry di `adapters/claude-code/
   hooks.json`, con i comandi che puntano a `us hook claude-code <core>`
   invece che a `${CLAUDE_PLUGIN_ROOT}/dist/cli.js hook claude-code <core>`.
   Se `.claude/settings.json` esiste già, fai merge profondo sulla chiave
   `hooks` (append, non overwrite, alle liste esistenti per lo stesso
   evento).
5. Copia `adapters/generic-git/install.sh` + `pre-commit` in
   `<target>/ultraspec/adapters/generic-git/` e invoca `install.sh`
   (installa il git hook nel repo target — comportamento invariato, lo
   script bash non cambia).
6. Se `<target>/AGENTS.md` non esiste: genera da `templates/AGENTS.md.tmpl`
   del pacchetto (copia semplice, nessuna sostituzione — invariato rispetto
   a oggi).

- [ ] **Step 1: test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/init.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let target: string;
afterEach(() => { if (target) fs.rmSync(target, { recursive: true, force: true }); });

describe("runInit", () => {
  it("creates ultraspec/ with config, workflows/, handoffs/", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    expect(fs.existsSync(path.join(target, "ultraspec/us.config.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "ultraspec/workflows"))).toBe(true);
    expect(fs.existsSync(path.join(target, "ultraspec/handoffs"))).toBe(true);
  });
  it("copies workflow/*.md locally", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const files = fs.readdirSync(path.join(target, "ultraspec/workflow"));
    expect(files).toContain("build.md");
  });
  it("generates .claude/commands/ultraspec/*.md with 'us' instead of the plugin var", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const status = fs.readFileSync(path.join(target, ".claude/commands/ultraspec/status.md"), "utf8");
    expect(status).toContain('bash "us" status');
    expect(status).not.toContain("CLAUDE_PLUGIN_ROOT");
  });
  it("generates .claude/settings.json with the 6 hook events", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "PreCompact"]),
    );
  });
  it("merges into an existing .claude/settings.json without dropping other hooks", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    fs.mkdirSync(path.join(target, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(target, ".claude/settings.json"), JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "echo altro-tool" }] }] },
    }));
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    const stopCommands = settings.hooks.Stop.flatMap((h: any) => h.hooks.map((x: any) => x.command));
    expect(stopCommands).toEqual(expect.arrayContaining([expect.stringContaining("echo altro-tool"), expect.stringContaining("us hook claude-code stop")]));
  });
  it("is idempotent: running twice does not duplicate hook entries", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    const stopCommands = settings.hooks.Stop.flatMap((h: any) => h.hooks.map((x: any) => x.command));
    expect(stopCommands.filter((c: string) => c.includes("stop")).length).toBe(1);
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa `src/init.ts`**

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const HOOK_EVENTS: Record<string, { matcher?: string; core: string }[]> = {
  SessionStart: [{ matcher: "startup|resume|clear|compact", core: "banner" }],
  UserPromptSubmit: [{ core: "banner" }],
  PreToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash", core: "gate" }],
  PostToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit", core: "nudge" }],
  Stop: [{ core: "stop" }],
  PreCompact: [{ matcher: "manual|auto", core: "stop" }],
};

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function initConfigAndDirs(target: string, packageRoot: string): string[] {
  const written: string[] = [];
  const usDir = path.join(target, "ultraspec");
  ensureDir(usDir);
  const cfgTarget = path.join(usDir, "us.config.json");
  if (!fs.existsSync(cfgTarget)) {
    fs.copyFileSync(path.join(packageRoot, "us.config.json"), cfgTarget);
    written.push(cfgTarget);
  }
  for (const sub of ["workflows", "handoffs"]) {
    ensureDir(path.join(usDir, sub));
  }
  return written;
}

function copyWorkflowTemplates(target: string, packageRoot: string): string[] {
  const written: string[] = [];
  const srcDir = path.join(packageRoot, "workflow");
  const dstDir = path.join(target, "ultraspec", "workflow");
  ensureDir(dstDir);
  const manifestPath = path.join(target, "ultraspec", ".manifest.json");
  const manifest: Record<string, { hash: string }> = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  for (const f of fs.readdirSync(srcDir)) {
    const content = fs.readFileSync(path.join(srcDir, f), "utf8");
    const dst = path.join(dstDir, f);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const existing = fs.existsSync(dst) ? fs.readFileSync(dst, "utf8") : null;
    const existingHash = existing ? crypto.createHash("sha256").update(existing).digest("hex") : null;
    const tracked = manifest[`workflow/${f}`];
    const localUnmodified = existing === null || (tracked && tracked.hash === existingHash);
    if (localUnmodified) {
      fs.writeFileSync(dst, content);
      manifest[`workflow/${f}`] = { hash };
      written.push(dst);
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return written;
}

function generateCommands(target: string, packageRoot: string): string[] {
  const written: string[] = [];
  const srcDir = path.join(packageRoot, "commands");
  const dstDir = path.join(target, ".claude", "commands", "ultraspec");
  ensureDir(dstDir);
  for (const f of fs.readdirSync(srcDir)) {
    const content = fs.readFileSync(path.join(srcDir, f), "utf8")
      .replaceAll('bash "${CLAUDE_PLUGIN_ROOT}/bin/us"', 'bash "us"')
      .replaceAll('node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js"', 'bash "us"');
    const dst = path.join(dstDir, f);
    fs.writeFileSync(dst, content);
    written.push(dst);
  }
  return written;
}

function mergeSettings(target: string): string {
  const settingsPath = path.join(target, ".claude", "settings.json");
  ensureDir(path.dirname(settingsPath));
  const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : {};
  existing.hooks = existing.hooks ?? {};
  for (const [event, entries] of Object.entries(HOOK_EVENTS)) {
    existing.hooks[event] = existing.hooks[event] ?? [];
    for (const { matcher, core } of entries) {
      const command = `us hook claude-code ${core}`;
      const already = existing.hooks[event].some((group: any) =>
        group.hooks?.some((h: any) => h.command === command));
      if (already) continue;
      const group: any = { hooks: [{ type: "command", command }] };
      if (matcher) group.matcher = matcher;
      existing.hooks[event].push(group);
    }
  }
  fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
  return settingsPath;
}

function installGenericGit(target: string, packageRoot: string): string[] {
  const written: string[] = [];
  const srcDir = path.join(packageRoot, "adapters", "generic-git");
  const dstDir = path.join(target, "ultraspec", "adapters", "generic-git");
  ensureDir(dstDir);
  for (const f of ["install.sh", "pre-commit"]) {
    const dst = path.join(dstDir, f);
    fs.copyFileSync(path.join(srcDir, f), dst);
    fs.chmodSync(dst, 0o755);
    written.push(dst);
  }
  return written;
}

function generateAgentsMd(target: string, packageRoot: string): string[] {
  const dst = path.join(target, "AGENTS.md");
  if (fs.existsSync(dst)) return [];
  fs.copyFileSync(path.join(packageRoot, "templates", "AGENTS.md.tmpl"), dst);
  return [dst];
}

export function runInit(target: string, packageRoot: string): string[] {
  return [
    ...initConfigAndDirs(target, packageRoot),
    ...copyWorkflowTemplates(target, packageRoot),
    ...generateCommands(target, packageRoot),
    mergeSettings(target),
    ...installGenericGit(target, packageRoot),
    ...generateAgentsMd(target, packageRoot),
  ];
}
```

- [ ] **Step 4: collega in `src/cli.ts`**

```ts
// nel dispatch di main(), risolvendo packageRoot da import.meta.url:
case "init": {
  const target = path.resolve(args[0] ?? cwd);
  const written = runInit(target, packageRoot);
  console.log(`ultraspec inizializzato in ${target}:\n${written.map((w) => `  ${w}`).join("\n")}`);
  return 0;
}
```

- [ ] **Step 5: verifica passaggio, poi verifica manuale**

```bash
npm run build
mkdir -p /tmp/us-init-manual
node dist/cli.js init /tmp/us-init-manual
ls -la /tmp/us-init-manual/ultraspec /tmp/us-init-manual/.claude
```
Expected: struttura come descritta, `ultraspec init` di nuovo sullo stesso
target non duplica nulla (idempotente, già coperto dal test).

- [ ] **Step 6: Commit** — `git commit -m "feat: ultraspec init — scaffold del progetto ospite"`

---

### Task 11: `ultraspec update` + adapter OpenCode + rimozione bash residuo

**Files:**
- Create: `src/update.ts`
- Modify: `src/cli.ts` (sottocomando `update [path]`), `adapters/opencode/plugin.ts`
- Test: `tests/update.test.ts`, `tests/adapters/openCode.test.ts`
- Delete: `tests/test_adapters.sh` (casi OpenCode residui), qualunque file
  bash non ancora rimosso nei task precedenti

**Interfaces:**
- `runUpdate(target: string, packageRoot: string): { updated: string[]; drift: string[] }`
  — rigenera sempre `generateCommands`+`mergeSettings` (Task 10, idempotenti
  per costruzione); per `workflow/*.md` applica la stessa `localUnmodified`
  di `copyWorkflowTemplates` (già scritta), aggiungendo al risultato
  `drift` i file per cui `localUnmodified` è falso invece di sovrascriverli.

- [ ] **Step 1: test `update.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/init.js";
import { runUpdate } from "../src/update.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let target: string;
afterEach(() => { if (target) fs.rmSync(target, { recursive: true, force: true }); });

describe("runUpdate", () => {
  it("silently refreshes an unmodified workflow file", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-upd-"));
    runInit(target, packageRoot);
    const { updated, drift } = runUpdate(target, packageRoot);
    expect(drift).toEqual([]);
    expect(updated.some((f) => f.endsWith("build.md"))).toBe(true);
  });
  it("reports drift for a locally edited workflow file, without overwriting it", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-upd-"));
    runInit(target, packageRoot);
    const buildMd = path.join(target, "ultraspec/workflow/build.md");
    fs.writeFileSync(buildMd, "personalizzato dall'utente");
    const { drift } = runUpdate(target, packageRoot);
    expect(drift).toContain("workflow/build.md");
    expect(fs.readFileSync(buildMd, "utf8")).toBe("personalizzato dall'utente");
  });
});
```

- [ ] **Step 2: verifica fallimento**

- [ ] **Step 3: implementa `src/update.ts`** riusando `copyWorkflowTemplates`
  ma con un parametro `{ overwrite: boolean }` — refattorizza il Task 10 per
  esportare una variante che, quando `localUnmodified` è falso, aggiunge la
  entry a `drift` invece di saltarla in silenzio (comportamento identico,
  differenza solo nel valore ritornato); riusa `generateCommands` e
  `mergeSettings` tali e quali da `init.ts` (esportale da lì).

- [ ] **Step 4: aggiorna `adapters/opencode/plugin.ts`** — sostituisci
  `runCore` (che oggi fa `spawnSync("bash", [...])`) con chiamate dirette ai
  4 moduli `src/hooks/*.ts` importati come pacchetto (`import { decide as
  gateDecide } from "ultraspec/dist/hooks/gate.js"` se il plugin gira da
  `node_modules/ultraspec`, o path relativo `../../dist/hooks/gate.js` per
  la via marketplace) — stesso comportamento, niente più subprocess bash.

```ts
// adapters/opencode/plugin.ts — sostituisci import e runCore
import { decide as gateDecide } from "../../dist/hooks/gate.js";
import { decide as bannerDecide } from "../../dist/hooks/banner.js";
import { decide as nudgeDecide } from "../../dist/hooks/nudge.js";
import { normalizeEvent } from "../../dist/lib/event.js";
// ... toEvent() invariato, ma usa normalizeEvent("opencode", raw) internamente
// invece di costruire l'oggetto a mano, per restare in sync con event.ts;
// UltraspecPlugin chiama gateDecide/bannerDecide/nudgeDecide direttamente
// invece di runCore("us-gate.sh", ev).
```

- [ ] **Step 5: `tests/adapters/openCode.test.ts`** — porta i casi OpenCode
  residui di `tests/test_adapters.sh` verificando `toEvent`/le tre funzioni
  esportate dal plugin con lo stesso approccio del Task 8 (niente
  `spawnSync`, chiamate dirette).

- [ ] **Step 6: aggiungi `update` a `src/cli.ts`**, stesso pattern di `init`.

- [ ] **Step 7: verifica passaggio di tutta la suite**

```bash
npm test
```
Expected: tutti i test PASS (nessun `.sh` residuo sotto `tests/`).

- [ ] **Step 8: cancella ogni bash residuo**

```bash
git status --short  # verifica cosa resta sotto hooks/, bin/, adapters/*/*.sh (tranne generic-git)
git rm -f <eventuali residui>
```

- [ ] **Step 9: Commit** — `git commit -m "feat: ultraspec update + porta adapters/opencode a chiamate dirette (no bash)"`

---

### Task 12: packaging finale, README/docs, pubblicazione

**Files:**
- Modify: `README.md`, `docs/agents.md` (sostituisci le istruzioni "clona
  come ultraspec/" con `npm i -g ultraspec && ultraspec init` come via
  primaria, marketplace come alternativa — coerente con quanto già scritto
  nel commit `5d393d6`, ora corretto per il comando `init` reale invece del
  submodule manuale), `.claude-plugin/plugin.json` (nessun cambio di
  contenuto, verifica solo che `"hooks"` punti ancora a
  `./adapters/claude-code/hooks.json`, già aggiornato al Task 8)
- Delete: `adapters/SUPPORT.md` righe che menzionano `bin/us` bash — sostituisci
  i riferimenti con `dist/cli.js`/`us`

- [ ] **Step 1: aggiorna README.md, sezione Installazione** — sostituisci
  il blocco `git submodule add` con:

```markdown
## Installazione

**Via npm (consigliata):**
\`\`\`
npm i -g ultraspec
cd il-tuo-progetto
ultraspec init
\`\`\`
Genera `ultraspec/` (stato, config, procedure di fase editabili) e
`.claude/commands/ultraspec/*.md` + gli hook in `.claude/settings.json`.
Aggiornamenti: `npm update -g ultraspec && ultraspec update`.

**Via marketplace Claude Code (nessuna installazione globale):**
\`\`\`
/plugin marketplace add https://github.com/Alebona99/ultraspec
/plugin install ultraspec@ultraspec
\`\`\`
Richiede `node`, non npm/registry. In questo caso serve comunque
`ultraspec init` (via `npx ultraspec init` o dal `dist/cli.js` del plugin)
per creare la cartella `ultraspec/` dati nel progetto.
```

- [ ] **Step 2: aggiorna `docs/agents.md`** con lo stesso cambio per la
  sezione Claude Code, OpenCode (aggiungi: `npm i -g ultraspec &&
  ultraspec init`, poi `"plugin": ["ultraspec/adapters/opencode/plugin.ts"]`
  in `opencode.json` se installato via submodule, o dal path assoluto di
  `node_modules/ultraspec/adapters/opencode/plugin.ts` se via npm) e Cursor/
  Codex/generico (`ultraspec init` sostituisce il `git submodule add`
  manuale del commit precedente).

- [ ] **Step 3: verifica finale della suite completa e della build**

```bash
npm run build && npm test
git status --short   # deve essere pulito a parte i file di questo task
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/agents.md adapters/SUPPORT.md
git commit -m "docs: install via npm/init come via primaria, marketplace come alternativa"
```

- [ ] **Step 5: bump versione e pubblica** (richiede login npm già fatto
  dall'utente — `npm whoami` per verificare; se non loggato, chiedere
  all'utente di fare `npm login` prima di questo step, non farlo al posto
  suo)

```bash
npm whoami   # verifica sessione attiva
npm version 0.1.0 --no-git-tag-version   # se non già a 0.1.0
npm publish --access public
```
Expected: pacchetto visibile su `https://www.npmjs.com/package/ultraspec`.

- [ ] **Step 6: verifica end-to-end della via npm da zero**

```bash
mkdir -p /tmp/us-e2e-npm && cd /tmp/us-e2e-npm
npx ultraspec@latest init .
ls .claude/commands/ultraspec ultraspec
```
Expected: stessa struttura verificata nel Task 10, ma passando dal
registry pubblico invece che dal `dist/` locale.

- [ ] **Step 7: Commit finale (se lo step 5/6 hanno toccato `package.json` la versione)**

```bash
git add package.json
git commit -m "release: ultraspec 0.1.0"
git push origin main
```

---

## Note per chi esegue il piano

- I Task 2-6 sono strettamente sequenziali (ognuno importa dal precedente).
  I Task 7-9 dipendono da 2-6. Il Task 10 dipende da 9. Il Task 11 dipende
  da 10. Il Task 12 è sempre ultimo.
- Ogni volta che un task dice "porta ogni caso di `tests/test_X.sh`", il
  file bash resta la specifica comportamentale fino a quando il task non lo
  cancella esplicitamente — non cancellarlo prima di aver verificato che i
  test TS coprano lo stesso comportamento.
- Il Task 5 (`context.ts`) usa `Date.parse`/`mtimeMs` al posto di `date -d`/
  `stat -r`: comportamento equivalente per le stringhe ISO 8601 già in uso
  ovunque nello stato, ma se un test scopre un caso limite di parsing date
  non coperto dal bash, aggiungilo e annotalo nel commit.
