import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArchetypeSchema,
  type CampaignPart,
  CampaignPartSchema,
  CueSchema,
  DaySpecSchema,
  FactSchema,
  LawSchema,
  NamedPredicateSchema,
  ObservationSchema,
  PoolsSchema,
  ProcedureSchema,
  QuestionTemplateSchema,
  RavenTemplateSchema,
  RuleSchema,
  ScriptedCaseSchema,
  SpeechSlotSchema,
  TallyTemplateSchema,
  TestimonyTemplateSchema,
  ToolSchema,
  toFactLaw,
  toSignLaw,
  WorldSchema,
} from '@cots/content-schema';
import type {
  ArchetypeDef,
  CampaignDef,
  Content,
  CueDef,
  DaySpec,
  FactDef,
  FactLaw,
  NamedPredicate,
  ObservationDef,
  Pred,
  ProcedureDef,
  QuestionTemplate,
  RavenTemplate,
  RuleDef,
  ScriptedCaseDef,
  SignLaw,
  SpeechSlotDef,
  TallyTemplate,
  TestimonyTemplate,
  ToolDef,
  WorldConstraint,
} from '@cots/engine';
import { createDayContext, type Effect, STATE_PATHS, type StatePred, scriptedCase } from '@cots/engine';
import { z } from 'zod';

/** The gameplay content one pack defines. Every list is optional in the pack's folder. */
export interface PackContent {
  facts: FactDef[];
  observations: ObservationDef[];
  signLaws: SignLaw[];
  factLaws: FactLaw[];
  cues: CueDef[];
  world: WorldConstraint[];
  predicates: NamedPredicate[];
  rules: RuleDef[];
  tools: ToolDef[];
  archetypes: ArchetypeDef[];
  speech: SpeechSlotDef[];
  testimony: TestimonyTemplate[];
  ravens: RavenTemplate[];
  questions: QuestionTemplate[];
  pools: Record<string, string[]>;
  days: DaySpec[];
  /** The Daily Shift's spec (`daily.yaml`); only the daily pack should have one. */
  daily?: DaySpec;
  /** The primer's spec (`primer.yaml`). */
  primer?: DaySpec;
  /** This pack's part of the campaign (`campaign.yaml`). */
  campaign?: CampaignPart;
  /** Story souls (`cases/*.yaml`, one per file). */
  scripted: ScriptedCaseDef[];
  procedures: ProcedureDef[];
  tallies: TallyTemplate[];
}

type Parse = <T>(schema: z.ZodType<T, unknown>, value: unknown, file: string) => T;
type ReadYaml = (file: string) => unknown;

