/** Prints generated souls with their evidence and solver view. Usage: pnpm exec tsx tools/sim/dump.ts <day> <seed> [index] */

import { resolve } from 'node:path';
import { buildTarget, loadPacks } from '@cots/content-compiler';
import { TARGETS } from '@cots/content-schema';
import { createDayContext, generateCaseAt, planDay, questionResponse, revealsOf, solve } from '@cots/engine';
import { loadContent } from '@cots/testkit';

const [dayArg, seed = 'demo', indexArg] = process.argv.slice(2);
const day = Number(dayArg ?? '1');
const content = loadContent('dev-full');
const { strings } = buildTarget(TARGETS['dev-full'], loadPacks(resolve(import.meta.dirname, '../../content/packs')));
const t = (k: string, p: Record<string, string | number> = {}) =>
  (strings[k] ?? `⟦${k}⟧`).replace(/\{(\w+)\}/g, (m, n: string) => (n in p ? String(p[n]) : m));

const ctx = createDayContext(content, day, seed);
const plan = planDay(seed, ctx);
console.log(`DAY ${day} (${seed}): ${t(ctx.spec.decree)}`);
for (const [name, c] of Object.entries(ctx.paramChoices)) console.log(`  ${name}: ${t(c.text)}`);
console.log(`  queue: ${plan.targets.join(' ')}`);
const indices = indexArg ? [Number(indexArg)] : plan.targets.map((_, i) => i);
for (const i of indices) {
  const { case: c } = generateCaseAt(seed, ctx, i);
  const s = solve(c.evidence.fields, ctx, { reveals: revealsOf(c.lies) });
  console.log(
    `\n#${i} ${c.evidence.look.name} ${c.evidence.look.patronym} (${c.archetype}, ${c.evidence.persona}) -> ${c.expect.dest} by ${c.expect.rule}`,
  );
  console.log(
    `  truth: ${Object.entries(c.truth)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );
  for (const f of c.evidence.fields) {
    const what = f.obs
      ? `${f.obs.key}=${f.obs.value}`
      : f.cue
        ? `cue ${f.cue.key}${c.meta.decoys.includes(f.id) ? ' (decoy)' : ''}`
        : t(f.text?.msg ?? '', f.text?.params ?? {});
    const lie = c.lies.find((l) => l.field === f.id);
    console.log(
      `  ${f.id.padEnd(22)} ${what}${lie ? `   <- LIE (${lie.fact}: really ${lie.truth}; will ${lie.onQuestion})` : ''}`,
    );
  }
  console.log(`  proof: ${c.meta.proof.join(', ')} (${c.meta.proofCostS}s), difficulty ${c.meta.difficulty}`);
  console.log(
    `  solver: ${s.judgment.kind === 'determined' ? s.judgment.dest : 'UNDETERMINED'}; contradictions: ${s.contradictions.map((x) => `${x.lie} vs ${x.against.join('+')}`).join('; ') || 'none'}`,
  );
  for (const x of s.contradictions) {
    const q = questionResponse(c, x.lie, content);
    if (q) console.log(`  question ${x.lie} -> ${q.kind}: ${q.lines.map((l) => t(l.msg, l.params)).join(' ')}`);
  }
}
