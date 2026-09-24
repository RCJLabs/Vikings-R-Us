import { loadContent } from '@cots/testkit';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import type { Content, Destination, Effect } from '../content/types';
import { generateDay } from '../gen/generate';
import type { DayCtx } from '../logic/context';
import {
  billForecast,
  campaignOf,
  campaignQueue,
  debtLimit,
  defaultBills,
  endingFor,
  factionKey,
  hostMarks,
  newRun,
  nightOutlook,
  type RunAction,
  type RunEnv,
  type RunEvent,
  reachableEndings,
  shiftMods,
  stampEffects,
  stateMarks,
  stepRun,
  threadsInPlay,
} from './run';
import { type RunSave, recordAction, replayDay, resumeSave, runContext, startSave } from './save';
import { type FamilyMember, factionsMet, hostParts, type RunState, ragnarokStrength } from './state';

const demo = loadContent('web-demo');
const full = loadContent('dev-full');

/** Steps a run through actions, keeping the day context current and failing on rejections. */
function drive(content: Content, run0: RunState, actions: readonly RunAction[]) {
  let run = run0;
  let ctx: DayCtx = runContext(content, run);
  const events: RunEvent[] = [];
  for (const a of actions) {
    const r = stepRun(run, a, { content, ctx });
    const bad = r.events.find((e) => e.e === 'rejected');
    if (bad && bad.e === 'rejected') throw new Error(`${a.t} rejected: ${bad.reason}`);
    if (r.state.day !== run.day) ctx = runContext(content, r.state);
    run = r.state;
    events.push(...r.events);
  }
  return { run, events, ctx };
}

/** A whole shift: judge each soul right (clipping what needs it), or wrong where `wrong(i)` says so; catch lies if asked. */
function shiftActions(
  run: RunState,
  content: Content,
  opts: { wrong?: (i: number) => boolean; catchLies?: boolean } = {},
): RunAction[] {
  const ctx = runContext(content, run);
  const started = stepRun(run, { t: 'beginShift', at: 0 }, { content, ctx }).state;
  const cases = started.shift?.cases ?? [];
  const actions: RunAction[] = [{ t: 'beginShift', at: 0 }];
  let at = 0;
  cases.forEach((c, i) => {
    at += 20_000;
    if (opts.catchLies && c.lies.length > 0) {
      // Look at everything, then flag each contradiction the careful player would find.
      actions.push({ t: 'shift', action: { t: 'inspect', fields: c.evidence.fields.map((f) => f.id), at } });
    }
    const wrong = opts.wrong?.(i) ?? false;
    const dest: Destination = wrong ? (c.expect.dest === 'HEL' ? 'VALHALLA' : 'HEL') : c.expect.dest;
    // Judging right includes what must be done first (from Day 8, clipping long nails).
    for (const id of wrong ? [] : (c.expect.procedures ?? [])) {
      const tool = ctx.procedures.find((p) => p.id === id)?.tool;
      if (tool) actions.push({ t: 'shift', action: { t: 'tool', tool, at } });
    }
    actions.push({ t: 'shift', action: { t: 'stamp', dest, at } }, { t: 'shift', action: { t: 'send', at } });
  });
  return actions;
}

function playDay(
  content: Content,
  run: RunState,
  opts: { wrong?: (i: number) => boolean; bills?: Partial<ReturnType<typeof defaultBills>>; buy?: string[] } = {},
) {
  const shift = drive(content, run, shiftActions(run, content, opts));
  const night: RunAction[] = [{ t: 'endAudit' }];
  if (opts.bills) night.push({ t: 'bills', bills: { ...defaultBills(shift.run), ...opts.bills } });
  for (const item of opts.buy ?? []) night.push({ t: 'buy', item });
  night.push({ t: 'endNight' });
  const end = drive(content, shift.run, night);
  return { afterShift: shift.run, run: end.run, events: [...shift.events, ...end.events] };
}

