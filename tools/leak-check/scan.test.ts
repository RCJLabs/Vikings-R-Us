import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { findTokens } from './scan';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('finds tokens in nested text and binary files, and reports nothing when clean', () => {
  dir = mkdtempSync(join(tmpdir(), 'cots-leak-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index.js'), 'const s = {"campaign.days":"x"};');
  writeFileSync(join(dir, 'blob.bin'), Buffer.concat([Buffer.from([0, 255, 7]), Buffer.from('ǫ-canary')]));
  writeFileSync(join(dir, 'clean.css'), 'body{}');

  expect(findTokens(dir, ['campaign.days', 'ǫ-canary', 'absent'])).toEqual([
    { token: 'campaign.days', file: join('assets', 'index.js') },
    { token: 'ǫ-canary', file: 'blob.bin' },
  ]);
  expect(findTokens(dir, ['absent'])).toEqual([]);
});
