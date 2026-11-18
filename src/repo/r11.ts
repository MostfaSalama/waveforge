import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckResult } from "../report.js";
import { readTextFile } from "../util/fs.js";
import type { CheckOptions } from "./index.js";
import { r7Check } from "./r7.js";

const TTL_CALL_REGEX = /\b(?:extend_ttl(?:_instance)?|extend_instance_ttl)\s*\(/;
const IGNORED_DIRS = new Set(["target", "node_modules", ".git", "dist", "fixtures"]);

async function collectRustFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          results.push(...(await collectRustFiles(fullPath)));
        }
      } else if (entry.isFile() && entry.name.endsWith(".rs")) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return results;
}

/**
 * R11: Checks whether Soroban smart contracts manage storage lifetimes
 * via `extend_ttl` / `extend_ttl_instance` / `extend_instance_ttl`.
 */
export async function r11Check(root: string, options: CheckOptions = {}): Promise<CheckResult> {
  let sorobanFound = options.sorobanCratesFound;
  if (sorobanFound === undefined) {
    const r7Result = await r7Check(root);
    sorobanFound = r7Result.status !== "skipped";
  }

  if (!sorobanFound) {
    return {
      id: "R11",
      title: "Contract Storage TTL Extension",
      status: "skipped",
      message: "No Soroban crates found.",
      fix: "Add a Cargo.toml with soroban-sdk if this repository contains Soroban contracts.",
    };
  }

  const rustFiles = await collectRustFiles(root);
  const evidence: string[] = [];

  for (const filePath of rustFiles) {
    const content = await readTextFile(filePath);
    if (!content) continue;

    const relPath = path.relative(root, filePath).replace(/\\/g, "/");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith("//")) continue;
      if (TTL_CALL_REGEX.test(trimmed)) {
        evidence.push(`${relPath}:${i + 1}: ${trimmed}`);
      }
    }
  }

  if (evidence.length > 0) {
    return {
      id: "R11",
      title: "Contract Storage TTL Extension",
      status: "pass",
      message: `Detected Soroban storage TTL extension logic (${evidence.length} call site${evidence.length === 1 ? "" : "s"}).`,
      evidence: evidence.slice(0, 10),
    };
  }

  return {
    id: "R11",
    title: "Contract Storage TTL Extension",
    status: "warn",
    message: "No Soroban contract storage TTL extension calls (extend_ttl) found in Rust sources.",
    fix: "Add env.storage().instance().extend_ttl(...) or persistent storage TTL extension to prevent contract archival.",
  };
}

r11Check.id = "R11";
r11Check.title = "Contract Storage TTL Extension";