describe('a campaign run', () => {
  it('starts on the morning of Day 1 with the family at home', () => {
    const run = newRun(demo, 'r');
    expect(run).toMatchObject({ day: 1, phase: 'morning', rings: campaignOf(demo).startRings, ending: null });
    expect(run.family.map((m) => [m.id, m.status])).toEqual([
      ['mother', 'well'],
      ['brother', 'well'],
      ['sister', 'well'],
    ]);
  });

  it('pays each soul judged rightly, then bills the night', () => {
    const run = newRun(demo, 'pay');
    const { afterShift, run: next, events } = playDay(demo, run);
    const souls = afterShift.shift?.cases.length ?? 0;
    const econ = demo.days[0]?.economy;
    expect(afterShift.phase).toBe('audit');
    expect(afterShift.ledger[0]).toMatchObject({
      day: 1,
      correct: souls,
      wrong: 0,
      pay: souls * (econ?.wage ?? 0),
      fines: 0,
    });
    expect(afterShift.rings).toBe(run.rings + souls * (econ?.wage ?? 0));
    // Hearth plus food for three.
    const bills = (econ?.costs.hearth ?? 0) + 3 * (econ?.costs.food ?? 0);
    expect(next).toMatchObject({ day: 2, phase: 'morning', rings: afterShift.rings - bills, shift: null });
    expect(next.ledger[0]?.night).toMatchObject({
      hearth: econ?.costs.hearth,
      food: 3 * (econ?.costs.food ?? 0),
      medicine: 0,
    });
    expect(events).toContainEqual({ e: 'dayBegins', day: 2 });
  });

  it('forgives the day’s warnings, then fines on the day’s schedule, repeating the last', () => {
    const { afterShift } = playDay(demo, newRun(demo, 'fines'), { wrong: () => true });
    const n = afterShift.shift?.cases.length ?? 0;
    const econ = demo.days[0]?.economy;
    const fines = econ?.fines ?? [];
    const charged = Array.from(
      { length: Math.max(0, n - (econ?.warnings ?? 0)) },
      (_, i) => fines[Math.min(i, fines.length - 1)] ?? 0,
    );
    expect(charged.length).toBeGreaterThan(2);
    expect(afterShift.ledger[0]).toMatchObject({
      correct: 0,
      wrong: n,
      pay: 0,
      fines: charged.reduce((a, b) => a + b, 0),
    });
  });

  it('Story Mode never fines and has no sun', () => {
    const run = newRun(demo, 'story', { story: true });
    const { afterShift } = playDay(demo, run, { wrong: () => true });
    expect(afterShift.ledger[0]?.fines).toBe(0);
    expect(afterShift.shift?.config.untimed).toBe(true);
  });

  it('pays the lie-catching bonus only for a caught lie on a soul judged rightly', () => {
    for (const seed of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']) {
      const run = newRun(demo, seed);
      const ctx = runContext(demo, run);
      let r = stepRun(run, { t: 'beginShift', at: 0 }, { content: demo, ctx }).state;
      const liar = r.shift?.cases.findIndex((c) => c.lies.length > 0) ?? -1;
      if (liar < 0) continue;
      let at = 0;
      for (const [i, c] of (r.shift?.cases ?? []).entries()) {
        at += 10_000;
        const step = (a: RunAction) => {
          r = stepRun(r, a, { content: demo, ctx }).state;
        };
        if (i === liar) {
          step({ t: 'shift', action: { t: 'inspect', fields: c.evidence.fields.map((f) => f.id), at } });
          const lie = c.lies[0]?.field ?? '';
          const other = c.evidence.fields.find((f) => f.item === 'body' && r.shift?.soul.seen.includes(f.id));
          for (const f of c.evidence.fields) step({ t: 'shift', action: { t: 'compare', a: lie, b: f.id, at } });
          expect(other).toBeDefined();
        }
        step({ t: 'shift', action: { t: 'stamp', dest: c.expect.dest, at } });
        step({ t: 'shift', action: { t: 'send', at } });
      }
      const wage = demo.days[0]?.economy?.wage ?? 0;
      const n = r.shift?.cases.length ?? 0;
      expect(r.ledger[0]).toMatchObject({ correct: n, bonus: 1, pay: n * wage });
      return;
    }
    throw new Error('no liar on Day 1 in six seeds');
  });

  it('keeps count of worthy and unworthy einherjar', () => {
    const { afterShift } = playDay(demo, newRun(demo, 'ein'), { wrong: () => true });
    const cases = afterShift.shift?.cases ?? [];
    // Wrong stamps send every HEL soul to Valhalla: all unworthy.
    const toValhalla = cases.filter((c) => c.expect.dest === 'HEL').length;
    expect(afterShift.einherjar).toEqual({ worthy: 0, unworthy: toValhalla });
    const right = playDay(demo, newRun(demo, 'ein')).afterShift;
    expect(right.einherjar).toEqual({ worthy: cases.filter((c) => c.expect.dest === 'VALHALLA').length, unworthy: 0 });
  });

  it('moves the gods’ standing with the mistakes that anger them', () => {
    const { afterShift } = playDay(demo, newRun(demo, 'stand'), { wrong: () => true });
    const cases = afterShift.shift?.cases ?? [];
    const hel = cases.filter((c) => c.expect.dest === 'HEL').length;
    const valhalla = cases.filter((c) => c.expect.dest === 'VALHALLA').length;
    expect(afterShift.standing).toMatchObject({ odin: -hel - valhalla, hel: -hel, freyja: 0 });
  });

  it('leaves standing alone when every soul goes where it belongs', () => {
    const { afterShift } = playDay(demo, newRun(demo, 'stand'));
    expect(afterShift.ledger.at(-1)?.correct).toBeGreaterThan(0);
    expect(afterShift.standing).toEqual({ odin: 0, freyja: 0, hel: 0, loki: 0, clerk: 0 });
  });
});

