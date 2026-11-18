import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRepoFixes } from "../src/fix.js";
import { runRepoChecks } from "../src/repo/index.js";

function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveforge-fix-"));
  return fn(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("applyRepoFixes (--fix scaffolding)", () => {
  it("scaffolds missing CONTRIBUTING.md, SECURITY.md, and issue templates and resolves R3/R4/R5", async () => {
    await withTempRepo(async (dir) => {
      fs.writeFileSync(path.join(dir, "LICENSE"), "Apache-2.0");
      fs.writeFileSync(
        path.join(dir, "README.md"),
        "# Demo\n\nA Stellar Soroban project.\n\n## Quick Start\nRun tests.\n",
      );

      const before = await runRepoChecks(dir, { offline: true });
      expect(before.results.find((r) => r.id === "R3")?.status).toBe("fail");
      expect(before.results.find((r) => r.id === "R4")?.status).toBe("warn");
      expect(before.results.find((r) => r.id === "R5")?.status).toBe("warn");

      const created = await applyRepoFixes(dir, before.results);
      expect(created).toEqual([
        "CONTRIBUTING.md",
        "SECURITY.md",
        ".github/ISSUE_TEMPLATE/config.yml",
        ".github/ISSUE_TEMPLATE/bug.yml",
        ".github/ISSUE_TEMPLATE/feature.yml",
      ]);

      const after = await runRepoChecks(dir, { offline: true });
      expect(after.results.find((r) => r.id === "R3")?.status).toBe("pass");
      expect(after.results.find((r) => r.id === "R4")?.status).toBe("pass");
      expect(after.results.find((r) => r.id === "R5")?.status).toBe("pass");
    });
  });

  it("never overwrites existing customized templates unless force is true", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, ".github", "ISSUE_TEMPLATE"), { recursive: true });
      const customBug = "name: Custom Bug\ndescription: Custom\n";
      fs.writeFileSync(path.join(dir, ".github", "ISSUE_TEMPLATE", "bug.yml"), customBug);

      const fakeResults = [
        { id: "R5", title: "Issue Templates", status: "warn" as const, message: "Missing config.yml" },
      ];

      const createdWithoutForce = await applyRepoFixes(dir, fakeResults, { force: false });
      expect(createdWithoutForce).not.toContain(".github/ISSUE_TEMPLATE/bug.yml");
      expect(fs.readFileSync(path.join(dir, ".github", "ISSUE_TEMPLATE", "bug.yml"), "utf-8")).toBe(
        customBug,
      );

      const createdWithForce = await applyRepoFixes(dir, fakeResults, { force: true });
      expect(createdWithForce).toContain(".github/ISSUE_TEMPLATE/bug.yml");
    });
  });

  it("CLI repo --fix scaffolds missing files in target directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveforge-cli-fix-"));
    try {
      fs.writeFileSync(path.join(dir, "LICENSE"), "MIT");
      fs.writeFileSync(
        path.join(dir, "README.md"),
        "# Demo\n\nA Stellar Soroban project.\n\n## Getting Started\nInstall.\n",
      );

      const cliPath = path.resolve(process.cwd(), "dist/cli.js");
      const res = spawnSync(process.execPath, [cliPath, "repo", dir, "--fix", "--offline"], {
        encoding: "utf-8",
      });

      expect(res.stderr).toContain("Scaffolded 5 file(s)");
      expect(fs.existsSync(path.join(dir, "CONTRIBUTING.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "SECURITY.md"))).toBe(true);
      expect(fs.existsSync(path.join(dir, ".github/ISSUE_TEMPLATE/config.yml"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

