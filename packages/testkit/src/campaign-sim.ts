import {
  type AchievementDef,
  type AchievementMoment,
  type Assists,
  billTotal,
  type Content,
  campaignOf,
  createDayContext,
  type DayCtx,
  type DayLedger,
  type Destination,
  defaultBills,
  earnedAt,
  economyOf,
  FACTIONS,
  type Faction,
  newRun,
  Rng,
  type RunAction,
  type RunSave,
  type RunState,
  ragnarokStrength,
  recordAction,
  runContext,
  type ShiftAction,
  type ShiftState,
  shiftFacts,
  shopFor,
  solve,
  stampsFor,
  startSave,
  stepRun,
} from '@cots/engine';
import { type ScenePath, sceneEnv, scenePaths } from '@cots/story';

/*
 * Campaign economy simulation (docs/tech-spec.md §9): bots with a given
 * accuracy and night strategy play whole runs. It answers "can a competent
 * player afford their family and a few upgrades; how fast does a careless one
 * sink?" before real players do. Given the compiled scenes, bots also play the
 * story with a policy, so every ending can be shown reachable.
 */

export interface Judging {
  readonly name: string;
  /** Chance each soul is stamped right. */
  readonly accuracy: number;
  /** Chance a liar's lie is caught (for the bonus) when judged right. */
  readonly catches: number;
}

/** `neglect` pays no bills at all: the family sickens and leaves, and the rings pile up. */
export type NightStrategy = 'payAll' | 'frugal' | 'upgradesFirst' | 'neglect';

export const JUDGING: readonly Judging[] = [
  { name: 'expert', accuracy: 0.97, catches: 0.8 },
  { name: 'competent', accuracy: 0.85, catches: 0.5 },
  { name: 'novice', accuracy: 0.65, catches: 0.2 },
  { name: 'careless', accuracy: 0.4, catches: 0 },
];

/** Compiled Ink scenes by id, as a build ships them. */
export type SceneTable = Readonly<Record<string, object>>;

/**
 * What a bot wants from the story. It weighs every path through a scene by the
 * effects the path has, never by its words, so rewriting the text keeps the
 * bots working as long as the effects stay.
 */
export interface StoryPolicy {
  readonly name: string;
  /** Worth of each unit a flag moves (clearing a flag that was set counts against). */
  readonly flags?: Readonly<Record<string, number>>;
  /** Worth of each point of a god's standing. */
  readonly standing?: Readonly<Partial<Record<Faction, number>>>;
  /** Flag worths that replace the others from a given day on. */
  readonly later?: { readonly day: number; readonly flags: Readonly<Record<string, number>> };
  /** Long nails to leave uncut each day, on purpose (from the day Loki has the names, if `deal`). */
  readonly longNails?: { readonly perDay: number; readonly deal?: true };
}

/** Every policy counts a ring spent in a scene as 1, and making a sick child well as 20. */
const RING = 1;
const HEALED = 20;

function devotedTo(god: Faction): Record<Faction, number> {
  return Object.fromEntries(FACTIONS.map((f) => [f, f === god ? 10 : -3])) as Record<Faction, number>;
}

/** Stays out of deals, keeps the family home, and otherwise takes whatever costs least. */
const NO_DEALS = { loki_deal: -100, ferryman: -100 };
export const PLAIN: StoryPolicy = { name: 'plain', flags: { ...NO_DEALS, stay_home: 1 } };