describe('standing in the accounts', () => {
  const scene = (id: string, effects: readonly Effect[]): RunAction => ({ t: 'scene', id, effects });

  /** Every audit's mistakes and story, plus what the story has moved since the last one, is where the run stands. */
  function filed(run: RunState): Record<string, number> {
    const total: Record<string, number> = { odin: 0, freyja: 0, hel: 0, loki: 0, clerk: 0 };
    for (const l of run.ledger) {
      for (const [f, n] of Object.entries(l.standing)) total[f] = (total[f] ?? 0) + (n ?? 0);
      for (const [f, n] of Object.entries(l.story ?? {})) total[f] = (total[f] ?? 0) + (n ?? 0);
    }
    for (const [f, n] of Object.entries(run.storyStanding ?? {})) total[f] = (total[f] ?? 0) + (n ?? 0);
    return total;
  }

  it('files the story beside the day’s mistakes, from last night’s scene to this audit, so the columns add up', () => {
    let run = newRun(demo, 'accounts');
    expect(factionsMet(run)).toEqual([]);
    const day1 = drive(demo, run, [
      scene('scene.m1', [{ standing: 'odin', by: 1 }]),
      ...shiftActions(run, demo, { wrong: (i) => i === 0 }),
    ]).run;
    const first = day1.ledger.at(-1);
    expect(first?.story).toEqual({ odin: 1 });
    expect(Object.values(first?.standing ?? {}).some((n) => n !== 0)).toBe(true);
    expect(day1.storyStanding).toEqual({});
    expect(filed(day1)).toEqual(day1.standing);

    // Last night's scene waits for the next audit, with the next morning's.
    run = drive(demo, day1, [
      { t: 'endAudit' },
      scene('scene.n1', [
        { standing: 'loki', by: 1 },
        { standing: 'freyja', by: -1 },
      ]),
      { t: 'endNight' },
    ]).run;
    expect(run.storyStanding).toEqual({ loki: 1, freyja: -1 });
    expect(filed(run)).toEqual(run.standing);
    expect(factionsMet(run)).toEqual(expect.arrayContaining(['odin', 'loki', 'freyja']));
    const day2 = drive(demo, run, [scene('scene.m2', [{ standing: 'freyja', by: 1 }]), ...shiftActions(run, demo)]).run;
    expect(day2.ledger.at(-1)?.story).toEqual({ loki: 1, freyja: 0 });
    expect(filed(day2)).toEqual(day2.standing);
    // Freyja is back to 0, but the player has had dealings with her.
    expect(day2.standing.freyja).toBe(0);
    expect(factionsMet(day2)).toContain('freyja');
  });

  it('counts a story soul’s stamp as story, and says what each stamp does', () => {
    const run = newRun(full, 'loki-accounts', { slice: 'fromJump' });
    const { afterShift } = playDay(full, run);
    const loki = afterShift.shift?.cases.find((c) => c.script === 'case.loki12');
    if (!loki) throw new Error('no story Loki');
    expect(stampEffects(full, loki, 'DETAIN')).toEqual([
      { flag: 'loki_judged' },
      { flag: 'loki_detained' },
      { standing: 'odin', by: 1 },
    ]);
    expect(stampEffects(full, loki, 'VALHALLA')).toContainEqual({ standing: 'loki', by: 2 });
    const generated = afterShift.shift?.cases.find((c) => !c.script);
    if (generated) expect(stampEffects(full, generated, 'HEL')).toEqual([]);
    // The slice's jump is story too: it lands in the late day's first audit.
    const preset = campaignOf(full).slice?.preset.standing ?? {};
    const story = afterShift.ledger.at(-1)?.story ?? {};
    expect(story.odin).toBe((preset.odin ?? 0) + 1);
    expect(story.freyja).toBe(preset.freyja ?? 0);
    expect(filed(afterShift)).toEqual(afterShift.standing);
  });

  it('calls Loki the stranger until the story names him', () => {
    expect(factionKey(demo, 'loki', 3)).toBe('faction.stranger');
    expect(factionKey(full, 'loki', 11)).toBe('faction.stranger');
    expect(factionKey(full, 'loki', 12)).toBe('faction.loki');
    expect(factionKey(full, 'odin', 1)).toBe('faction.odin');
  });
});

