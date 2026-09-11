import { appendHistory, patchState, phaseIndex, readState, stateActive } from "../lib/state.js";
const NO_ACTIVE = "nessun workflow attivo (usa: /ultraspec:start <nome> --track ...)";
export function cmdReopen(env, args) {
    const phase = args[0] ?? "";
    const rest = args.slice(1);
    let reason = "";
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--reason") {
            reason = rest[i + 1] ?? "";
            i++;
        }
        else
            throw new Error(`opzione sconosciuta: ${a}`);
    }
    if (!phase)
        throw new Error('uso: /ultraspec:reopen <phase> --reason "..."');
    if (!reason)
        throw new Error('reopen richiede --reason "..." (viene registrato nella history)');
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    const { state } = readState(env);
    const cur = state.phase;
    const pi = phaseIndex(env, phase);
    if (pi === -1)
        throw new Error(`fase sconosciuta: ${phase}`);
    const ci = phaseIndex(env, cur);
    if (!(pi >= 0 && ci >= 0 && pi <= ci)) {
        throw new Error(`reopen va solo indietro: '${phase}' non precede '${cur}'`);
    }
    patchState(env, (s) => {
        const gates = { ...s.gates };
        for (const [key, value] of Object.entries(gates)) {
            const gi = phaseIndex(env, key);
            if (gi === -1 || gi >= pi)
                gates[key] = { ...value, human_approved: false };
        }
        return {
            ...s,
            phase,
            phases_done: s.phases_done.filter((x) => phaseIndex(env, x) < pi),
            gates,
        };
    });
    appendHistory(env, { event: "reopen", from: cur, to: phase, reason });
    return `riaperto: ${cur} -> ${phase} (motivo registrato)\n`;
}