export function loadPackContent(dir: string, readYaml: ReadYaml, parse: Parse): PackContent {
  const list = <T>(file: string, schema: z.ZodType<T, unknown>): T[] => {
    const path = join(dir, file);
    return existsSync(path) ? parse(z.array(schema), readYaml(path) ?? [], path) : [];
  };
  const laws = list('laws.yaml', LawSchema);
  const poolsFile = join(dir, 'pools.yaml');
  const dailyFile = join(dir, 'daily.yaml');
  const primerFile = join(dir, 'primer.yaml');
  const campaignFile = join(dir, 'campaign.yaml');
  const each = <T>(sub: string, schema: z.ZodType<T, unknown>): T[] => {
    const folder = join(dir, sub);
    return existsSync(folder)
      ? readdirSync(folder)
          .filter((f) => f.endsWith('.yaml'))
          .sort()
          .map((f) => parse(schema, readYaml(join(folder, f)), join(folder, f)))
      : [];
  };
  const days = each('days', DaySpecSchema);
  return {
    facts: list('facts.yaml', FactSchema),
    observations: list('observations.yaml', ObservationSchema),
    signLaws: laws.flatMap((l) => (l.kind === 'sign' ? [toSignLaw(l)] : [])),
    factLaws: laws.flatMap((l) => (l.kind === 'fact' ? [toFactLaw(l)] : [])),
    cues: list('cues.yaml', CueSchema),
    world: list('world.yaml', WorldSchema),
    predicates: list('predicates.yaml', NamedPredicateSchema),
    rules: list('rules.yaml', RuleSchema),
    tools: list('tools.yaml', ToolSchema),
    archetypes: list('archetypes.yaml', ArchetypeSchema),
    speech: list('speech.yaml', SpeechSlotSchema),
    testimony: list('templates/testimony.yaml', TestimonyTemplateSchema),
    ravens: list('templates/ravens.yaml', RavenTemplateSchema),
    questions: list('templates/questions.yaml', QuestionTemplateSchema),
    pools: existsSync(poolsFile) ? parse(PoolsSchema, readYaml(poolsFile) ?? {}, poolsFile) : {},
    days,
    scripted: each('cases', ScriptedCaseSchema),
    procedures: list('procedures.yaml', ProcedureSchema),
    tallies: list('templates/tallies.yaml', TallyTemplateSchema),
    ...(existsSync(dailyFile) ? { daily: parse(DaySpecSchema, readYaml(dailyFile), dailyFile) } : {}),
    ...(existsSync(primerFile) ? { primer: parse(DaySpecSchema, readYaml(primerFile), primerFile) } : {}),
    ...(existsSync(campaignFile) ? { campaign: parse(CampaignPartSchema, readYaml(campaignFile), campaignFile) } : {}),
  };
}

const wildcards = (r: { expected: string; stamped: string }) =>
  (r.expected === '*' ? 1 : 0) + (r.stamped === '*' ? 1 : 0);

/**
 * Merges the packs' campaign parts in dependency order: later packs override
 * the single values and add to the lists. Standing rows are sorted so specific
 * rows are tried before wildcard ones.
 */
export function mergeCampaign(parts: readonly CampaignPart[]): CampaignDef | undefined {
  if (parts.length === 0) return undefined;
  const last = <K extends keyof CampaignPart>(k: K): CampaignPart[K] => {
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i]?.[k] !== undefined) return parts[i]?.[k];
    return undefined;
  };
  const all = <K extends 'standing' | 'shop' | 'endings'>(k: K) =>
    parts.flatMap((p) => (p[k] ?? []) as NonNullable<CampaignPart[K]>[number][]);
  const required = ['lastDay', 'finale', 'startRings', 'family', 'draupnir', 'debtFloor', 'care', 'worthy'] as const;
  const missing = required.filter((k) => last(k) === undefined);
  if (missing.length > 0) throw new Error(`The campaign is missing ${missing.join(', ')} (campaign.yaml).`);
  return {
    lastDay: last('lastDay') as number,
    finale: last('finale') as string,
    startRings: last('startRings') as number,
    family: last('family') as CampaignDef['family'],
    draupnir: last('draupnir') as CampaignDef['draupnir'],
    debtFloor: last('debtFloor') as number,
    care: last('care') as CampaignDef['care'],
    worthy: last('worthy') as string,
    ...(last('slice') ? { slice: last('slice') as NonNullable<CampaignDef['slice']> } : {}),
    standing: all('standing')
      .map((r, i) => ({ r, i }))
      .sort((a, b) => wildcards(a.r) - wildcards(b.r) || a.i - b.i)
      .map((x) => x.r),
    shop: all('shop'),
    endings: all('endings'),
  };
}

export function emptyPackContent(): PackContent {
  return {
    facts: [],
    observations: [],
    signLaws: [],
    factLaws: [],
    cues: [],
    world: [],
    predicates: [],
    rules: [],
    tools: [],
    archetypes: [],
    speech: [],
    testimony: [],
    ravens: [],
    questions: [],
    pools: {},
    days: [],
    scripted: [],
    procedures: [],
    tallies: [],
  };
}

