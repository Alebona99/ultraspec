import { appendHistory, patchState, readState, stateActive } from "../lib/state.js";
const NO_ACTIVE = "nessun workflow attivo (usa: /ultraspec:start <nome> --track ...)";
export function cmdSetTrack(env, args) {
    const track = args[0] ?? "";
    if (track !== "greenfield" && track !== "brownfield") {
        throw new Error("uso: /ultraspec:set-track greenfield|brownfield");
    }
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    const { state } = readState(env);
    const ph = state.phase;
    const cur = state.track;
    if (track === cur)
        return `track già "${track}"\n`;
    if (ph !== "intake" && ph !== "discover") {
        throw new Error(`il track si cambia solo in intake/discover (ora: ${ph}). Influenza solo la fase discover; oltre non ha effetto. Se devi rifare la discovery: /ultraspec:reopen discover --reason "...".`);
    }
    patchState(env, (s) => ({ ...s, track: track }));
    appendHistory(env, { event: "set-track", from: cur, to: track });
    return `track: ${cur} -> ${track} — rilancia /ultraspec:discover\n`;
}
