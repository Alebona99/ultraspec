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
