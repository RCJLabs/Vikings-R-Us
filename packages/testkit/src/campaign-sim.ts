import {
  billTotal,
  type Content,
  campaignOf,
  type DayCtx,
  type Destination,
  defaultBills,
  economyOf,
  newRun,
  Rng,
  type RunAction,
  type RunSave,
  type RunState,
  recordAction,
  runContext,
  shopFor,
  solve,
  stampsFor,
  startSave,
  stepRun,
} from '@cots/engine';

/*
 * Campaign economy simulation (docs/tech-spec.md §9): bots with a given
 * accuracy and night strategy play whole runs. It answers "can a competent
 * player afford their family and a few upgrades; how fast does a careless one
 * sink?" before real players do.
 */

export interface Judging {
  readonly name: string;
  /** Chance each soul is stamped right. */
  readonly accuracy: number;
  /** Chance a liar's lie is caught (for the bonus) when judged right. */
  readonly catches: number;
}

export type NightStrategy = 'payAll' | 'frugal' | 'upgradesFirst';

export const JUDGING: readonly Judging[] = [
  { name: 'expert', accuracy: 0.97, catches: 0.8 },
  { name: 'competent', accuracy: 0.85, catches: 0.5 },
  { name: 'novice', accuracy: 0.65, catches: 0.2 },
  { name: 'careless', accuracy: 0.4, catches: 0 },
];

function shiftActions(run: RunState, content: Content, ctx: DayCtx, judging: Judging, rng: Rng): RunAction[] {
  const begun = stepRun(run, { t: 'beginShift', at: 0 }, { content, ctx }).state;
  const cases = begun.shift?.cases ?? [];
  const stamps = stampsFor(ctx);
  const actions: RunAction[] = [{ t: 'beginShift', at: 0 }];
  let at = 0;
  for (const c of cases) {
    at += 25_000;
    const right = rng.chance(Math.round(judging.accuracy * 1000), 1000);
    if (right && c.lies.length > 0 && rng.chance(Math.round(judging.catches * 1000), 1000)) {
      const x = solve(c.evidence.fields, ctx).contradictions[0];
      const other = x?.against.find((id) => !id.startsWith('q:') && id !== 'world');
      if (x && other) {
        actions.push(
          { t: 'shift', action: { t: 'inspect', fields: c.evidence.fields.map((f) => f.id), at } },
          { t: 'shift', action: { t: 'compare', a: x.lie, b: other, at } },
        );
      }
    }
    const wrongs = stamps.filter((d) => d !== c.expect.dest);
    const dest: Destination = right ? c.expect.dest : (rng.pick(wrongs) ?? c.expect.dest);
    // Judging a soul right includes what must be done to it first (from Day 8, clipping long nails).
    if (right) {
      for (const id of c.expect.procedures ?? []) {
        const tool = ctx.procedures.find((p) => p.id === id)?.tool;
        if (tool) actions.push({ t: 'shift', action: { t: 'tool', tool, at } });
      }
    }
    actions.push({ t: 'shift', action: { t: 'stamp', dest, at } }, { t: 'shift', action: { t: 'send', at } });
  }
  return actions;
}

function nightActions(run: RunState, content: Content, ctx: DayCtx, strategy: NightStrategy): RunAction[] {
  const actions: RunAction[] = [];
  const economy = economyOf({ content, ctx });
  let bills = defaultBills(run);
  if (strategy === 'frugal') bills = { ...bills, hearth: run.day % 2 === 0 };
  const cost = billTotal(run, economy, bills);
  let rings = run.rings;
  if (strategy === 'upgradesFirst') {
    for (const u of shopFor(run, content)) {
      if (rings >= u.price) {
        actions.push({ t: 'buy', item: u.id });
        rings -= u.price;
      }
    }
  } else if (strategy === 'payAll') {
    // Buy only with a cushion left after tonight's bills.
    const spare = rings - cost.hearth - cost.food - cost.medicine - 10;
    for (const u of shopFor(run, content)) {
      if (spare - (run.rings - rings) >= u.price) {
        actions.push({ t: 'buy', item: u.id });
        rings -= u.price;
      }
    }
  }
  actions.push({ t: 'bills', bills }, { t: 'endNight' });
  return actions;
}

export interface RunResult {
  readonly ending: string | null;
  readonly day: number;
  readonly rings: number;
  readonly lowest: number;
  readonly upgrades: number;
  readonly familyLost: number;
  readonly sickNights: number;
  readonly ledgerOk: boolean;
}