describe('the family at night', () => {
  /** The same rules without the random chance, to test the sure thresholds. */
  const sure: Content = {
    ...full,
    campaign: { ...campaignOf(full), care: { ...campaignOf(full).care, sickChance: 0 } },
  };

  it('falls sick after two cold nights, recovers with medicine, and is lost without it', () => {
    const full = sure;
    let run = newRun(full, 'fam');
    const cold = { hearth: false };
    run = playDay(full, run, { bills: cold }).run;
    expect(run.family.every((m) => m.status === 'well' && m.cold === 1)).toBe(true);
    const second = playDay(full, run, { bills: cold });
    run = second.run;
    expect(run.family.every((m) => m.status === 'sick')).toBe(true);
    expect(second.events.filter((e) => e.e === 'family')).toHaveLength(3);
    // Medicine for the mother only; the others go a night sick without it.
    run = playDay(full, run, { bills: { hearth: true, medicine: ['mother'] } }).run;
    expect(run.family.map((m) => [m.id, m.status])).toEqual([
      ['mother', 'well'],
      ['brother', 'sick'],
      ['sister', 'sick'],
    ]);
    const lost = playDay(full, run, { bills: { hearth: true, medicine: [] } });
    // An adult can die; a child is sent to relatives, never dies (docs/build-plan.md §1).
    expect(lost.run.family.find((m) => m.id === 'brother')).toMatchObject({ status: 'gone', gone: 'died' });
    expect(lost.run.family.find((m) => m.id === 'sister')).toMatchObject({ status: 'gone', gone: 'left' });
    expect(lost.events).toContainEqual({ e: 'family', id: 'sister', change: 'left' });
  });

  it('makes one cold night a gamble: some fall sick, the same way on every replay', () => {
    const sickAfterOneColdNight = (seed: string) =>
      playDay(full, newRun(full, seed), { bills: { hearth: false } }).run.family.filter((m) => m.status === 'sick')
        .length;
    const counts = Array.from({ length: 30 }, (_, i) => sickAfterOneColdNight(`g${i}`));
    const total = counts.reduce((a, b) => a + b, 0);
    // 30% each for three people over 30 runs: about 27, never all or none.
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(60);
    expect(counts.map((_, i) => sickAfterOneColdNight(`g${i}`))).toEqual(counts);
    // Paying for everything is never a gamble.
    for (let i = 0; i < 10; i++) {
      expect(playDay(full, newRun(full, `w${i}`)).run.family.every((m) => m.status === 'well')).toBe(true);
    }
  });

  it('medicine is only charged for the sick', () => {
    const run = newRun(demo, 'med');
    const next = playDay(demo, run, { bills: { medicine: ['mother', 'brother'] } }).run;
    expect(next.ledger[0]?.night?.medicine).toBe(0);
  });
});

describe('endings', () => {
  it('two nights deep in debt ends the run: Demoted', () => {
    let run: RunState = { ...newRun(demo, 'debt'), rings: -100 };
    run = playDay(demo, run, { wrong: () => true }).run;
    expect(run.debtNights).toBe(1);
    const end = playDay(demo, run, { wrong: () => true });
    expect(end.run).toMatchObject({ phase: 'ending', ending: 'ending.demoted' });
    expect(end.events).toContainEqual({ e: 'ended', ending: 'ending.demoted' });
    expect(
      stepRun(end.run, { t: 'endAudit' }, { content: demo, ctx: runContext(demo, end.run) }).events[0],
    ).toMatchObject({
      e: 'rejected',
    });
  });

  it('the demo ends after Day 3; the full build goes on', () => {
    let run = newRun(demo, 'fin');
    for (let d = 1; d <= 3; d++) run = playDay(demo, run).run;
    expect(run).toMatchObject({ phase: 'ending', ending: 'ending.demoEnd', day: 3 });
    let f = newRun(full, 'fin');
    for (let d = 1; d <= 3; d++) f = playDay(full, f).run;
    expect(f).toMatchObject({ phase: 'morning', day: 4 });
    for (let d = 4; d <= campaignOf(full).lastDay; d++) f = playDay(full, f).run;
    // To Ragnarök's night. Detaining the story Loki pleased Odin, so a perfect chooser with no story is his;
    // without that point nothing else holds, and the finale ends the run.
    expect(f).toMatchObject({ phase: 'ending', day: campaignOf(full).lastDay, ending: 'ending.odin' });
    expect(endingFor({ ...f, standing: { ...f.standing, odin: 0 } }, full)).toBe(campaignOf(full).finale);
  });

  it('Draupnir drips rings on its nights', () => {
    const content: Content = { ...demo, campaign: { ...campaignOf(demo), draupnir: { nights: [1], rings: 8 } } };
    const { run, events } = playDay(content, newRun(content, 'ring'));
    expect(events).toContainEqual({ e: 'draupnir', rings: 8 });
    expect(run.ledger[0]?.night?.draupnir).toBe(8);
  });
});

