import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

export interface Finding {
  token: string;
  file: string;
}

/**
 * Every (token, file) pair where a token's UTF-8 bytes appear in a file under
 * `dir`. Files are compared as raw bytes, so nothing hides in binary assets.
 */
export function findTokens(dir: string, tokens: readonly string[]): Finding[] {
  const needles = tokens.map((token) => ({ token, bytes: Buffer.from(token, 'utf8').toString('latin1') }));
  const found: Finding[] = [];
  for (const file of listFiles(dir)) {
    const haystack = readFileSync(file).toString('latin1');
    for (const { token, bytes } of needles) {
      if (haystack.includes(bytes)) found.push({ token, file: relative(dir, file) });
    }
  }
  return found;
}