export const STORY_POLICIES: readonly StoryPolicy[] = [
  PLAIN,
  // Gives Loki the names and leaves a nail long each day, "now and then", as he asks.
  {
    name: 'naglfar',
    flags: { loki_deal: 100, wood: -100, ferryman: -100 },
    standing: { loki: 1 },
    longNails: { perDay: 1, deal: true },
  },
  { name: 'rebirth', flags: { truth: 50, wood_known: 50, wood: 100, ...NO_DEALS } },
  { name: 'ferry', flags: { ferryman: 100, loki_deal: -100, wood: -100 } },
  { name: 'transfer', flags: { clerk_contract: 100, ...NO_DEALS, stay_home: 1 }, standing: { clerk: 10 } },
  // A god's own: everyone else's favour counts against, since the ending needs that god to lead.
  { name: 'hel', flags: { ...NO_DEALS, stay_home: 1 }, standing: devotedTo('hel') },
  { name: 'freyja', flags: { ...NO_DEALS, stay_home: 1 }, standing: devotedTo('freyja') },
  { name: 'odin', flags: { ...NO_DEALS, stay_home: 1 }, standing: devotedTo('odin') },
  // Leaves nails long every day and gives Loki the names, then takes them back before the ship can
  // sail early: the host goes to Ragnarök short.
  {
    name: 'wolf',
    flags: { loki_deal: 100 },
    later: { day: 18, flags: { loki_deal: -100 } },
    longNails: { perDay: 2 },
  },
];

export function storyPolicy(name: string): StoryPolicy {
  const p = STORY_POLICIES.find((s) => s.name === name);
  if (!p) throw new Error(`no story policy "${name}"`);
  return p;
}

/** What a path through a scene is worth to a policy, from where the run stands. */
export function scorePath(path: ScenePath, run: RunState, policy: StoryPolicy): number {
  const flags: Record<string, number> = { ...run.flags };
  let score = 0;
  for (const e of path.effects) {
    if ('rings' in e) score += RING * e.rings;
    else if ('standing' in e) score += (policy.standing?.[e.standing] ?? 0) * e.by;
    else if ('flag' in e) flags[e.flag] = e.set ?? (flags[e.flag] ?? 0) + (e.inc ?? 0);
    else if (e.becomes === 'well') score += HEALED;
  }
  const worths = policy.later && run.day >= policy.later.day ? policy.later.flags : (policy.flags ?? {});
  for (const [f, w] of Object.entries(worths)) score += w * ((flags[f] ?? 0) - (run.flags[f] ?? 0));
  return score;
}

/** Plays today's morning or night scene the way the policy wants (the first best path on a tie). */
function playStory(
  run: RunState,
  content: Content,
  ctx: DayCtx,
  scenes: SceneTable,
  which: 'morning' | 'night',
  policy: StoryPolicy,
): RunState {
  const id = content.days.find((d) => d.day === run.day)?.scenes?.[which];
  const json = id ? scenes[id] : undefined;
  if (!id || !json || run.scenes.includes(id)) return run;
  let best: ScenePath | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const path of scenePaths(json, sceneEnv(run, id))) {
    const score = scorePath(path, run, policy);
    if (score > bestScore) {
      best = path;
      bestScore = score;
    }
  }
  if (!best) return run;
  const action: RunAction = { t: 'scene', id, choices: best.choices, effects: best.effects };
  return stepRun(run, action, { content, ctx }).state;
}

function shiftActions(
  run: RunState,
  content: Content,
  ctx: DayCtx,
  judging: Judging,
  rng: Rng,
  longNails: number,
  assists?: Assists,
): RunAction[] {
  const beginShift: RunAction = { t: 'beginShift', at: 0, ...(assists ? { assists } : {}) };
  const begun = stepRun(run, beginShift, { content, ctx }).state;
  const cases = begun.shift?.cases ?? [];
  const stamps = stampsFor(ctx);
  const actions: RunAction[] = [beginShift];
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
    // Judging a soul right includes what must be done to it first (from Day 8, clipping long nails),
    // unless the bot means to leave these nails for Naglfar.
    const procedures = c.expect.procedures ?? [];
    const leave = right && procedures.length > 0 && longNails > 0;
    if (leave) longNails--;
    if (right && !leave) {
      for (const id of procedures) {
        const tool = ctx.procedures.find((p) => p.id === id)?.tool;
        if (tool) actions.push({ t: 'shift', action: { t: 'tool', tool, at } });
      }
    }
    actions.push({ t: 'shift', action: { t: 'stamp', dest, at } }, { t: 'shift', action: { t: 'send', at } });
  }
  return actions;
}

/**
 * The morning's appeal, if one came: the bot hears every one (an upper bound on what appeals move) and judges
 * the soul again as well as it judges at the gate, on the rules of the day it was judged.
 */
