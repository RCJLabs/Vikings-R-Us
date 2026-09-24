/**
 * The story script and signing scenes off (docs/tech-spec.md §31).
 *
 * Usage:
 *   pnpm story:script [--out dist/story-script]
 *     Writes index.html (the script as a standalone page) and page.html (the
 *     same, as an artifact publishes it), and prints what the flag index found.
 *   pnpm story:approve d1.morning d3.night …
 *     Signs scenes off: removes each one's `# draft` mark.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTarget, loadPacks } from '@cots/content-compiler';
import { TARGETS } from '@cots/content-schema';
import { sceneName, signOff } from './approve';
import { buildModel } from './model';
import { renderScript } from './render';

const repoRoot = resolve(import.meta.dirname, '../..');
const [command = 'script', ...args] = process.argv.slice(2);
const target = 'dev-full';
const built = buildTarget(TARGETS[target], loadPacks(resolve(repoRoot, 'content/packs')));

if (command === 'approve') {
  if (args.length === 0) {
    console.error('Name the scenes to sign off: pnpm story:approve d1.morning d3.night');
    process.exit(1);
  }
  const files = new Map(built.scenes.map((s) => [s.id.replace(/^scene\./, ''), s.file]));
  let failed = false;
  for (const arg of args) {
    const name = sceneName(arg);
    const file = files.get(name);
    if (!file) {
      console.error(`${name}: no such scene (they're named like d9.night)`);
      failed = true;
      continue;
    }
    const { source, changed } = signOff(readFileSync(file, 'utf8'));
    if (changed) writeFileSync(file, source);
    console.log(`${name}: ${changed ? 'signed off' : 'already signed off'}`);
  }
  process.exit(failed ? 1 : 0);
}

if (command !== 'script') {
  console.error(`Unknown command "${command}" (script or approve)`);
  process.exit(1);
}
const i = args.indexOf('--out');
const outDir = resolve(repoRoot, i >= 0 ? (args[i + 1] ?? 'dist/story-script') : 'dist/story-script');
const model = buildModel({ ...built, target });
const { body, document } = renderScript(model, new Date().toISOString().slice(0, 10));
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'index.html'), document);
writeFileSync(resolve(outDir, 'page.html'), body);
const unread = model.flags.filter((f) => f.setBy.length > 0 && f.readBy.length === 0).map((f) => f.name);
const unset = model.flags.filter((f) => f.setBy.length === 0).map((f) => f.name);
console.log(
  `story script ${model.version}: ${model.totals.scenes} scenes (${model.totals.drafts} draft), ${model.totals.words} words, ${model.flags.length} flags -> ${resolve(outDir, 'index.html')}`,
);
if (unread.length > 0) console.log(`  set but read nowhere yet: ${unread.join(', ')}`);
if (unset.length > 0) console.log(`  read but set nowhere: ${unset.join(', ')}`);
