import { loadContent } from '@cots/testkit';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Content } from '../content/types';
import { createDayContext } from '../logic/context';
import { generateCaseAt, generateDay } from './generate';
import type { CaseSpec, Field, Item } from './types';

/*
 * What the dead say should never give the answer away, contradict the soul,
 * or repeat itself down the queue (audit item 1). These measure it over a
 * sample of every day's queue, with margins over what the content does now.
 */

const content = loadContent('dev-full');
const SEEDS = 16;

type Queue = readonly CaseSpec[];
const queues = (c: Content, days: readonly number[], seeds: number): Queue[] =>
  days.flatMap((day) =>
    Array.from({ length: seeds }, (_, s) => generateDay(`voice-${s}`, createDayContext(c, day, `voice-${s}`)).cases),
  );

const VOICES: readonly Item[] = ['testimony', 'huginn', 'muninn', 'tally'];
/** The lines a soul says, the ravens report and its tally carries; not the lens's reading of the carving. */
const spoken = (c: CaseSpec): Field[] => c.evidence.fields.filter((f) => f.text && VOICES.includes(f.item) && !f.tell);

/** Share of lines that repeat one the previous soul in the queue said. */
function nextSoulRepeats(qs: readonly Queue[]): number {
  let lines = 0;
  let repeats = 0;
  for (const q of qs) {
    q.forEach((c, i) => {
      const before = new Set(i > 0 ? spoken(q[i - 1] as CaseSpec).map((f) => f.text?.msg) : []);
      for (const f of spoken(c)) {
        lines++;
        if (before.has(f.text?.msg)) repeats++;
      }
    });
  }
  return repeats / lines;
}

let all: Queue[] = [];
beforeAll(() => {
  all = queues(
    content,
    content.days.map((d) => d.day),
    SEEDS,
  );
}, 60_000);

describe('what the dead say', () => {
  it('never gives a lie away: no line is spoken as a lie most of the time', () => {
    const said = new Map<string, { n: number; lies: number }>();
    for (const c of all.flat()) {
      const lies = new Set(c.lies.map((l) => l.field));
      for (const f of spoken(c).filter((x) => x.item === 'testimony' && x.says)) {
        const msg = f.text?.msg ?? f.id;
        const r = said.get(msg) ?? { n: 0, lies: 0 };
        said.set(msg, { n: r.n + 1, lies: r.lies + (lies.has(f.id) ? 1 : 0) });
      }
    }
    const tells = [...said]
      .filter(([, r]) => r.n >= 20 && r.lies / r.n >= 0.8)
      .map(([m, r]) => `${m} ${r.lies}/${r.n}`);
    expect(tells).toEqual([]);
  });

  it('never gives Loki away: honest souls vouch for themselves too', () => {
    let n = 0;
    let loki = 0;
    for (const c of all.flat()) {
      for (const f of spoken(c)) {
        if (f.says?.fact !== 'trickster') continue;
        n++;
        if (c.truth.trickster === true) loki++;
      }
    }
    expect(loki).toBeGreaterThan(20);
    expect(loki / n).toBeLessThan(0.5);
  });

  it('names one weapon per soul, and an Ulfberht is always a sword', () => {
    let ulfberhts = 0;
    for (const c of all.flat()) {
      const named = new Set(
        spoken(c).flatMap((f) => (typeof f.text?.params.weapon === 'string' ? [f.text.params.weapon] : [])),
      );
      expect(named.size).toBeLessThanOrEqual(1);
      const claims = spoken(c).some((f) => f.says?.fact === 'blade' && f.says.value === 'ulfberht');
      if (claims || c.truth.blade === 'ulfberht' || c.truth.blade === 'fakeUlfberht') {
        ulfberhts++;
        expect([...named].every((w) => w === 'sword')).toBe(true);
        // The art draws it from here when no line names it.
        expect(c.evidence.words?.['pool.weapons']).toBe('sword');
      }
    }
    expect(ulfberhts).toBeGreaterThan(50);
  });

  it('keeps a forger to one story about the tally', () => {
    const forgers = content.questions.filter((q) => q.on.via === 'tally' && q.on.kind === 'confess');
    expect(forgers.length).toBeGreaterThan(1);
    for (const q of forgers) expect(q.msgs).toHaveLength(1);
  });

  it('rarely says what the soul before just said, and spreading lines is what does it', () => {
    const late = content.days.map((d) => d.day).filter((d) => d >= 13);
    const random: Content = {
      ...content,
      days: content.days.map((d) => ({ ...d, queue: { ...d.queue, knobs: { ...d.queue.knobs, spreadLines: false } } })),
    };
    const spread = nextSoulRepeats(all);
    expect(spread).toBeLessThan(0.06);
    expect(spread).toBeLessThan(0.6 * nextSoulRepeats(queues(random, late, 8)));
  }, 60_000);

  it('changes only the words: a spread soul is judged, proved and lied about exactly as a random one', () => {
    for (const day of [4, 12, 20]) {
      const ctx = createDayContext(content, day, 'spread');
      const knobs = { ...ctx.spec.queue.knobs, spreadLines: false };
      expect(ctx.spec.queue.knobs.spreadLines).toBe(true);
      generateDay('spread', ctx).cases.forEach((a, i) => {
        const b = generateCaseAt('spread', ctx, i, { knobs }).case;
        expect(b.truth).toEqual(a.truth);
        expect(b.expect).toEqual(a.expect);
        expect(b.meta.proof).toEqual(a.meta.proof);
        expect(b.lies).toEqual(a.lies);
        expect(b.evidence.fields.map((f) => f.id)).toEqual(a.evidence.fields.map((f) => f.id));
      });
    }
  });
});
