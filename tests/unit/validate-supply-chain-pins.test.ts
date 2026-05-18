import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname ?? __dirname, '../..');
const SCAN_DIRS = ['scripts', 'src'];
const SCAN_EXTS = new Set(['.ts', '.sh', '.ps1', '.json']);
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'graphify-out', 'dist']);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (SCAN_EXTS.has(entry.slice(entry.lastIndexOf('.')))) {
      results.push(full);
    }
  }
  return results;
}

// Extracts all git+https:// URLs from a line
const GIT_URL = /git\+https:\/\/[^\s"'`]+/g;
// A pinned URL must end with @<tag> where tag is non-empty alphanumeric/dot/dash/underscore
const PINNED = /@[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

describe('supply-chain: all git+ install URLs must be pinned', () => {
  it('no unpinned git+ URL in scripts/ or src/', () => {
    const violations: string[] = [];
    for (const scanDir of SCAN_DIRS) {
      const dir = join(ROOT, scanDir);
      for (const file of collectFiles(dir)) {
        const content = readFileSync(file, 'utf-8');
        const rel = file.slice(ROOT.length + 1);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          GIT_URL.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = GIT_URL.exec(line)) !== null) {
            const url = match[0];
            if (!PINNED.test(url)) {
              violations.push(`${rel}:${idx + 1}: unpinned git+ URL: ${url}`);
            }
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
