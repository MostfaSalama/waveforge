import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { r11Check } from "../src/repo/r11.js";
import { runRepoChecks } from "../src/repo/index.js";

function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveforge-r11-"));
  return fn(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("R11 - Contract Storage TTL Extension", () => {
  it("skips when no Soroban crates are found", async () => {
    const result = await r11Check(path.resolve("test/fixtures/repos/good"));
    expect(result.id).toBe("R11");
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No Soroban crates found");
  });

  it("passes when contract source calls env.storage().instance().extend_ttl", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, "contracts", "token", "src"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "contracts", "token", "Cargo.toml"),
        '[package]\nname = "token"\nversion = "0.1.0"\n\n[dependencies]\nsoroban-sdk = "22.0.0"\n',
      );
      fs.writeFileSync(
        path.join(dir, "contracts", "token", "src", "lib.rs"),
        [
          "use soroban_sdk::{contract, contractimpl, Env};",
          "#[contract]",
          "pub struct Token;",
          "#[contractimpl]",
          "impl Token {",
          "    pub fn bump(env: Env) {",
          "        env.storage().instance().extend_ttl(100, 1000);",
          "    }",
          "}",
        ].join("\n"),
      );

      const result = await r11Check(dir, { sorobanCratesFound: true });
      expect(result.id).toBe("R11");
      expect(result.status).toBe("pass");
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence?.[0]).toContain("contracts/token/src/lib.rs:7");
    });
  });

  it("warns when Soroban contract has no TTL extension calls", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Cargo.toml"),
        '[package]\nname = "vault"\nversion = "0.1.0"\n\n[dependencies]\nsoroban-sdk = "22.0.0"\n',
      );
      fs.writeFileSync(
        path.join(dir, "src", "lib.rs"),
        [
          "// env.storage().instance().extend_ttl(100, 1000); commented out",
          "pub fn set_val(env: Env) {",
          "    env.storage().persistent().set(&key, &val);",
          "}",
        ].join("\n"),
      );

      const result = await r11Check(dir);
      expect(result.id).toBe("R11");
      expect(result.status).toBe("warn");
      expect(result.fix).toContain("extend_ttl");
    });
  });

  it("integrates into runRepoChecks and evaluates R11", async () => {
    const report = await runRepoChecks(path.resolve("test/fixtures/repos/soroban-good"), {
      offline: true,
    });
    const r11 = report.results.find((r) => r.id === "R11");
    expect(r11).toBeDefined();
    expect(["pass", "warn"]).toContain(r11?.status);
  });
});