describe('planning the night', () => {
  /** A night on `day` of the full game, with the bills as set. */
  const night = (run: RunState, patch: Partial<RunState>) => {
    const r: RunState = { ...run, phase: 'night', ...patch };
    return { run: r, env: { content: full, ctx: runContext(full, r) } as RunEnv };
  };
  const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
    id,
    status: 'well',
    cold: 0,
    hungry: 0,
    sickNights: 0,
    ...patch,
  });
  const memberArb = (id: string) =>
    fc
      .record({
        status: fc.constantFrom<FamilyMember['status']>('well', 'sick', 'gone'),
        cold: fc.integer({ min: 0, max: 1 }),
        hungry: fc.integer({ min: 0, max: 1 }),
        sickNights: fc.integer({ min: 0, max: 1 }),
      })
      .map((m): FamilyMember => ({ id, ...m, ...(m.status === 'gone' ? { gone: 'died' as const } : {}) }));

  test.prop(
    [
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: -80, max: 80 }),
      fc.integer({ min: 0, max: 1 }),
      fc.tuple(memberArb('mother'), memberArb('brother'), memberArb('sister')),
      fc.record({ hearth: fc.boolean(), food: fc.boolean(), medicine: fc.subarray(['mother', 'brother', 'sister']) }),
      fc.nat(1000),
    ],
    { numRuns: 150 },
  )(
    'reckons tonight as the night does, all but who falls sick by chance',
    (day, rings, debtNights, family, bills, n) => {
      const { run, env } = night(newRun(full, `plan${n}`), { day, rings, debtNights, family, bills });
      const o = nightOutlook(run, env);
      const after = stepRun(run, { t: 'endNight' }, env).state;
      expect(after.rings).toBe(o.rings);
      expect(after.debtNights).toBe(o.debtNights);
      after.family.forEach((m, i) => {
        const n = o.members[i];
        if (!n) throw new Error(`no outlook for ${m.id}`);
        if (n.risk === 0 || m.status === n.member.status) expect(m).toEqual(n.member);
        else expect(m).toEqual({ ...n.member, status: 'sick', sickNights: 0 });
      });
      if (o.ends) expect(after.ending).toBe(o.ends.ending);
      else expect(['ending.demoted', 'ending.alone']).not.toContain(after.ending);
    },
  );

  it('says who is lost without medicine tonight, who surely falls sick, and the odds for the rest', () => {
    const base = newRun(full, 'odds');
    const family = [
      member('mother', { status: 'sick', sickNights: 1 }),
      member('brother', { cold: 1 }),
      member('sister', { status: 'sick', sickNights: 1 }),
    ];
    const { run, env } = night(base, { day: 5, family, bills: { hearth: false, food: true, medicine: [] } });
    const says = (o: ReturnType<typeof nightOutlook>) =>
      o.members.map((n) => [n.member.id, n.change ?? null, n.cause ?? null, n.risk]);
    // A second night sick without medicine: an adult dies, a child is sent to relatives. A second cold night: sick.
    expect(says(nightOutlook(run, env))).toEqual([
      ['mother', 'died', null, 0],
      ['brother', 'sick', 'cold', 0],
      ['sister', 'left', null, 0],
    ]);
    // Medicine makes the sick well; a first cold night is a 30% chance, and a hungry one too makes it 60%.
    const firstNight = [member('mother', { status: 'sick' }), member('brother'), member('sister')];
    const cold = night(base, {
      day: 5,
      family: firstNight,
      bills: { hearth: false, food: true, medicine: ['mother'] },
    });
    expect(says(nightOutlook(cold.run, cold.env))).toEqual([
      ['mother', 'well', null, 0],
      ['brother', null, null, 30],
      ['sister', null, null, 30],
    ]);
    const bare = { hearth: false, food: false, medicine: [] };
    expect(nightOutlook(cold.run, cold.env, bare).members.map((n) => n.risk)).toEqual([0, 60, 60]);
  });

  it('counts Draupnir in the purse by morning, and says when the debt would end the run', () => {
    // Night 9: firewood 14, food 7 for each of three, and Draupnir's 8.
    const base = newRun(full, 'debt9');
    const at = (rings: number, debtNights: number) => {
      const { run, env } = night(base, { day: 9, rings, debtNights, bills: defaultBills(base) });
      return nightOutlook(run, env);
    };
    expect(at(0, 1)).toMatchObject({ cost: { hearth: 14, food: 21, medicine: 0 }, draupnir: 8, rings: -27 });
    // Draupnir keeps a second night above the floor of -30; without enough, the second night below it ends the run.
    expect(at(0, 1)).toMatchObject({ debtNights: 0, ends: null });
    expect(at(-10, 0)).toMatchObject({ rings: -37, debtNights: 1, ends: null });
    expect(at(-10, 1)).toMatchObject({ debtNights: 2, ends: { ending: 'ending.demoted', why: 'debt' } });
    expect(debtLimit(full)).toBe(2);
    expect(debtLimit(demo)).toBe(2);
  });

  it('says when no one would be left at home', () => {
    const family = [
      member('mother', { status: 'gone', gone: 'died' }),
      member('brother', { status: 'gone', gone: 'died' }),
      member('sister', { status: 'sick', sickNights: 1 }),
    ];
    const { run, env } = night(newRun(full, 'alone'), {
      day: 6,
      family,
      bills: { hearth: true, food: true, medicine: [] },
    });
    expect(nightOutlook(run, env).ends).toEqual({ ending: 'ending.alone', why: 'home' });
    expect(nightOutlook(run, env, { hearth: true, food: true, medicine: ['sister'] }).ends).toBeNull();
    expect(stateMarks(full, 'family.home').filter((m) => m.atMost !== undefined)).toEqual([
      { ending: 'ending.alone', atMost: 0 },
    ]);
  });

  it('forecasts the coming nights’ bills, as many as the run has left', () => {
    const run: RunState = { ...newRun(full, 'fc'), day: 6 };
    expect(billForecast(run, full)).toEqual([
      { day: 7, hearth: 11, food: 18, medicine: 12, draupnir: 0 },
      { day: 8, hearth: 12, food: 18, medicine: 13, draupnir: 0 },
      { day: 9, hearth: 14, food: 21, medicine: 14, draupnir: 8 },
    ]);
    // Food is for those at home now.
    const two = run.family.map((m, i) => (i === 0 ? { ...m, status: 'gone' as const, gone: 'died' as const } : m));
    expect(billForecast({ ...run, family: two }, full)[0]?.food).toBe(12);
    expect(billForecast({ ...run, day: 19 }, full).map((b) => b.day)).toEqual([20]);
    expect(billForecast({ ...run, day: 20 }, full)).toEqual([]);
    expect(billForecast(newRun(demo, 'fc'), demo).map((b) => b.day)).toEqual([2, 3]);
    // The slice jumps from Day 3 to its late day, where it ends.
    const slice: RunState = { ...newRun(full, 'fc', { slice: 'play' }), day: 2 };
    expect(billForecast(slice, full).map((b) => b.day)).toEqual([3, 12]);
    expect(billForecast({ ...slice, day: 12 }, full)).toEqual([]);
  });
});