/** One bot run to the end of the campaign (or its ending). */
export function simulateRun(content: Content, seed: string, judging: Judging, strategy: NightStrategy): RunResult {
  let run = newRun(content, seed);
  const rng = new Rng(`sim|${seed}|${judging.name}|${strategy}`);
  let lowest = run.rings;
  let sickNights = 0;
  let ledgerOk = true;
  const lastDay = campaignOf(content).lastDay;
  for (let guard = 0; guard < lastDay + 1 && run.phase !== 'ending'; guard++) {
    const ctx = runContext(content, run);
    const start = run.rings;
    for (const a of shiftActions(run, content, ctx, judging, rng)) run = stepRun(run, a, { content, ctx }).state;
    run = stepRun(run, { t: 'endAudit' }, { content, ctx }).state;
    for (const a of nightActions(run, content, ctx, strategy)) run = stepRun(run, a, { content, ctx }).state;
    // The day's accounts must add up to the change in rings.
    const l = run.ledger[run.ledger.length - 1];
    const n = l?.night;
    if (!l || !n) ledgerOk = false;
    else {
      const delta = l.pay + l.bonus - l.fines - n.hearth - n.food - n.medicine - n.upgrades + n.draupnir + n.story;
      if (start + delta !== n.rings) ledgerOk = false;
    }
    lowest = Math.min(lowest, run.rings);
    sickNights += run.family.filter((m) => m.status === 'sick').length;
  }
  return {
    ending: run.ending,
    day: run.day,
    rings: run.rings,
    lowest,
    upgrades: run.upgrades.length,
    familyLost: run.family.filter((m) => m.status === 'gone').length,
    sickNights,
    ledgerOk,
  };
}

export interface PolicyReport {
  readonly judging: string;
  readonly strategy: NightStrategy;
  readonly runs: number;
  readonly demoted: number;
  readonly familyLost: number;
  readonly meanRings: number;
  readonly minRings: number;
  readonly meanUpgrades: number;
  readonly endings: Record<string, number>;
  readonly ledgerErrors: number;
}

export function simulateCampaign(
  content: Content,
  seeds: number,
  judgings: readonly Judging[] = JUDGING,
  strategies: readonly NightStrategy[] = ['payAll', 'frugal', 'upgradesFirst'],
): PolicyReport[] {
  const out: PolicyReport[] = [];
  for (const judging of judgings) {
    for (const strategy of strategies) {
      const results = Array.from({ length: seeds }, (_, i) => simulateRun(content, `c${i}`, judging, strategy));
      const endings: Record<string, number> = {};
      for (const r of results) endings[r.ending ?? 'none'] = (endings[r.ending ?? 'none'] ?? 0) + 1;
      out.push({
        judging: judging.name,
        strategy,
        runs: seeds,
        demoted: results.filter((r) => r.ending === 'ending.demoted').length,
        familyLost: results.filter((r) => r.familyLost > 0).length,
        meanRings: results.reduce((a, r) => a + r.rings, 0) / seeds,
        minRings: Math.min(...results.map((r) => r.rings)),
        meanUpgrades: results.reduce((a, r) => a + r.upgrades, 0) / seeds,
        endings,
        ledgerErrors: results.filter((r) => !r.ledgerOk).length,
      });
    }
  }
  return out;
}

/**
 * A scenario jumper for tests (docs/build-plan.md §11): a save on the morning
 * of `day`, with every earlier soul judged rightly and every bill paid.
 */
export function scenarioSave(content: Content, seed: string, day: number, engine: number): RunSave {
  let save = startSave(content, seed, engine);
  let run = save.mornings[0] as RunState;
  const apply = (action: RunAction) => {
    const env = { content, ctx: runContext(content, run), ...(save.queue ? { queue: save.queue } : {}) };
    const next = stepRun(run, action, env).state;
    save = recordAction(save, run, action, next);
    run = next;
  };
  while (run.day < day && run.phase !== 'ending') {
    apply({ t: 'beginShift', at: 0 });
    let at = 0;
    for (const c of run.shift?.cases ?? []) {
      at += 1000;
      apply({ t: 'shift', action: { t: 'stamp', dest: c.expect.dest, at } });
      apply({ t: 'shift', action: { t: 'send', at } });
    }
    apply({ t: 'endAudit' });
    apply({ t: 'endNight' });
  }
  return save;
}