function hearAppeal(run: RunState, content: Content, ctx: DayCtx, judging: Judging, seed: string): RunState {
  const appeal = run.appeal;
  if (!appeal) return run;
  // A stream of its own, so the shifts play out as they would without appeals.
  const rng = new Rng(`${seed}|appeal|${run.day}`);
  const right = rng.chance(Math.round(judging.accuracy * 1000), 1000);
  const wrongs = stampsFor(createDayContext(content, appeal.day, run.seed)).filter(
    (d) => d !== appeal.case.expect.dest,
  );
  const stamped: Destination = right ? appeal.case.expect.dest : (rng.pick(wrongs) ?? appeal.case.expect.dest);
  return stepRun(run, { t: 'appeal', stamped }, { content, ctx }).state;
}

function nightActions(run: RunState, content: Content, ctx: DayCtx, strategy: NightStrategy): RunAction[] {
  const actions: RunAction[] = [];
  const economy = economyOf({ content, ctx });
  let bills = defaultBills(run);
  if (strategy === 'frugal') bills = { ...bills, hearth: run.day % 2 === 0 };
  if (strategy === 'neglect') bills = { hearth: false, food: false, medicine: [] };
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
  /** The host's strength at the end (docs/m7-design.md). */
  readonly ragnarok: number;
  /** Rings the story's choices gained or cost over the run. */
  readonly storyRings: number;
  /** Souls sent on with their nails long. */
  readonly naglfar: number;
  readonly standing: Readonly<Record<Faction, number>>;
  /** Every day's accounts. */
  readonly ledger: readonly DayLedger[];
  /** The achievements the run earned, of those asked for (SimOptions.achievements). */
  readonly achievements: readonly string[];
}

export interface SimOptions {
  /** How the bot plays the story; scenes are skipped without `scenes`. */
  readonly story?: StoryPolicy;
  readonly scenes?: SceneTable;
  /** Assists the bot plays every shift with (only waiving fines changes what a bot's day comes to). */
  readonly assists?: Assists;
  /** Achievements to check as the run goes, as the game checks them: each shift as it ends, the run each day. */
  readonly achievements?: readonly AchievementDef[];
  /** Whether the bot hears the morning's appeals (docs/tech-spec.md §40); it does unless told not to. */
  readonly appeals?: boolean;
}

/** One bot run to the end of the campaign (or its ending). */
export function simulateRun(
  content: Content,
  seed: string,
  judging: Judging,
  strategy: NightStrategy,
  options: SimOptions = {},
): RunResult {
  const policy = options.story ?? PLAIN;
  let run = newRun(content, seed);
  const rng = new Rng(`sim|${seed}|${judging.name}|${strategy}`);
  let lowest = run.rings;
  let sickNights = 0;
  let storyRings = 0;
  let ledgerOk = true;
  const lastDay = campaignOf(content).lastDay;
  const defs = options.achievements ?? [];
  const earned: string[] = [];
  const note = (moment: AchievementMoment) => {
    if (defs.length > 0) earned.push(...earnedAt(defs, moment, (id) => earned.includes(id)));
  };
  for (let guard = 0; guard < lastDay + 1 && run.phase !== 'ending'; guard++) {
    const ctx = runContext(content, run);
    const start = run.rings;
    if (options.scenes) run = playStory(run, content, ctx, options.scenes, 'morning', policy);
    if (options.appeals !== false)
      run = hearAppeal(run, content, ctx, judging, `sim|${seed}|${judging.name}|${strategy}`);
    const nails = policy.longNails;
    const longNails = nails && (!nails.deal || (run.flags.loki_deal ?? 0) > 0) ? nails.perDay : 0;
    let initial: ShiftState | undefined;
    const log: ShiftAction[] = [];
    for (const a of shiftActions(run, content, ctx, judging, rng, longNails, options.assists)) {
      run = stepRun(run, a, { content, ctx }).state;
      if (a.t === 'beginShift') initial = run.shift ?? undefined;
      else if (a.t === 'shift') log.push(a.action);
    }
    if (initial && defs.length > 0) note({ at: 'shift', mode: 'campaign', facts: shiftFacts(initial, log, ctx) });
    run = stepRun(run, { t: 'endAudit' }, { content, ctx }).state;
    if (options.scenes) run = playStory(run, content, ctx, options.scenes, 'night', policy);
    for (const a of nightActions(run, content, ctx, strategy)) run = stepRun(run, a, { content, ctx }).state;
    // The day's accounts must add up to the change in rings.
    const l = run.ledger[run.ledger.length - 1];
    const n = l?.night;
    if (!l || !n) ledgerOk = false;
    else {
      const appeal = l.appeal?.rings ?? 0;
      const delta =
        appeal + l.pay + l.bonus - l.fines - n.hearth - n.food - n.medicine - n.upgrades + n.draupnir + n.story;
      if (start + delta !== n.rings) ledgerOk = false;
      storyRings += n.story;
    }
    lowest = Math.min(lowest, run.rings);
    sickNights += run.family.filter((m) => m.status === 'sick').length;
    note({ at: 'run', run });
  }
  if (run.ending) note({ at: 'ending', ending: run.ending });
  return {
    ending: run.ending,
    day: run.day,
    rings: run.rings,
    lowest,
    upgrades: run.upgrades.length,
    familyLost: run.family.filter((m) => m.status === 'gone').length,
    sickNights,
    ledgerOk,
    ragnarok: ragnarokStrength(run),
    storyRings,
    naglfar: run.naglfar ?? 0,
    standing: run.standing,
    ledger: run.ledger,
    achievements: earned,
  };
}