describe('the shop and scenes', () => {
  it('sells speed, never answers: a bought bier makes turning a body over cheaper', () => {
    let run: RunState = { ...newRun(demo, 'shop'), rings: 100 };
    run = playDay(demo, run, { buy: ['up.meadHorn'] }).run;
    expect(run.upgrades).toEqual(['up.meadHorn']);
    expect(run.ledger[0]?.night?.upgrades).toBe(15);
    run = playDay(demo, run, { buy: ['up.oiledBier'] }).run;
    expect(shiftMods(run, demo)).toEqual({ toolCostS: { flip: 1 }, questionS: 15 });
    const ctx = runContext(demo, run);
    const begun = stepRun(run, { t: 'beginShift', at: 0 }, { content: demo, ctx }).state;
    const flipped = stepRun(begun, { t: 'shift', action: { t: 'flip', at: 0 } }, { content: demo, ctx });
    expect(flipped.events).toContainEqual({ e: 'shift', event: { e: 'flipped', view: 'back', penaltyMs: 1_000 } });
  });

  it('refuses what you can’t afford, what isn’t on sale yet, and repeat purchases', () => {
    const run = newRun(demo, 'shop2');
    const shift = drive(demo, run, shiftActions(run, demo)).run;
    const night = drive(demo, shift, [{ t: 'endAudit' }]).run;
    const env: RunEnv = { content: demo, ctx: runContext(demo, night) };
    expect(stepRun(night, { t: 'buy', item: 'up.swanFeather' }, env).events[0]).toMatchObject({ e: 'rejected' });
    const poor = { ...night, rings: 3 };
    expect(stepRun(poor, { t: 'buy', item: 'up.meadHorn' }, env).events[0]).toMatchObject({ e: 'rejected' });
    const rich = stepRun({ ...night, rings: 50 }, { t: 'buy', item: 'up.meadHorn' }, env).state;
    expect(stepRun(rich, { t: 'buy', item: 'up.meadHorn' }, env).events[0]).toMatchObject({ e: 'rejected' });
  });

  it('applies a scene’s effects once', () => {
    const run = newRun(demo, 'scene');
    const env: RunEnv = { content: demo, ctx: runContext(demo, run) };
    const effects = [
      { rings: 3 },
      { standing: 'freyja' as const, by: 2 },
      { flag: 'met_loki' },
      { family: 'sister', becomes: 'sick' as const },
    ];
    const once = stepRun(run, { t: 'scene', id: 'scene.test', effects }, env);
    expect(once.state).toMatchObject({ rings: run.rings + 3, flags: { met_loki: 1 } });
    expect(once.state.standing.freyja).toBe(2);
    expect(once.state.family.find((m) => m.id === 'sister')?.status).toBe('sick');
    expect(stepRun(once.state, { t: 'scene', id: 'scene.test', effects }, env).state).toBe(once.state);
  });
});

describe('story souls', () => {
  /** A run on the morning of Day 3, where Thorvald waits. */
  function dayThree(content: Content, seed: string) {
    let run = newRun(content, seed);
    for (let d = 1; d < 3; d++) run = playDay(content, run).run;
    const ctx = runContext(content, run);
    return { run, ctx, queue: campaignQueue(run, { content, ctx }) };
  }

  it('places Thorvald among the generated souls, the same soul in every run', () => {
    const a = dayThree(demo, 'story-a');
    const b = dayThree(demo, 'story-b');
    const generated = generateDay(a.run.seed, a.ctx).cases;
    expect(a.queue).toHaveLength(generated.length + 1);
    expect(a.queue.filter((c) => !c.script)).toEqual(generated);
    const [ta, tb] = [a.queue[4], b.queue[4]];
    expect(ta?.script).toBe('case.thorvald1');
    expect(ta?.expect.dest).toBe('RETURN');
    expect(ta?.evidence.look).toMatchObject({ name: 'Thorvald', patronym: 'Ketilsson' });
    expect(ta?.evidence.fields.filter((f) => f.text?.msg.startsWith('case.thorvald1.'))).toHaveLength(3);
    expect(ta?.id).not.toBe(tb?.id);
    expect({ ...ta, id: '' }).toEqual({ ...tb, id: '' });
  });

  it('leaves a story soul out when its condition fails', () => {
    const scripted = demo.scripted?.map((d) => ({ ...d, when: { state: 'flags.never', is: 1 } }));
    const gated: Content = { ...demo, ...(scripted ? { scripted } : {}) };
    expect(dayThree(gated, 'story-a').queue.some((c) => c.script)).toBe(false);
  });

  it('remembers how the story soul was stamped', () => {
    const { run } = dayThree(demo, 'story-stamp');
    const right = drive(demo, run, shiftActions(run, demo)).run;
    expect(right.flags).toMatchObject({ thorvald_met: 1, thorvald_returned: 1 });
    expect(right.flags.thorvald_valhalla).toBeUndefined();
    const wrong = drive(demo, run, shiftActions(run, demo, { wrong: (i) => i === 4 })).run;
    expect(wrong.flags).toMatchObject({ thorvald_met: 1 });
    expect(wrong.flags.thorvald_returned).toBeUndefined();
  });

  it('counts story rings in the night’s accounts', () => {
    const run = newRun(demo, 'story-rings');
    const scene: RunAction = { t: 'scene', id: 'scene.d1.night', effects: [{ rings: -5 }, { rings: 2 }] };
    const day = drive(demo, run, [...shiftActions(run, demo), { t: 'endAudit' }, scene, { t: 'endNight' }]);
    const l = day.run.ledger[0];
    expect(l?.night?.story).toBe(-3);
    expect(day.run.storyRings).toBe(0);
    const n = l?.night;
    if (!l || !n) throw new Error('no ledger');
    expect(run.rings + l.pay + l.bonus - l.fines - n.hearth - n.food - n.medicine - n.upgrades + n.story).toBe(n.rings);
  });
});