/** Merges packs in dependency order into one engine Content. */
export function mergeContent(parts: readonly PackContent[], genVersion: number): Content {
  const cat = <K extends Exclude<keyof PackContent, 'pools' | 'daily' | 'primer'>>(k: K): PackContent[K] =>
    parts.flatMap((p) => p[k] as unknown[]) as PackContent[K];
  const one = (k: 'daily' | 'primer'): DaySpec | undefined => {
    const specs = parts.flatMap((p) => (p[k] ? [p[k]] : []));
    if (specs.length > 1) throw new Error(`Only one pack may define ${k}.yaml.`);
    return specs[0];
  };
  const daily = one('daily');
  const primer = one('primer');
  const campaign = mergeCampaign(parts.flatMap((p) => (p.campaign ? [p.campaign] : [])));
  const scripted = cat('scripted');
  const procedures = cat('procedures');
  const tallies = cat('tallies');
  return {
    genVersion,
    facts: cat('facts'),
    observations: cat('observations'),
    signLaws: cat('signLaws'),
    factLaws: cat('factLaws'),
    cues: cat('cues'),
    world: cat('world'),
    predicates: cat('predicates'),
    rules: cat('rules'),
    tools: cat('tools'),
    archetypes: cat('archetypes'),
    speech: cat('speech'),
    testimony: cat('testimony'),
    ravens: cat('ravens'),
    questions: cat('questions'),
    pools: Object.assign({}, ...parts.map((p) => p.pools)),
    days: cat('days').sort((a, b) => a.day - b.day),
    ...(daily ? { daily } : {}),
    ...(primer ? { primer } : {}),
    ...(campaign ? { campaign } : {}),
    ...(scripted.length > 0 ? { scripted } : {}),
    ...(procedures.length > 0 ? { procedures } : {}),
    ...(tallies.length > 0 ? { tallies } : {}),
  };
}

/** Ids a pack owns; used for leak tokens so demo builds can prove they don't contain campaign items. */
export function idsOf(c: PackContent): string[] {
  return [
    ...c.facts.map((x) => x.id),
    ...c.signLaws.map((x) => x.id),
    ...c.factLaws.map((x) => x.id),
    ...c.world.map((x) => x.id),
    ...c.predicates.map((x) => x.id),
    ...c.rules.map((x) => x.id),
    ...c.archetypes.map((x) => x.id),
    ...c.testimony.map((x) => x.id),
    ...c.ravens.map((x) => x.id),
    ...c.questions.map((x) => x.id),
    ...Object.keys(c.pools),
    ...Object.values(c.daily?.params ?? {}).flatMap((p) => p.pool.map((x) => x.id)),
    ...Object.values(c.primer?.params ?? {}).flatMap((p) => p.pool.map((x) => x.id)),
    ...(c.campaign?.shop ?? []).map((u) => u.id),
    ...(c.campaign?.endings ?? []).map((e) => e.id),
    ...c.scripted.map((x) => x.id),
    ...c.procedures.map((x) => x.id),
    ...c.tallies.map((x) => x.id),
    ...c.days.flatMap((d) => Object.values(d.params ?? {}).flatMap((p) => p.pool.map((x) => x.id))),
  ];
}

/** A fact's values as strings, the way `words` and speech `chances` name them. */
function valuesOf(f: FactDef): string[] {
  const d = f.domain;
  if (d.kind === 'enum') return d.values.map(String);
  if (d.kind === 'bool') return ['false', 'true'];
  return Array.from({ length: d.max - d.min + 1 }, (_, i) => String(d.min + i));
}

function walkPred(p: Pred, visit: (p: Pred) => void): void {
  visit(p);
  if ('all' in p) for (const q of p.all) walkPred(q, visit);
  else if ('any' in p) for (const q of p.any) walkPred(q, visit);
  else if ('not' in p) walkPred(p.not, visit);
}

