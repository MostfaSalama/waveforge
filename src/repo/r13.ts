import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckResult } from "../report.js";
import { dirExists, fileExists, readTextFile } from "../util/fs.js";
import type { CheckOptions } from "./index.js";
import { r7Check } from "./r7.js";

const DEPLOY_SCRIPT_NAME_REGEX = /^deploy.*\.(?:sh|ts|js|mjs|ps1|py)$/i;
const DEPLOY_COMMAND_REGEX = /\b(?:stellar|soroban)\s+contract\s+deploy\b/i;

async function findDeployScriptsInDir(root: string): Promise<string[]> {
  const evidence: string[] = [];
  const scriptsDir = path.join(root, "scripts");
  if (!(await dirExists(scriptsDir))) {
    return evidence;
  }

  try {
    const entries = await fs.readdir(scriptsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && DEPLOY_SCRIPT_NAME_REGEX.test(entry.name)) {
        evidence.push(`scripts/${entry.name}`);
      }
    }
  } catch {
    // ignore unreadable scripts directory
  }
  return evidence;
}

async function findDeployPackageScripts(root: string): Promise<string[]> {
  const evidence: string[] = [];
  const pkgPath = path.join(root, "package.json");
  if (!(await fileExists(pkgPath))) {
    return evidence;
  }

  const content = await readTextFile(pkgPath);
  if (!content) return evidence;

  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };
    if (parsed.scripts && typeof parsed.scripts === "object") {
      for (const [key, val] of Object.entries(parsed.scripts)) {
        const valStr = typeof val === "string" ? val : "";
        if (/^deploy(?::|$)/i.test(key) || DEPLOY_COMMAND_REGEX.test(valStr)) {
          evidence.push(`package.json: scripts.${key}`);
        }
      }
    }
  } catch {
    // ignore malformed package.json
  }
  return evidence;
}

async function findDeployMakefileTarget(root: string): Promise<string[]> {
  for (const name of ["Makefile", "makefile"]) {
    const mkPath = path.join(root, name);
    if (await fileExists(mkPath)) {
      const content = await readTextFile(mkPath);
      if (content && /^deploy(?:-testnet)?\s*:/m.test(content)) {
        return [`${name}: deploy`];
      }
    }
  }
  return [];
}

/**
 * R13: Checks whether Soroban repositories provide reproducible automated
 * deployment scripts (e.g. `scripts/deploy.sh`, `package.json` deploy scripts, or `Makefile` targets).
 */
export async function r13Check(root: string, options: CheckOptions = {}): Promise<CheckResult> {
  let sorobanFound = options.sorobanCratesFound;
  if (sorobanFound === undefined) {
    const r7Result = await r7Check(root);
    sorobanFound = r7Result.status !== "skipped";
  }

  if (!sorobanFound) {
    return {
      id: "R13",
      title: "Automated Deployment Scripts",
      status: "skipped",
      message: "No Soroban crates found.",
      fix: "Add a Cargo.toml with soroban-sdk if this repository contains Soroban contracts.",
    };
  }

  const evidence = [
    ...(await findDeployScriptsInDir(root)),
    ...(await findDeployPackageScripts(root)),
    ...(await findDeployMakefileTarget(root)),
  ];

  if (evidence.length > 0) {
    return {
      id: "R13",
      title: "Automated Deployment Scripts",
      status: "pass",
      message: `Found ${evidence.length} automated deployment script/target(s).`,
      evidence,
    };
  }

  return {
    id: "R13",
    title: "Automated Deployment Scripts",
    status: "warn",
    message: "No automated testnet deployment scripts found for Soroban contracts.",
    fix: "Add a reproducible deployment script (e.g. scripts/deploy.sh or package.json deploy:testnet) using 'stellar contract deploy --network testnet'.",
  };
}

r13Check.id = "R13";
r13Check.title = "Automated Deployment Scripts";

