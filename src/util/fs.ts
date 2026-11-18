import { promises as fs } from "node:fs";
import path from "node:path";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function findFiles(
  dir: string,
  pattern: RegExp,
  ignoredDirs: ReadonlySet<string> = new Set(["node_modules", ".git", "dist"]),
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          results.push(...(await findFiles(fullPath, pattern, ignoredDirs)));
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore inaccessible directories
  }
  return results;
}

const RUST_IGNORED_DIRS = new Set(["target", "node_modules", ".git", "dist", "fixtures"]);

export async function findRustFiles(dir: string): Promise<string[]> {
  return findFiles(dir, /\.rs$/, RUST_IGNORED_DIRS);
}