/** Cross-reference checks for one target's merged content (docs/tech-spec.md §10). */
export function lintContent(content: Content, strings: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const dupes = (what: string, ids: readonly (string | number)[]): void => {
    const seen = new Set<string | number>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Duplicate ${what} "${id}".`);
      seen.add(id);
    }
  };
  dupes(
    'fact',
    content.facts.map((f) => f.id),
  );
  dupes(
    'observation',
    content.observations.map((o) => o.key),
  );
  dupes(
    'law',
    [...content.signLaws, ...content.factLaws].map((l) => l.id),
  );
  dupes(
    'cue',
    content.cues.map((c) => c.key),
  );
  dupes(
    'world constraint',
    content.world.map((w) => w.id),
  );
  dupes(
    'predicate',
    content.predicates.map((p) => p.id),
  );
  dupes(
    'rule',
    content.rules.map((r) => r.id),
  );
  dupes(
    'tool',
    content.tools.map((t) => t.id),
  );
  dupes(
    'archetype',
    content.archetypes.map((a) => a.id),
  );
  dupes(
    'template',
    [...content.testimony, ...content.ravens, ...content.questions].map((t) => t.id),
  );
  dupes(
    'day',
    content.days.map((d) => d.day),
  );

  const facts = new Set(content.facts.map((f) => f.id));
  const obsKeys = new Set(content.observations.map((o) => o.key));
  const preds = new Set(content.predicates.map((p) => p.id));
  const fact = (id: string, where: string): void => {
    if (!facts.has(id)) problems.push(`${where} refers to unknown fact "${id}".`);
  };
  const pred = (p: Pred, where: string): void =>
    walkPred(p, (q) => {
      if ('fact' in q) fact(q.fact, where);
      if ('ref' in q && !preds.has(q.ref)) problems.push(`${where} refers to unknown predicate "${q.ref}".`);
    });
  const key = (k: string, where: string): void => {
    if (!(k in strings)) problems.push(`${where} uses missing string "${k}".`);
  };

  for (const f of content.facts) if (f.derived) pred(f.derived, `fact ${f.id}`);
  for (const o of content.observations) {
    if ('fact' in o.from) fact(o.from.fact, `observation ${o.key}`);
    else for (const m of o.from.map) pred(m.when, `observation ${o.key}`);
    if (o.when) pred(o.when, `observation ${o.key}`);
  }
  for (const l of content.signLaws) {
    const walkObs = (p: (typeof l)['if']): void => {
      if ('all' in p) for (const q of p.all) walkObs(q);
      else if (!obsKeys.has(p.obs)) problems.push(`law ${l.id} reads unknown observation "${p.obs}".`);
    };
    walkObs(l.if);
    fact(l.then.fact, `law ${l.id}`);
    key(l.text, `law ${l.id}`);
  }
  for (const l of content.factLaws) {
    pred(l.if, `law ${l.id}`);
    fact(l.then.fact, `law ${l.id}`);
    key(l.text, `law ${l.id}`);
  }
  for (const c of content.cues) {
    if ('fact' in c.hint) fact(c.hint.fact, `cue ${c.key}`);
    key(`cue.${c.key}`, `cue ${c.key}`);
  }
  // The shift UI shows every sign as a text chip: `obs.<key>.<value>`, or `obs.<key>` with an {n} plural.
  const factById = new Map(content.facts.map((f) => [f.id, f]));
  for (const o of content.observations) {
    const values =
      'map' in o.from
        ? [...o.from.map.map((m) => m.value), o.from.otherwise]
        : (() => {
            const d = factById.get(o.from.fact)?.domain;
            return d?.kind === 'enum' ? d.values : d?.kind === 'bool' ? [false, true] : null;
          })();
    if (values === null) key(`obs.${o.key}`, `observation ${o.key}`);
    else for (const v of values) key(`obs.${o.key}.${String(v)}`, `observation ${o.key}`);
  }
  for (const tool of content.tools) key(`tool.${tool.id}`, `tool ${tool.id}`);
  for (const d of new Set(content.rules.map((r) => r.then))) key(`dest.${d}`, `destination ${d}`);
  for (const w of content.world) {
    pred(w.if, `world ${w.id}`);
    pred(w.then, `world ${w.id}`);
  }
  for (const p of content.predicates) for (const v of p.versions) pred(v.is, `predicate ${p.id}`);
  for (const r of content.rules) {
    pred(r.when, `rule ${r.id}`);
    key(r.text, `rule ${r.id}`);
  }
  for (const s of content.speech) {
    if (s.fact) fact(s.fact, `speech slot ${s.slot}`);
    const def = content.facts.find((f) => f.id === s.fact);
    for (const value of Object.keys(s.chances ?? {})) {
      if (!def) problems.push(`speech slot ${s.slot} has chances by value but no fact.`);
      else if (!valuesOf(def).includes(value))
        problems.push(`speech slot ${s.slot} has a chance for "${value}", which ${def.id} can't be.`);
    }
  }
  dupes(
    'procedure',
    (content.procedures ?? []).map((p) => p.id),
  );
  for (const p of content.procedures ?? []) {
    pred(p.when, `procedure ${p.id}`);
    key(p.text, `procedure ${p.id}`);
    key(`${p.text}.short`, `procedure ${p.id}`);
    const tool = content.tools.find((x) => x.id === p.tool);
    if (!tool) problems.push(`procedure ${p.id} is done with a tool this build doesn't have.`);
    else if (tool.since > p.since) problems.push(`procedure ${p.id} starts before its tool does.`);
  }

  const pools = new Set(Object.keys(content.pools));
  dupes(
    'tally line',
    (content.tallies ?? []).map((t) => t.id),
  );
  const templates = [...content.testimony, ...content.ravens, ...(content.tallies ?? [])];
  for (const t of templates) {
    if (t.asserts) fact(t.asserts.fact, `template ${t.id}`);
    key(t.msg, `template ${t.id}`);
    for (const pool of Object.values(t.params ?? {})) {
      if (!pools.has(pool)) problems.push(`template ${t.id} uses unknown pool "${pool}".`);
    }
  }
  for (const f of content.facts) {
    for (const [value, words] of Object.entries(f.words ?? {})) {
      if (!valuesOf(f).includes(value)) problems.push(`fact ${f.id} has words for "${value}", which it can't be.`);
      for (const [pool, word] of Object.entries(words)) {
        if (!pools.has(pool)) problems.push(`fact ${f.id} fixes a word from unknown pool "${pool}".`);
        else if (!content.pools[pool]?.includes(word))
          problems.push(`fact ${f.id} fixes "${word}", which ${pool} doesn't have.`);
      }
    }
  }
  for (const q of content.questions) {
    if (q.on.fact !== '*') fact(q.on.fact, `template ${q.id}`);
    for (const m of q.msgs) key(m, `template ${q.id}`);
  }

  const archetypes = new Map(content.archetypes.map((a) => [a.id, a]));
  const kindsUsed = new Set<string>();
  for (const a of content.archetypes) {
    for (const f of Object.keys(a.truth)) fact(f, `archetype ${a.id}`);
    for (const p of a.require ?? []) pred(p, `archetype ${a.id}`);
    for (const lie of a.lies) {
      fact(lie.fact, `archetype ${a.id}`);
      for (const [k, w] of Object.entries(lie.onQuestion)) if ((w ?? 0) > 0) kindsUsed.add(k);
      const speakable =
        lie.via === 'tally'
          ? (content.tallies ?? []).some((t) => t.asserts.fact === lie.fact && t.asserts.value === lie.claim)
          : content.testimony.some(
              (t) =>
                t.asserts?.fact === lie.fact &&
                t.asserts.value === lie.claim &&
                (t.personas === undefined || t.personas.some((p) => a.personas.includes(p))),
            );
      if (!speakable) {
        const how = lie.via === 'tally' ? 'carve' : 'voice';
        problems.push(`archetype ${a.id} can't ${how} its lie ${lie.fact}=${String(lie.claim)}.`);
      }
    }
  }
  for (const k of kindsUsed) {
    const fallback = content.questions.some(
      (q) => q.on.kind === k && q.on.fact === '*' && !q.on.claimed && !q.on.truth && !q.on.persona,
    );
    if (!fallback) problems.push(`No fallback question template for "${k}" answers.`);
  }

  if (content.campaign) problems.push(...lintCampaign(content, strings));
  problems.push(...lintScripted(content, strings));

  const specs = content.days.map((d) => ({ d, name: `day ${d.day}` }));
  if (content.daily) specs.push({ d: content.daily, name: `the Daily (day ${content.daily.day} mechanics)` });
  if (content.primer) specs.push({ d: content.primer, name: `the primer (day ${content.primer.day} mechanics)` });
  for (const { d, name } of specs) {
    key(d.decree, name);
    for (const [param, def] of Object.entries(d.params ?? {})) {
      for (const choice of def.pool) {
        pred(choice.is, `${name} param ${param}`);
        key(choice.text, `${name} param ${param}`);
      }
    }
    for (const { id } of d.queue.archetypes) {
      if (!archetypes.has(id)) problems.push(`${name} uses unknown archetype "${id}".`);
    }
    const teach = d.queue.teachFirst;
    if (teach && !d.queue.archetypes.some((a) => a.id === teach)) {
      problems.push(`${name} teaches with "${teach}", which isn't in its queue.`);
    }
    for (const slot of d.queue.script ?? []) {
      if (!d.queue.archetypes.some((a) => a.id === slot.id)) {
        problems.push(`${name} scripts "${slot.id}", which isn't in its queue.`);
      }
      if (
        !content.rules.some(
          (r) => r.then === slot.dest && r.since <= d.day && (r.until === undefined || d.day < r.until),
        )
      ) {
        problems.push(`${name} scripts a ${slot.dest} soul, but no rule in force sends anyone there.`);
      }
    }
    const inForce = content.rules
      .filter((r) => r.since <= d.day && (r.until === undefined || d.day < r.until))
      .sort((a, b) => a.order - b.order);
    const last = inForce[inForce.length - 1];
    if (!last || !('always' in last.when)) problems.push(`${name}: the last rule in force must always apply.`);
  }
  return problems;
}

