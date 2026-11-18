import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./report.js";
import { fileExists } from "./util/fs.js";

export interface FixOptions {
  force?: boolean;
}

const SECURITY_TEMPLATE = `# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.
Instead, report them privately to the repository maintainers via GitHub Security Advisories or direct contact.

## Scope

- All smart contract source code and off-chain tooling in this repository.
- Never commit secret keys (\`S...\`) or unmasked credentials.
`;

const CONTRIBUTING_TEMPLATE = `# Contributing

Thank you for contributing! This project participates in the **Stellar Wave** program.

## Setup

Install dependencies and ensure your local toolchain is up to date.

## Testing

Run the full test suite and linters before opening a pull request.

## Stellar Wave Guidelines

- Look for issues labeled \`stellar-wave\`.
- Follow the acceptance criteria ("Done when" checklist) in each issue.
- See https://docs.drips.network/wave for program details.
`;

const ISSUE_CONFIG_TEMPLATE = `blank_issues_enabled: false
`;

const BUG_TEMPLATE = `name: Bug Report
description: Report a reproducible bug
labels: ["bug"]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Describe the bug and steps to reproduce it.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
`;

const FEATURE_TEMPLATE = `name: Feature Request
description: Propose a scoped enhancement or new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Explain the problem and proposed solution.
    validations:
      required: true
  - type: textarea
    id: done-when
    attributes:
      label: Done when
      value: |
        - [ ] Implementation complete
        - [ ] Unit tests added and passing
    validations:
      required: true
`;

async function writeIfMissing(
  root: string,
  relPath: string,
  content: string,
  force: boolean,
): Promise<string | null> {
  const fullPath = path.join(root, relPath);
  if (!force && (await fileExists(fullPath))) {
    return null;
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
  return relPath;
}

/**
 * Scaffolds missing community and issue template files based on repository check results.
 * Never overwrites existing files unless `options.force` is true.
 */
export async function applyRepoFixes(
  repoPath: string,
  results: CheckResult[],
  options: FixOptions = {},
): Promise<string[]> {
  const force = Boolean(options.force);
  const created: string[] = [];
  const byId = new Map(results.map((r) => [r.id, r]));

  const r3 = byId.get("R3");
  if (r3 && r3.status === "fail") {
    const written = await writeIfMissing(repoPath, "CONTRIBUTING.md", CONTRIBUTING_TEMPLATE, force);
    if (written) created.push(written);
  }

  const r4 = byId.get("R4");
  if (r4 && (r4.status === "warn" || r4.status === "fail")) {
    const written = await writeIfMissing(repoPath, "SECURITY.md", SECURITY_TEMPLATE, force);
    if (written) created.push(written);
  }

  const r5 = byId.get("R5");
  if (r5 && (r5.status === "warn" || r5.status === "fail")) {
    const cfg = await writeIfMissing(
      repoPath,
      ".github/ISSUE_TEMPLATE/config.yml",
      ISSUE_CONFIG_TEMPLATE,
      force,
    );
    if (cfg) created.push(cfg);

    const bug = await writeIfMissing(
      repoPath,
      ".github/ISSUE_TEMPLATE/bug.yml",
      BUG_TEMPLATE,
      force,
    );
    if (bug) created.push(bug);

    const feature = await writeIfMissing(
      repoPath,
      ".github/ISSUE_TEMPLATE/feature.yml",
      FEATURE_TEMPLATE,
      force,
    );
    if (feature) created.push(feature);
  }

  return created;
}

