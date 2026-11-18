import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { r12Check } from "../src/repo/r12.js";
import { runRepoChecks } from "../src/repo/index.js";

function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveforge-r12-"));
  return fn(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("R12 - Contract State Authorization", () => {
  it("skips when no Soroban crates are found", async () => {
    const result = await r12Check(path.resolve("test/fixtures/repos/good"));
    expect(result.id).toBe("R12");
    expect(result.status).toBe("skipped");
  });

  it("passes when state-mutating public functions enforce require_auth", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Cargo.toml"),
        '[package]\nname = "vault"\nversion = "0.1.0"\n\n[dependencies]\nsoroban-sdk = "22.0.0"\n',
      );
      fs.writeFileSync(
        path.join(dir, "src", "lib.rs"),
        [
          "pub fn deposit(env: Env, user: Address, amount: i128) {",
          "    user.require_auth();",
          "    env.storage().persistent().set(&user, &amount);",
          "}",
          "",
          "pub fn balance(env: Env, user: Address) -> i128 {",
          "    env.storage().persistent().get(&user).unwrap_or(0)",
          "}",
        ].join("\n"),
      );

      const result = await r12Check(dir, { sorobanCratesFound: true });
      expect(result.id).toBe("R12");
      expect(result.status).toBe("pass");
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence?.[0]).toContain("src/lib.rs:1: pub fn deposit");
    });
  });

  it("warns when a state-mutating public function lacks require_auth", async () => {
    await withTempRepo(async (dir) => {
      fs.mkdirSync(path.join(dir, "contracts", "pool", "src"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "contracts", "pool", "Cargo.toml"),
        '[package]\nname = "pool"\nversion = "0.1.0"\n\n[dependencies]\nsoroban-sdk = "22.0.0"\n',
      );
      fs.writeFileSync(
        path.join(dir, "contracts", "pool", "src", "lib.rs"),
        [
          "pub fn unsafe_set(env: Env, val: u32) {",
          "    env.storage().instance().set(&KEY, &val);",
          "}",
          "",
          "#[cfg(test)]",
          "mod test {",
          "    pub fn helper_set(env: Env) {",
          "        env.storage().instance().set(&KEY, &1);",
          "    }",
          "}",
        ].join("\n"),
      );

      const result = await r12Check(dir);
      expect(result.id).toBe("R12");
      expect(result.status).toBe("warn");
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence?.[0]).toContain("contracts/pool/src/lib.rs:1: pub fn unsafe_set");
    });
  });

  it("integrates into runRepoChecks and evaluates R12", async () => {
    const report = await runRepoChecks(path.resolve("test/fixtures/repos/soroban-good"), {
      offline: true,
    });
    const r12 = report.results.find((r) => r.id === "R12");
    expect(r12).toBeDefined();
    expect(["pass", "warn"]).toContain(r12?.status);
  });
});

