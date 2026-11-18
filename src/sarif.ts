import type { CheckResult, Report, Status } from "./report.js";

const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
const EVIDENCE_LOCATION_REGEX = /^([^:\s][^:]*):(\d+)(?::|$)/;

type SarifLevel = "error" | "warning" | "note";

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
    };
    region?: {
      startLine: number;
    };
  };
}

function mapStatusToLevel(status: Status): SarifLevel {
  switch (status) {
    case "fail":
      return "error";
    case "warn":
      return "warning";
    default:
      return "note";
  }
}

function extractLocations(result: CheckResult, fallbackTarget: string): SarifLocation[] {
  const locations: SarifLocation[] = [];

  if (result.evidence && result.evidence.length > 0) {
    for (const item of result.evidence) {
      const match = EVIDENCE_LOCATION_REGEX.exec(item);
      if (match) {
        const uri = match[1]!.replace(/\\/g, "/");
        const startLine = Number.parseInt(match[2]!, 10);
        if (Number.isFinite(startLine) && startLine >= 1) {
          locations.push({
            physicalLocation: {
              artifactLocation: { uri },
              region: { startLine },
            },
          });
        }
      }
    }
  }

  if (locations.length === 0) {
    const normalized = fallbackTarget.replace(/\\/g, "/");
    locations.push({
      physicalLocation: {
        artifactLocation: {
          uri: normalized === "." || normalized === "" ? "README.md" : normalized,
        },
      },
    });
  }

  return locations;
}

/**
 * Formats a WaveForge Report as a SARIF v2.1.0 JSON string
 * for GitHub Code Scanning and CI security integrations.
 */
export function formatSarif(report: Report): string {
  const rules = report.results.map((r) => ({
    id: r.id,
    name: r.title,
    shortDescription: { text: r.title },
    help: { text: r.fix ?? r.message },
    defaultConfiguration: {
      level: mapStatusToLevel(r.status),
    },
  }));

  const results = report.results
    .filter((r) => r.status === "fail" || r.status === "warn")
    .map((r) => ({
      ruleId: r.id,
      level: mapStatusToLevel(r.status),
      message: {
        text: r.fix ? `${r.message} Fix: ${r.fix}` : r.message,
      },
      locations: extractLocations(r, report.target),
    }));

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "waveforge",
            informationUri: "https://github.com/Soroban-Clear-Sign-Kit/waveforge",
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

