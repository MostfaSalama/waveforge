import { describe, it, expect } from "vitest";
import { formatSarif } from "../src/sarif.js";
import type { Report } from "../src/report.js";

describe("SARIF v2.1.0 formatter", () => {
  it("produces valid SARIF v2.1.0 output with rules, levels, and locations", () => {
    const report: Report = {
      kind: "repo",
      target: ".",
      score: 50,
      generatedAt: "2026-11-18T12:00:00.000Z",
      results: [
        {
          id: "R1",
          title: "License Check",
          status: "pass",
          message: "Apache-2.0 license found.",
        },
        {
          id: "R8",
          title: "On-Chain Contract Verification",
          status: "skipped",
          message: "Offline mode.",
        },
        {
          id: "R12",
          title: "Contract State Authorization",
          status: "warn",
          message: "Missing require_auth.",
          fix: "Add require_auth().",
          evidence: ["contracts/token/src/lib.rs:42: pub fn mint"],
        },
        {
          id: "R3",
          title: "Contributing Guide",
          status: "fail",
          message: "Missing CONTRIBUTING.md.",
          fix: "Create CONTRIBUTING.md.",
        },
      ],
    };

    const raw = formatSarif(report);
    const sarif = JSON.parse(raw) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { name: string; rules: Array<{ id: string }> } };
        results: Array<{
          ruleId: string;
          level: string;
          message: { text: string };
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region?: { startLine: number };
            };
          }>;
        }>;
      }>;
    };

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0.json");
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0]!;
    expect(run.tool.driver.name).toBe("waveforge");
    expect(run.tool.driver.rules.map((r) => r.id)).toEqual(["R1", "R8", "R12", "R3"]);

    // Only warn and fail should appear in results
    expect(run.results).toHaveLength(2);
    expect(run.results[0]!.ruleId).toBe("R12");
    expect(run.results[0]!.level).toBe("warning");
    expect(run.results[0]!.locations[0]!.physicalLocation).toEqual({
      artifactLocation: { uri: "contracts/token/src/lib.rs" },
      region: { startLine: 42 },
    });

    expect(run.results[1]!.ruleId).toBe("R3");
    expect(run.results[1]!.level).toBe("error");
    expect(run.results[1]!.message.text).toContain("Fix: Create CONTRIBUTING.md.");
    expect(run.results[1]!.locations[0]!.physicalLocation.artifactLocation.uri).toBe("README.md");
  });
});

