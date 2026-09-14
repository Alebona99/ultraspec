// Real-subprocess tests for the built CLI (dist/cli.js), including through a
// symlink — reproducing npm's global-bin layout, where the installed `us`
// binary is ALWAYS a symlink into node_modules/ultraspec/dist/cli.js.
//
// This is the test that would have caught the C1 finding: cli.ts's
// self-invocation guard compared `import.meta.url` (realpath-resolved by
// Node's ESM loader) against the raw, unresolved `process.argv[1]` — through
// a symlink those never matched, so `main()` was never called and the CLI
// silently no-op'd (exit 0, no output) for every subcommand.
//
// This test runs against whatever is currently built in dist/ — it does NOT
// rebuild; run `npm run build` first (as `npm test` / prepublishOnly do).
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distCli = path.join(packageRoot, "dist", "cli.js");

const tmpDirs: string[] = [];
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function mkTmp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

describe("dist/cli.js as a real subprocess", () => {
  it("built dist/cli.js exists and is executable", () => {
    expect(fs.existsSync(distCli)).toBe(true);
  });

  it("running dist/cli.js --help directly produces output and exits 0", () => {
    const out = execFileSync(process.execPath, [distCli, "--help"], { encoding: "utf8" });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("ultraspec");
  });
});

describe("dist/cli.js invoked THROUGH a symlink (npm global-bin layout)", () => {
  it("still produces output and exits 0 -- regression test for C1", () => {
    const binDir = mkTmp("us-fake-bin-");
    const symlinkPath = path.join(binDir, "us");
    fs.symlinkSync(distCli, symlinkPath);

    // import.meta.url inside cli.js is realpath-resolved by Node's ESM loader
    // to the REAL dist/cli.js path, while process.argv[1] here is the symlink
    // path as invoked (unresolved) -- exactly npm's global bin layout. If the
    // self-invocation guard in cli.ts naively compares
    // `file://${process.argv[1]}` against import.meta.url, they never match
    // and main() silently never runs.
    const out = execFileSync(process.execPath, [symlinkPath, "--help"], { encoding: "utf8" });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("ultraspec");
  });

  it("invoking the symlink directly (via its own shebang) also works", () => {
    const binDir = mkTmp("us-fake-bin-shebang-");
    const symlinkPath = path.join(binDir, "us");
    fs.chmodSync(distCli, 0o755);
    fs.symlinkSync(distCli, symlinkPath);

    const out = execFileSync(symlinkPath, ["--help"], { encoding: "utf8" });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("ultraspec");
  });
});

describe("ultraspec init via the built CLI as a real subprocess", () => {
  it("generates .claude/commands/ultraspec/status.md invoking bare 'us', not 'bash \"us\"' -- regression test for C2", () => {
    const scratch = mkTmp("us-init-subprocess-");
    execFileSync(process.execPath, [distCli, "init", scratch], { encoding: "utf8" });

    const statusMd = fs.readFileSync(
      path.join(scratch, ".claude", "commands", "ultraspec", "status.md"),
      "utf8",
    );
    expect(statusMd).toMatch(/\bus status\b/);
    expect(statusMd).not.toContain('bash "us"');
  });
});
