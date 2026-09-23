/**
 * Post-build leak check (docs/build-plan.md §3).
 *   Demo builds: no campaign tokens, no Case Lab, no source maps.
 *   Full builds: must contain the campaign canary (proves the check can see content).
 *   dev-full: must contain the Case Lab marker (proves the lab check works).
 * Usage: pnpm leak-check [--targets web-demo,web-itch]
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { isTargetId, TARGET_IDS, TARGETS } from '@cots/content-schema';
import { findTokens, listFiles } from './scan';

const CASE_LAB_MARKER = 'cots-case-lab';
const repoRoot = resolve(import.meta.dirname, '../..');

const flag = process.argv.indexOf('--targets');
const requested = flag >= 0 ? (process.argv[flag + 1] ?? '').split(',').filter(Boolean) : TARGET_IDS;

const tokensFile = resolve(repoRoot, 'generated/leak/campaign.tokens.json');
if (!existsSync(tokensFile)) {
  console.error('leak-check: generated/leak/campaign.tokens.json is missing. Run a build first.');
  process.exit(1);
}
const campaign = JSON.parse(readFileSync(tokensFile, 'utf8')) as { canary: string | null; tokens: string[] };
if (!campaign.canary) {
  console.error('leak-check: the campaign pack has no canary.');
  process.exit(1);
}

const failures: string[] = [];
for (const id of requested) {
  if (!isTargetId(id)) {
    failures.push(`${id}: unknown target`);
    continue;
  }
  const target = TARGETS[id];
  const dist = resolve(repoRoot, 'dist', id);
  if (!existsSync(dist)) {
    failures.push(`${id}: dist/${id} not found (build it first)`);
    continue;
  }

  if (target.edition === 'demo') {
    for (const f of findTokens(dist, campaign.tokens)) failures.push(`${id}: campaign token "${f.token}" in ${f.file}`);
    for (const map of listFiles(dist).filter((file) => file.endsWith('.map'))) {
      failures.push(`${id}: source map ${relative(dist, map)} in a public build`);
    }
  } else if (findTokens(dist, [campaign.canary]).length === 0) {
    failures.push(`${id}: campaign canary missing from a full build (positive control failed)`);
  }

  const lab = findTokens(dist, [CASE_LAB_MARKER]).length > 0;
  if (target.lab && !lab) failures.push(`${id}: Case Lab marker missing (positive control failed)`);
  if (!target.lab && lab) failures.push(`${id}: Case Lab code shipped in a non-dev build`);

  if (!failures.some((f) => f.startsWith(`${id}:`))) {
    console.log(`leak-check: ${id} ok (${target.edition}${target.lab ? ', lab' : ''})`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((f) => `leak-check: FAIL ${f}`).join('\n'));
  process.exit(1);
}
