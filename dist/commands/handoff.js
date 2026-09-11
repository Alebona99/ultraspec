import * as fs from "node:fs";
import * as path from "node:path";
import { cfg, nowIso, patchState, readState, stateActive } from "../lib/state.js";
const NO_ACTIVE = "nessun workflow attivo (usa: /ultraspec:start <nome> --track ...)";
export function cmdHandoffPath(env, args) {
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    const { state } = readState(env);
    const dir = path.join(env.root, cfg(env, "handoffs_dir", "ultraspec/handoffs"));
    const wf = state.workflow;
    const ts = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    fs.mkdirSync(dir, { recursive: true });
    return `${dir}/${wf}-${ts}.md\n`;
}
export function cmdHandoffDone(env, args) {
    const f = args[0] ?? "";
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        throw new Error(`file di handoff non trovato: ${f}`);
    }
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    patchState(env, (s) => ({ ...s, last_handoff_at: nowIso() }));
    return `handoff registrato: ${path.basename(f)}\n`;
}