export interface PolicyReport {
  readonly judging: string;
  readonly strategy: NightStrategy;
  readonly story: string;
  readonly runs: number;
  readonly demoted: number;
  readonly familyLost: number;
  readonly meanRings: number;
  readonly minRings: number;
  readonly meanUpgrades: number;
  readonly meanRagnarok: number;
  readonly meanStoryRings: number;
  readonly meanNaglfar: number;
  readonly meanStanding: Readonly<Record<Faction, number>>;
  readonly endings: Record<string, number>;
  readonly ledgerErrors: number;
}

export function simulateCampaign(
  content: Content,
  seeds: number,
  judgings: readonly Judging[] = JUDGING,
  strategies: readonly NightStrategy[] = ['payAll', 'frugal', 'upgradesFirst'],
  stories: readonly StoryPolicy[] = [PLAIN],
  scenes?: SceneTable,
  assists?: Assists,
): PolicyReport[] {
  const out: PolicyReport[] = [];
  const mean = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  for (const judging of judgings) {
    for (const strategy of strategies) {
      for (const story of stories) {
        const results = Array.from({ length: seeds }, (_, i) =>
          simulateRun(content, `c${i}`, judging, strategy, {
            story,
            ...(scenes ? { scenes } : {}),
            ...(assists ? { assists } : {}),
          }),
        );
        const endings: Record<string, number> = {};
        for (const r of results) endings[r.ending ?? 'none'] = (endings[r.ending ?? 'none'] ?? 0) + 1;
        out.push({
          judging: judging.name,
          strategy,
          story: story.name,
          runs: seeds,
          demoted: results.filter((r) => r.ending === 'ending.demoted').length,
          familyLost: results.filter((r) => r.familyLost > 0).length,
          meanRings: mean(results.map((r) => r.rings)),
          minRings: Math.min(...results.map((r) => r.rings)),
          meanUpgrades: mean(results.map((r) => r.upgrades)),
          meanRagnarok: mean(results.map((r) => r.ragnarok)),
          meanStoryRings: mean(results.map((r) => r.storyRings)),
          meanNaglfar: mean(results.map((r) => r.naglfar)),
          meanStanding: Object.fromEntries(
            FACTIONS.map((f) => [f, mean(results.map((r) => r.standing[f] ?? 0))]),
          ) as Record<Faction, number>,
          endings,
          ledgerErrors: results.filter((r) => !r.ledgerOk).length,
        });
      }
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