describe('saves', () => {
  /** Plays whole days (a morning and a night scene each, with made-up effects) and records every action. */
  function playRecorded(content: Content, save0: RunSave, days: number, stopMidDay = false) {
    let save = save0;
    let run = resumeSave(save, content, 0).run;
    let ctx = runContext(content, run);
    const apply = (a: RunAction) => {
      const r = stepRun(run, a, { content, ctx, ...(save.queue ? { queue: save.queue } : {}) });
      if (r.state !== run) save = recordAction(save, run, a, r.state);
      if (r.state.day !== run.day) ctx = runContext(content, r.state);
      run = r.state;
    };
    for (let d = 0; d < days; d++) {
      apply({ t: 'scene', id: `scene.d${run.day}.morning`, choices: [d], effects: [{ flag: `morning${run.day}` }] });
      const actions = shiftActions(run, content);
      const cut = stopMidDay && d === days - 1 ? Math.floor(actions.length / 2) : actions.length;
      for (const a of actions.slice(0, cut)) apply(a);
      if (cut < actions.length) break;
      apply({ t: 'endAudit' });
      apply({ t: 'scene', id: `scene.d${run.day}.night`, choices: [1, 0], effects: [{ rings: 1 }] });
      apply({ t: 'endNight' });
    }
    return { save, run };
  }

  it('resumes mid-day exactly, from the morning snapshot and today’s actions', () => {
    const { save, run } = playRecorded(full, startSave(full, 'save', 0), 3, true);
    expect(save.mornings.map((m) => m.day)).toEqual([1, 2, 3]);
    expect(save.queue).toEqual(run.shift?.cases);
    expect(resumeSave(save, full, 0)).toEqual({ run, rewound: false });
  });

  it('uses the saved queue, not a regenerated one', () => {
    const { save } = playRecorded(full, startSave(full, 'q', 0), 1, true);
    const tampered = { ...save, queue: (save.queue ?? []).map((c) => ({ ...c, id: `${c.id}!` })) };
    expect(resumeSave(tampered, full, 0).run.shift?.cases[0]?.id).toMatch(/!$/);
  });

  it('replays any day from its morning, discarding the days after it', () => {
    const { save } = playRecorded(full, startSave(full, 'replay', 0), 3);
    const back = replayDay(save, 2);
    expect(back.mornings.map((m) => m.day)).toEqual([1, 2]);
    expect(back.log).toEqual([]);
    expect(resumeSave(back, full, 0).run).toEqual(save.mornings[1]);
  });

  it('rewinds to the morning when the engine changed since the save', () => {
    const { save } = playRecorded(full, startSave(full, 'eng', 0), 2, true);
    expect(resumeSave(save, full, 1)).toEqual({ run: save.mornings[1], rewound: true });
  });

  it('keeps every scene played in the journal, with the choices and what it read as it began', () => {
    const { save } = playRecorded(full, startSave(full, 'journal', 0), 3);
    expect(save.journal?.map((e) => [e.day, e.scene, e.choices])).toEqual([
      [1, 'scene.d1.morning', [0]],
      [1, 'scene.d1.night', [1, 0]],
      [2, 'scene.d2.morning', [1]],
      [2, 'scene.d2.night', [1, 0]],
      [3, 'scene.d3.morning', [2]],
      [3, 'scene.d3.night', [1, 0]],
    ]);
    // Day 2's morning scene read the run as that morning began: Day 1's flags, rings after the night.
    const day2 = save.journal?.[2];
    expect(day2?.flags).toEqual(save.mornings[1]?.flags);
    expect(day2?.rings).toBe(save.mornings[1]?.rings);
    expect(day2?.family).toEqual({ mother: 'well', brother: 'well', sister: 'well' });
  });

  it('forgets the journal of the days a replay discards, and a replayed scene replaces its entry', () => {
    const { save } = playRecorded(full, startSave(full, 'journal-replay', 0), 3);
    const back = replayDay(save, 2);
    expect(back.journal?.map((e) => e.day)).toEqual([1, 1]);
    const again = playRecorded(full, back, 1).save;
    expect(again.journal?.map((e) => `${e.day}:${e.scene}`)).toEqual([
      '1:scene.d1.morning',
      '1:scene.d1.night',
      '2:scene.d2.morning',
      '2:scene.d2.night',
    ]);
    // A restarted day (a new engine) plays its morning scene again: the entry is replaced, not doubled.
    const restarted = recordAction(
      again,
      save.mornings[1] as RunState,
      { t: 'scene', id: 'scene.d2.morning', choices: [3], effects: [] },
      {
        ...(save.mornings[1] as RunState),
        scenes: ['scene.d2.morning'],
      },
    );
    expect(restarted.journal?.filter((e) => e.scene === 'scene.d2.morning').map((e) => e.choices)).toEqual([[3]]);
  });
});

