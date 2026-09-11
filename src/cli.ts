#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnv } from "./lib/state.js";
import { runInit } from "./init.js";
import { cmdStart } from "./commands/start.js";
import { cmdApprove } from "./commands/approve.js";
import { cmdAdvance } from "./commands/advance.js";
import { cmdReopen } from "./commands/reopen.js";
import { cmdStatus } from "./commands/status.js";
import { cmdBoard } from "./commands/board.js";
import { cmdSetTrack } from "./commands/setTrack.js";
import { cmdHandoffPath, cmdHandoffDone } from "./commands/handoff.js";
import { handleClaudeCodeHook } from "./adapters/claudeCode.js";
import type { UsEnv } from "./types.js";

const HELP = `ultraspec — state-machine CLI (backing implementation for the /ultraspec:* commands)

  us start <name> --track greenfield|brownfield [--harness H]
  us approve <phase>                 # USER ONLY
  us advance                         # forward only; validates the current gate
  us reopen <phase> --reason "..."   # backward; logged
  us set-track greenfield|brownfield # only in intake/discover
  us status [--json]
  us board                           # overview: workflow + artifacts + tests + handoffs + history
  us handoff-path                    # echo where the next handoff file goes
  us handoff-done <file>             # stamp last_handoff_at
  us hook <harness> <core>           # invoked by harness adapters; stdin = native payload
  us init [path]                     # scaffold ultraspec/ + .claude/ nel progetto ospite
  us update                          # not yet implemented

All writes go through the state module so history/session_log stay intact.`;

const HOOK_CORES = ["gate", "banner", "stop", "nudge"] as const;
type HookCore = (typeof HOOK_CORES)[number];
function isHookCore(v: string | undefined): v is HookCore {
  return v !== undefined && (HOOK_CORES as readonly string[]).includes(v);
}

const STATE_SUBCOMMANDS = new Set([
  "start", "approve", "advance", "reopen", "status",
  "board", "overview", "set-track", "handoff-path", "handoff-done",
]);

function runStateCommand(sub: string, env: UsEnv, rest: string[]): string {
  switch (sub) {
    case "start": return cmdStart(env, rest);
    case "approve": return cmdApprove(env, rest);
    case "advance": return cmdAdvance(env, rest);
    case "reopen": return cmdReopen(env, rest);
    case "status": return cmdStatus(env, rest);
    case "board":
    case "overview": return cmdBoard(env, rest);
    case "set-track": return cmdSetTrack(env, rest);
    case "handoff-path": return cmdHandoffPath(env, rest);
    case "handoff-done": return cmdHandoffDone(env, rest);
    default: throw new Error(`sotto-comando sconosciuto: ${sub}`);
  }
}

function runHook(harness: string | undefined, core: string | undefined, cwd: string): number {
  if (harness !== "claude-code") {
    console.error(`us: harness sconosciuto: ${harness ?? ""}`);
    return 1;
  }
  if (!isHookCore(core)) {
    console.error(`us: hook sconosciuto: ${core ?? ""}`);
    return 1;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    console.error("us: impossibile leggere stdin");
    return 1;
  }
  let payload: unknown;
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    console.error("us: payload JSON non valido su stdin");
    return 1;
  }
  const { exitCode, stdout, stderr } = handleClaudeCodeHook(core, cwd, payload);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : stderr + "\n");
  return exitCode;
}

export function main(argv: string[], cwd: string = process.cwd()): number {
  const sub = argv[0] ?? "";
  const rest = argv.slice(1);

  if (sub === "" || sub === "-h" || sub === "--help") {
    console.log(HELP);
    return 0;
  }

  if (sub === "hook") {
    return runHook(rest[0], rest[1], cwd);
  }

  if (sub === "init") {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const target = path.resolve(cwd, rest[0] ?? ".");
    const written = runInit(target, packageRoot);
    console.log(`ultraspec inizializzato in ${target}:\n${written.map((w) => `  ${w}`).join("\n")}`);
    return 0;
  }

  if (sub === "update") {
    console.error(`us: "${sub}" non ancora implementato`);
    return 1;
  }

  if (!STATE_SUBCOMMANDS.has(sub)) {
    console.error(`us: sotto-comando sconosciuto: ${sub}`);
    return 1;
  }

  const env = resolveEnv(cwd);
  if (!env) {
    console.error(`us: nessun ultraspec/us.config.json trovato risalendo da ${cwd}`);
    return 1;
  }

  try {
    const output = runStateCommand(sub, env, rest);
    console.log(output.endsWith("\n") ? output.slice(0, -1) : output);
    return 0;
  } catch (e) {
    console.error(`us: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
