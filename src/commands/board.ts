import * as fs from "node:fs";
import * as path from "node:path";
import type { UsEnv } from "../types.js";
import { cfg, readState, stateActive } from "../lib/state.js";
import { cmdStatus } from "./status.js";

function artifactsSection(env: UsEnv): string[] {
  const lines = ["", "--- Workflow attivo: artefatti ---"];
  if (stateActive(env)) {
    const { state } = readState(env);
    const s = state!;
    const adirRel = s.artifacts_dir;
    const adir = path.join(env.root, adirRel);
    if (fs.existsSync(adir)) {
      const files = fs
        .readdirSync(adir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      for (const f of files) lines.push(`  [x] ${f}`);

      const required = new Set<string>();
      for (const gate of Object.values(env.config.gates)) {
        for (const r of gate.requires ?? []) required.add(r);
      }
      for (const req of Array.from(required).sort()) {
        if (!fs.existsSync(path.join(adir, req))) lines.push(`  [ ] ${req}  (richiesto da un gate)`);
      }
    } else {
      lines.push(`  (cartella ${adirRel} non ancora creata)`);
    }
  }
  return lines;
}

function allWorkflowsSection(env: UsEnv): string[] {
  const lines = ["", "--- Tutti i workflow ---"];
  const wdir = path.join(env.root, cfg(env, "workflows_dir", "ultraspec/workflows"));
  if (fs.existsSync(wdir)) {
    const dirs = fs
      .readdirSync(wdir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const d of dirs) {
      const count = fs.readdirSync(path.join(wdir, d)).filter((f) => f.endsWith(".md")).length;
      lines.push(`  - ${d}  (${count} file)`);
    }
  } else {
    lines.push("  nessuno");
  }
  return lines;
}

function testsSection(env: UsEnv): string[] {
  const lines = ["", "--- Test ---"];
  const checks: Array<[string, string]> = [
    ["package.json", "npm test"],
    ["pnpm-lock.yaml", "pnpm test"],
    ["pyproject.toml", "pytest"],
    ["go.mod", "go test ./..."],
    ["Cargo.toml", "cargo test"],
  ];
  for (const [file, cmd] of checks) {
    if (fs.existsSync(path.join(env.root, file))) lines.push(`  progetto:     ${cmd}`);
  }
  return lines;
}

function handoffSection(env: UsEnv): string[] {
  const lines = ["", "--- Handoff ---"];
  const hdir = path.join(env.root, cfg(env, "handoffs_dir", "ultraspec/handoffs"));
  let files: Array<{ f: string; mtime: number }> = [];
  if (fs.existsSync(hdir)) {
    files = fs
      .readdirSync(hdir)
      .filter((f) => f.endsWith(".md") && f.includes("-"))
      .map((f) => ({ f, mtime: fs.statSync(path.join(hdir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  }
  for (const { f } of files.slice(0, 3)) {
    const rel = path.join(hdir, f).replace(env.root + "/", "");
    lines.push(`  ${rel}`);
  }
  return lines;
}

function historySection(env: UsEnv): string[] {
  const lines = ["", "--- History (ultimi eventi) ---"];
  const { state, valid } = readState(env);
  if (valid && state) {
    for (const h of state.history.slice(-8)) {
      let line = `  ${h.at}  ${h.event}`;
      if (h.from) line += ` ${h.from}`;
      if (h.to) line += ` -> ${h.to}`;
      if (h.reason) line += `  («${h.reason}»)`;
      lines.push(line);
    }
  }
  return lines;
}

export function cmdBoard(env: UsEnv, args: string[]): string {
  const statusText = cmdStatus(env, []).replace(/\n+$/, "");
  const lines = [
    statusText,
    ...artifactsSection(env),
    ...allWorkflowsSection(env),
    ...testsSection(env),
    ...handoffSection(env),
    ...historySection(env),
  ];
  return lines.join("\n") + "\n";
}
