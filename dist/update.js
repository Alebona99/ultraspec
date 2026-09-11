import { syncWorkflowTemplates, generateCommands, mergeSettings } from "./init.js";
/**
 * Re-sync a project already initialized by `us init`: regenerates commands
 * and settings (idempotent by construction), and refreshes workflow/*.md
 * templates unless the local copy has drifted from what was last written
 * (in which case it's reported in `drift`, never overwritten).
 */
export function runUpdate(target, packageRoot) {
    const { written, drift } = syncWorkflowTemplates(target, packageRoot);
    const updated = [
        ...written,
        ...generateCommands(target, packageRoot),
        mergeSettings(target),
    ];
    return { updated, drift };
}
