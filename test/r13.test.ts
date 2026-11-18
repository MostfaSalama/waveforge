import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { r13Check } from "../src/repo/r13.js";
import { runRepoChecks } from "../src/repo/index.js";

function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveforge-r13-"));
  return fn(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("R13 - Automated Deployment Scripts", () => {
  it("skips when no Soroban crates are found", async () => {
    const result = await r13Check(path.resolve("test/fixtures/repos/good"));
    expect(result.id).toBe("R13");
    expect(result.status).toBe("skipped");
  });

  it("passes when scripts/deploy.sh exists", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(dir, "scripts", "deploy.sh"), "#!/usr/bin/env bash\nstellar contract deploy --network testnet\n");

      const result = await r13Check(dir, { sorobanCratesFound: true });
      expect(result.id).toBe("R13");
      expect(result.status).toBe("pass");
      expect(result.evidence).toContain("scripts/deploy.sh");
    });
  });

  it("passes when package.json defines a deploy:testnet script", async () => {
    await withTempRepo(async (dir) => {
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "dapp", scripts: { "deploy:testnet": "stellar contract deploy --network testnet" } }),
      );

      const result = await r13Check(dir, { sorobanCratesFound: true });
      expect(result.id).toBe("R13");
      expect(result.status).toBe("pass");
      expect(result.evidence).toContain("package.json: scripts.deploy:testnet");
    });
  });

  it("passes when Makefile defines a deploy target", async () => {
    await withTempRepo(async (dir) => {
      fs.writeFileSync(path.join(dir, "Makefile"), "deploy:\n\tstellar contract deploy --network testnet\n");

      const result = await r13Check(dir, { sorobanCratesFound: true });
      expect(result.id).toBe("R13");
      expect(result.status).toBe("pass");
      expect(result.evidence).toContain("Makefile: deploy");
    });
  });

  it("warns when no deployment scripts are found for Soroban repo", async () => {
    const result = await r13Check(path.resolve("test/fixtures/repos/soroban-no-ci"));
    expect(result.id).toBe("R13");
    expect(result.status).toBe("warn");
    expect(result.fix).toContain("stellar contract deploy");
  });

  it("integrates into runRepoChecks and evaluates R13", async () => {
    const report = await runRepoChecks(path.resolve("test/fixtures/repos/soroban-good"), {
      offline: true,
    });
    const r13 = report.results.find((r) => r.id === "R13");
    expect(r13).toBeDefined();
    expect(["pass", "warn"]).toContain(r13?.status);
  });
});