/** Campaign cross-references (docs/tech-spec.md §10). */
function lintCampaign(content: Content, strings: Readonly<Record<string, string>>): string[] {
  const c = content.campaign;
  if (!c) return [];
  const problems: string[] = [];
  const key = (k: string, where: string) => {
    if (!(k in strings)) problems.push(`${where} uses missing string "${k}".`);
  };
  const seen = new Set<string>();
  for (const m of c.family) {
    if (seen.has(m.id)) problems.push(`Duplicate family member "${m.id}".`);
    seen.add(m.id);
    key(m.name, `family member ${m.id}`);
  }
  const shopIds = new Set<string>();
  for (const u of c.shop) {
    if (shopIds.has(u.id)) problems.push(`Duplicate shop item "${u.id}".`);
    shopIds.add(u.id);
    key(u.name, `shop item ${u.id}`);
    key(u.text, `shop item ${u.id}`);
    if ('tool' in u.effect && !content.tools.some((t) => t.id === (u.effect as { tool: string }).tool)) {
      problems.push(`shop item ${u.id} speeds up a tool this build doesn't have.`);
    }
  }
  const endingIds = new Set<string>();
  const walk = (p: StatePred, where: string): void => {
    if ('all' in p) for (const q of p.all) walk(q, where);
    else if ('any' in p) for (const q of p.any) walk(q, where);
    else if ('not' in p) walk(p.not, where);
    else if (!STATE_PATHS.test(p.state)) problems.push(`${where} reads unknown run state "${p.state}".`);
  };
  for (const e of c.endings) {
    if (endingIds.has(e.id)) problems.push(`Duplicate ending "${e.id}".`);
    endingIds.add(e.id);
    key(e.title, `ending ${e.id}`);
    key(e.text, `ending ${e.id}`);
    if (e.when) walk(e.when, `ending ${e.id}`);
  }
  if (!endingIds.has(c.finale)) problems.push(`The campaign's finale "${c.finale}" isn't an ending.`);
  if (!content.predicates.some((p) => p.id === c.worthy)) {
    problems.push(`The campaign's worthy predicate "${c.worthy}" doesn't exist.`);
  }
  for (let d = 1; d <= c.lastDay; d++) {
    const spec = content.days.find((x) => x.day === d);
    if (!spec) problems.push(`Campaign day ${d} has no day spec.`);
    else if (!spec.economy) problems.push(`Campaign day ${d} has no economy.`);
  }
  return problems;
}

