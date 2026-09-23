import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { listFiles } from '../leak-check/scan';
import { checkClientSource, checkEngineSource, type Violation } from './rules';

const repoRoot = resolve(import.meta.dirname, '../..');
const isSource = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f);
const filesIn = (dir: string) => listFiles(resolve(repoRoot, dir)).filter(isSource);
const rel = (f: string) => relative(repoRoot, f);

const violations: Violation[] = [];
for (const file of filesIn('packages/engine/src')) {
  violations.push(...checkEngineSource(rel(file), readFileSync(file, 'utf8')));
}
for (const dir of ['packages/ui/src', 'packages/platform/src', 'packages/art-placeholder/src', 'apps/web/src']) {
  for (const file of filesIn(dir)) violations.push(...checkClientSource(rel(file), readFileSync(file, 'utf8')));
}

if (violations.length > 0) {
  for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}`);
  console.error(`lint-boundaries: ${violations.length} violation(s)`);
  process.exit(1);
}
console.log('lint-boundaries: ok');
