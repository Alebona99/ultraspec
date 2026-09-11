import { appendHistory, patchState, readState, stateActive } from "../lib/state.js";
const NO_ACTIVE = "nessun workflow attivo (usa: /ultraspec:start <nome> --track ...)";
export function cmdApprove(env, args) {
    const phase = args[0] ?? "";
    if (!phase)
        throw new Error("uso: /ultraspec:approve <phase>");
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    const { state } = readState(env);
    if (!state.gates[phase])
        throw new Error(`la fase '${phase}' non ha un gate da approvare`);
    patchState(env, (s) => ({
        ...s,
        gates: { ...s.gates, [phase]: { ...s.gates[phase], human_approved: true } },
    }));
    appendHistory(env, { event: "approve", gate: phase });
    return `gate "${phase}" approvato dall'utente. Ora puoi /ultraspec:advance quando gli artefatti sono pronti.\n`;
}
