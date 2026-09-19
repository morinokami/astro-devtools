import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach } from "vite-plus/test";

/**
 * Temporary project roots for tests that resolve files or packages from
 * disk. Call `useTempRoots()` at a test file's top level: the returned
 * factory writes `files` (relative path → content) under a fresh directory,
 * and every directory created during a test is removed after it.
 */
export function useTempRoots(): (files: Record<string, string>) => URL {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  return (files) => {
    const dir = mkdtempSync(path.join(tmpdir(), "astro-devtools-test-"));
    tempDirs.push(dir);
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return pathToFileURL(`${dir}/`);
  };
}