describe('the Ragnarök report', () => {
  it('breaks the host into its parts, which add up to its strength', () => {
    let run = newRun(full, 'host');
    for (let d = 1; d <= 3; d++) run = playDay(full, run, { wrong: (i) => i % 3 === 0 }).run;
    const withNails = { ...run, naglfar: 4, sent: { ...run.sent, FOLKVANGR: 5, HEL: 7 } };
    const p = hostParts(withNails);
    expect(p).toMatchObject({ folkvangr: 5, hel: 7, naglfar: 4 });
    expect(p.total).toBe(2 * p.worthy - p.unworthy + 2 * p.folkvangr + 2 * p.hel - 2 * p.naglfar);
    expect(ragnarokStrength(withNails)).toBe(p.total);
  });

  it('lists the endings a run can reach, and what they ask of the host', () => {
    expect(reachableEndings(demo).map((e) => e.id)).toEqual(['ending.demoted', 'ending.alone', 'ending.demoEnd']);
    const full11 = reachableEndings(full).map((e) => e.id);
    expect(full11).toHaveLength(11);
    expect(full11).not.toContain('ending.demoEnd');
    expect(full11.at(-1)).toBe('ending.lastStand');
    expect(hostMarks(full)).toEqual([
      { ending: 'ending.rebirth', atLeast: 260 },
      { ending: 'ending.wolf', atMost: 240 },
    ]);
    expect(hostMarks(demo)).toEqual([]);
  });
});

describe('story threads', () => {
  it('lists the threads whose conditions hold, with their counts', () => {
    const run = newRun(full, 'threads');
    expect(threadsInPlay(run, full)).toEqual([]);
    const later = { ...run, day: 17, flags: { loki_deal: 1, truth: 2, owes_skogul: 0 } };
    const ids = threadsInPlay(later, full).map((th) => th.id);
    expect(ids).toContain('thread.lokiDeal');
    expect(ids).not.toContain('thread.owesSkogul');
    expect(threadsInPlay(later, full).find((th) => th.id === 'thread.truth')).toMatchObject({ n: 2 });
  });
});

describe('the vertical slice', () => {
  const slice = campaignOf(full).slice;

  it('plays its first days, then jumps to its late day with what the skipped days brought', () => {
    if (!slice) throw new Error('dev-full has no slice');
    let run = newRun(full, 'slice', { slice: 'play' });
    for (let day = 1; day <= slice.after; day++) {
      expect(run.day).toBe(day);
      run = playDay(full, run).run;
    }
    expect(run).toMatchObject({ day: slice.day, phase: 'morning', slice: true });
    for (const [flag, value] of Object.entries(slice.preset.flags ?? {})) expect(run.flags[flag]).toBe(value);
    // Day 3's own story memory survives the jump.
    expect(run.flags.thorvald_met).toBe(1);
    const late = playDay(full, run);
    expect(late.run).toMatchObject({ phase: 'ending', ending: slice.finale });
  });

  it('can start on its late day, and a plain campaign never jumps', () => {
    if (!slice) throw new Error('dev-full has no slice');
    const jumped = newRun(full, 'jump', { slice: 'fromJump' });
    expect(jumped).toMatchObject({
      day: slice.day,
      slice: true,
      rings: campaignOf(full).startRings + (slice.preset.rings ?? 0),
    });
    expect(jumped.standing.odin).toBe(slice.preset.standing?.odin ?? 0);
    let plain = newRun(full, 'plain');
    for (let day = 1; day <= slice.after; day++) plain = playDay(full, plain).run;
    expect(plain.day).toBe(slice.after + 1);
    expect(() => newRun(demo, 'demo', { slice: 'play' })).toThrow('no vertical slice');
  });

  it('puts the story Loki in the late day, and detaining him is remembered', () => {
    const run = newRun(full, 'loki', { slice: 'fromJump' });
    const { afterShift, run: night } = playDay(full, run);
    const loki = afterShift.shift?.cases.find((c) => c.script === 'case.loki12');
    expect(loki?.expect.dest).toBe('DETAIN');
    expect(night.flags).toMatchObject({ loki_judged: 1, loki_detained: 1 });
  });
});
