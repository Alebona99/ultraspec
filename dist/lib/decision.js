import { phaseIndex, cfg } from "./state.js";
export function emit(decision, reason, context) {
    const out = { decision };
    if (reason)
        out.reason = reason;
    if (context)
        out.context = context;
    return out;
}
// glob (con ** e *) -> RegExp ancorata; stessa semantica di us_glob_to_ere
export function globToRegExp(glob) {
    let out = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                i++;
                if (glob[i + 1] === "/") {
                    i++;
                    out += "(.*/)?";
                }
                else
                    out += ".*";
            }
            else
                out += "[^/]*";
        }
        else if (c === "?")
            out += "[^/]";
        else if (c === ".")
            out += "\\.";
        else if (/[a-zA-Z0-9_\-/]/.test(c))
            out += c;
        else
            out += `[${c}]`;
    }
    return new RegExp(`^${out}$`);
}
export function pathMatchesAny(rel, globs) {
    return globs.some((g) => globToRegExp(g).test(rel));
}
export function relPath(env, targetPath) {
    if (targetPath.startsWith(env.root + "/"))
        return targetPath.slice(env.root.length + 1);
    if (targetPath.startsWith("./"))
        return targetPath.slice(2);
    return targetPath;
}
export function phaseAllowsCode(env, state) {
    const from = cfg(env, "code_edit_allowed_from", "build");
    const ci = phaseIndex(env, state.phase), fi = phaseIndex(env, from);
    return ci >= 0 && fi >= 0 && ci >= fi;
}
export function phaseAllowsCommit(env, state) {
    return env.config.commit_allowed_phases.includes(state.phase);
}
export function decidePreWrite(env, state, targetPath) {
    const rel = relPath(env, targetPath);
    if (!rel)
        return emit("allow", "no target path");
    if (pathMatchesAny(rel, env.config.protected_always_globs)) {
        return emit("deny", `BLOCCATO: '${rel}' è protetto in ogni fase (stato/config/hook di ultraspec). Modifica lo stato solo tramite /ultraspec:advance, /ultraspec:approve, /ultraspec:reopen.`);
    }
    if (pathMatchesAny(rel, env.config.always_allowed_globs))
        return emit("allow", "planning/docs/test path");
    if (!pathMatchesAny(rel, env.config.protected_globs))
        return emit("allow", "not a protected code path");
    if (phaseAllowsCode(env, state))
        return emit("allow", "phase permits code edits");
    const from = cfg(env, "code_edit_allowed_from", "build");
    return emit("deny", `BLOCCATO: fase '${state.phase}'. Le modifiche a codice (${rel}) richiedono la fase '${from}'. Avanza con /ultraspec:advance dopo aver superato i gate.`);
}
export function decidePreBash(env, state, command) {
    if (/(^|\s)git (commit|push)(\s|$)/.test(command)) {
        if (phaseAllowsCommit(env, state))
            return emit("allow", "phase permits commit");
        const allowed = env.config.commit_allowed_phases.join(", ");
        return emit("deny", `BLOCCATO: 'git commit/push' non consentito in fase '${state.phase}'. Consentito solo nelle fasi: ${allowed}.`);
    }
    return emit("allow", "not a commit/push");
}
