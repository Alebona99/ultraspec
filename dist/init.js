import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const HOOK_EVENTS = {
    SessionStart: [{ matcher: "startup|resume|clear|compact", core: "banner" }],
    UserPromptSubmit: [{ core: "banner" }],
    PreToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash", core: "gate" }],
    PostToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit", core: "nudge" }],
    Stop: [{ core: "stop" }],
    PreCompact: [{ matcher: "manual|auto", core: "stop" }],
};
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
export function initConfigAndDirs(target, packageRoot) {
    const written = [];
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
export function copyWorkflowTemplates(target, packageRoot) {
    const written = [];
    const srcDir = path.join(packageRoot, "workflow");
    const dstDir = path.join(target, "ultraspec", "workflow");
    ensureDir(dstDir);
    const manifestPath = path.join(target, "ultraspec", ".manifest.json");
    const manifest = fs.existsSync(manifestPath)
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
            manifest[`workflow/${f}`] = { hash, packageVersion: pkg.version };
            written.push(dst);
        }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return written;
}
export function generateCommands(target, packageRoot) {
    const written = [];
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
export function mergeSettings(target) {
    const settingsPath = path.join(target, ".claude", "settings.json");
    ensureDir(path.dirname(settingsPath));
    const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : {};
    existing.hooks = existing.hooks ?? {};
    for (const [event, entries] of Object.entries(HOOK_EVENTS)) {
        existing.hooks[event] = existing.hooks[event] ?? [];
        for (const { matcher, core } of entries) {
            const command = `us hook claude-code ${core}`;
            const already = existing.hooks[event].some((group) => group.hooks?.some((h) => h.command === command));
            if (already)
                continue;
            const group = { hooks: [{ type: "command", command }] };
            if (matcher)
                group.matcher = matcher;
            existing.hooks[event].push(group);
        }
    }
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    return settingsPath;
}
export function installGenericGit(target, packageRoot) {
    const written = [];
    const srcDir = path.join(packageRoot, "adapters", "generic-git");
    const dstDir = path.join(target, "ultraspec", "adapters", "generic-git");
    ensureDir(dstDir);
    let installShPath = "";
    for (const f of ["install.sh", "pre-commit"]) {
        const dst = path.join(dstDir, f);
        fs.copyFileSync(path.join(srcDir, f), dst);
        fs.chmodSync(dst, 0o755);
        written.push(dst);
        if (f === "install.sh") {
            installShPath = dst;
        }
    }
    // Execute install.sh to wire the pre-commit hook into .git/hooks
    if (installShPath) {
        try {
            execFileSync(installShPath, [], { cwd: target });
        }
        catch (e) {
            // install.sh exits gracefully if target is not a git repo; that's acceptable
            // so we catch and continue rather than throwing
        }
    }
    return written;
}
export function generateAgentsMd(target, packageRoot) {
    const dst = path.join(target, "AGENTS.md");
    if (fs.existsSync(dst))
        return [];
    fs.copyFileSync(path.join(packageRoot, "templates", "AGENTS.md.tmpl"), dst);
    return [dst];
}
export function runInit(target, packageRoot) {
    return [
        ...initConfigAndDirs(target, packageRoot),
        ...copyWorkflowTemplates(target, packageRoot),
        ...generateCommands(target, packageRoot),
        mergeSettings(target),
        ...installGenericGit(target, packageRoot),
        ...generateAgentsMd(target, packageRoot),
    ];
}
