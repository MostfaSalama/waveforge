import path from "node:path";
import type { CheckResult } from "../report.js";
import { findRustFiles, readTextFile } from "../util/fs.js";
import type { CheckOptions } from "./index.js";
import { r7Check } from "./r7.js";

const PUB_FN_REGEX = /\bpub\s+(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/;
const STORAGE_ACCESS_REGEX = /\.storage\s*\(\s*\)/;
const MUTATION_CALL_REGEX = /\.(?:set|remove|update)\s*\(|update_current_contract_wasm\s*\(/;
const AUTH_CALL_REGEX = /\.require_auth(?:_for_args)?\s*\(/;

interface MutatingFn {
  name: string;
  line: number;
  hasAuth: boolean;
}

function isTestFile(relPath: string): boolean {
  const base = path.basename(relPath);
  return base === "test.rs" || base === "tests.rs" || relPath.includes("/tests/");
}

function countBraces(line: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  for (const ch of line) {
    if (ch === "{") open++;
    else if (ch === "}") close++;
  }
  return { open, close };
}

function analyzeRustSource(content: string): MutatingFn[] {
  const lines = content.split(/\r?\n/);
  const findings: MutatingFn[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith("#[cfg(test)]")) {
      break;
    }
    if (trimmed.startsWith("//")) continue;

    const match = PUB_FN_REGEX.exec(trimmed);
    if (!match) continue;

    const fnName = match[1]!;
    const startLine = i + 1;
    const bodyLines: string[] = [];
    let depth = 0;
    let enteredBody = false;

    for (let j = i; j < lines.length; j++) {
      const current = lines[j]!;
      bodyLines.push(current);
      const { open, close } = countBraces(current);
      if (open > 0) enteredBody = true;
      depth += open - close;

      if (enteredBody && depth <= 0) {
        i = j;
        break;
      }
      if (!enteredBody && current.includes(";")) {
        i = j;
        break;
      }
    }

    const body = bodyLines.join("\n");
    const mutatesStorage =
      (STORAGE_ACCESS_REGEX.test(body) && MUTATION_CALL_REGEX.test(body)) ||
      /update_current_contract_wasm\s*\(/.test(body);

    if (mutatesStorage) {
      findings.push({
        name: fnName,
        line: startLine,
        hasAuth: AUTH_CALL_REGEX.test(body),
      });
    }
  }

  return findings;
}

/**
 * R12: Checks whether state-mutating public functions in Soroban Rust
 * contracts invoke `require_auth()` or `require_auth_for_args()`.
 */
export async function r12Check(root: string, options: CheckOptions = {}): Promise<CheckResult> {
  let sorobanFound = options.sorobanCratesFound;
  if (sorobanFound === undefined) {
    const r7Result = await r7Check(root);
    sorobanFound = r7Result.status !== "skipped";
  }

  if (!sorobanFound) {
    return {
      id: "R12",
      title: "Contract State Authorization",
      status: "skipped",
      message: "No Soroban crates found.",
      fix: "Add a Cargo.toml with soroban-sdk if this repository contains Soroban contracts.",
    };
  }

  const rustFiles = await findRustFiles(root);
  const missingAuth: string[] = [];
  const verifiedAuth: string[] = [];

  for (const filePath of rustFiles) {
    const relPath = path.relative(root, filePath).replace(/\\/g, "/");
    if (isTestFile(relPath)) continue;

    const content = await readTextFile(filePath);
    if (!content) continue;

    const mutatingFns = analyzeRustSource(content);
    for (const fn of mutatingFns) {
      const ref = `${relPath}:${fn.line}: pub fn ${fn.name}`;
      if (fn.hasAuth) {
        verifiedAuth.push(ref);
      } else {
        missingAuth.push(ref);
      }
    }
  }

  if (missingAuth.length > 0) {
    return {
      id: "R12",
      title: "Contract State Authorization",
      status: "warn",
      message: `Found ${missingAuth.length} state-mutating public function(s) without explicit require_auth().`,
      evidence: missingAuth.slice(0, 10),
      fix: "Invoke address.require_auth() or address.require_auth_for_args() in state-mutating public contract functions.",
    };
  }

  return {
    id: "R12",
    title: "Contract State Authorization",
    status: "pass",
    message:
      verifiedAuth.length > 0
        ? `All ${verifiedAuth.length} state-mutating public function(s) enforce require_auth().`
        : "No unauthenticated state-mutating public functions detected.",
    evidence: verifiedAuth.length > 0 ? verifiedAuth.slice(0, 10) : undefined,
  };
}

r12Check.id = "R12";
r12Check.title = "Contract State Authorization";