/** Every combination of a day's param choices (Freyja's whim and the like), by choice id. */
function paramCombos(content: Content, day: number): Record<string, string>[] {
  const spec = content.days.find((d) => d.day === day);
  let combos: Record<string, string>[] = [{}];
  for (const [name, param] of Object.entries(spec?.params ?? {})) {
    combos = combos.flatMap((c) => param.pool.map((choice) => ({ ...c, [name]: choice.id })));
  }
  return combos;
}

/**
 * Story souls: references, and proof that each one can be made on every day
 * that places it, under every param choice that day can have.
 */
function lintScripted(content: Content, strings: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const defs = new Map<string, ScriptedCaseDef>();
  const facts = new Set(content.facts.map((f) => f.id));
  const family = new Set((content.campaign?.family ?? []).map((m) => m.id));
  const walk = (p: StatePred, where: string): void => {
    if ('all' in p) for (const q of p.all) walk(q, where);
    else if ('any' in p) for (const q of p.any) walk(q, where);
    else if ('not' in p) walk(p.not, where);
    else if (!STATE_PATHS.test(p.state)) problems.push(`${where} reads unknown run state "${p.state}".`);
  };
  const effect = (e: Effect, where: string) => {
    if ('family' in e && !family.has(e.family)) problems.push(`${where} changes unknown family member "${e.family}".`);
  };
  for (const def of content.scripted ?? []) {
    const where = `story soul ${def.id}`;
    if (defs.has(def.id)) problems.push(`Duplicate story soul "${def.id}".`);
    defs.set(def.id, def);
    for (const f of [...Object.keys(def.truth), ...def.lies.map((l) => l.fact)]) {
      if (!facts.has(f)) problems.push(`${where} refers to unknown fact "${f}".`);
    }
    for (const k of def.lines ?? []) if (!(k in strings)) problems.push(`${where} uses missing string "${k}".`);
    if (def.when) walk(def.when, where);
    for (const rule of def.onStamp ?? []) for (const e of rule.effects) effect(e, where);
  }
  const placed = new Set<string>();
  for (const spec of [content.daily, content.primer]) {
    if (spec?.queue.scripted) problems.push('The Daily and the primer have no story souls.');
  }
  for (const d of content.days) {
    for (const slot of d.queue.scripted ?? []) {
      const def = defs.get(slot.case);
      if (!def) {
        problems.push(`day ${d.day} places unknown story soul "${slot.case}".`);
        continue;
      }
      placed.add(def.id);
      if (slot.at > d.queue.count[1]) problems.push(`day ${d.day} places ${def.id} past the end of its queue.`);
      for (const choose of paramCombos(content, d.day)) {
        const ctx = createDayContext(content, d.day, 'lint', undefined, choose);
        const made = scriptedCase(def, ctx, 'lint', slot.at);
        if (!made.ok) {
          const params = Object.entries(choose).map(([k, v]) => `${k}=${v}`);
          problems.push(`day ${d.day}: ${made.why}${params.length > 0 ? ` with ${params.join(', ')}` : ''}.`);
          break;
        }
      }
    }
  }
  for (const id of defs.keys()) if (!placed.has(id)) problems.push(`No day places story soul "${id}".`);
  return problems;
}
