import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArchetypeSchema,
  CueSchema,
  DaySpecSchema,
  FactSchema,
  LawSchema,
  NamedPredicateSchema,
  ObservationSchema,
  PoolsSchema,
  QuestionTemplateSchema,
  RavenTemplateSchema,
  RuleSchema,
  SpeechSlotSchema,
  TestimonyTemplateSchema,
  ToolSchema,
  toFactLaw,
  toSignLaw,
  WorldSchema,
} from '@cots/content-schema';
import type {
  ArchetypeDef,
  Content,
  CueDef,
  DaySpec,
  FactDef,
  FactLaw,
  NamedPredicate,
  ObservationDef,
  Pred,
  QuestionTemplate,
  RavenTemplate,
  RuleDef,
  SignLaw,
  SpeechSlotDef,
  TestimonyTemplate,
  ToolDef,
  WorldConstraint,
} from '@cots/engine';
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
  const daysDir = join(dir, 'days');
  const days = existsSync(daysDir)
    ? readdirSync(daysDir)
        .filter((f) => f.endsWith('.yaml'))
        .sort()
        .map((f) => parse(DaySpecSchema, readYaml(join(daysDir, f)), join(daysDir, f)))
    : [];
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
    ...(existsSync(dailyFile) ? { daily: parse(DaySpecSchema, readYaml(dailyFile), dailyFile) } : {}),
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
  };
}

/** Merges packs in dependency order into one engine Content. */
export function mergeContent(parts: readonly PackContent[], genVersion: number): Content {
  const cat = <K extends Exclude<keyof PackContent, 'pools' | 'daily'>>(k: K): PackContent[K] =>
    parts.flatMap((p) => p[k] as unknown[]) as PackContent[K];
  const dailies = parts.flatMap((p) => (p.daily ? [p.daily] : []));
  if (dailies.length > 1) throw new Error('Only one pack may define the Daily Shift (daily.yaml).');
  const daily = dailies[0];
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
    ...c.days.flatMap((d) => Object.values(d.params ?? {}).flatMap((p) => p.pool.map((x) => x.id))),
  ];
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
    fact(c.hint.fact, `cue ${c.key}`);
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
  for (const s of content.speech) if (s.fact) fact(s.fact, `speech slot ${s.slot}`);

  const pools = new Set(Object.keys(content.pools));
  const templates = [...content.testimony, ...content.ravens];
  for (const t of templates) {
    if (t.asserts) fact(t.asserts.fact, `template ${t.id}`);
    key(t.msg, `template ${t.id}`);
    for (const pool of Object.values(t.params ?? {})) {
      if (!pools.has(pool)) problems.push(`template ${t.id} uses unknown pool "${pool}".`);
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
      const speakable = content.testimony.some(
        (t) =>
          t.asserts?.fact === lie.fact &&
          t.asserts.value === lie.claim &&
          (t.personas === undefined || t.personas.some((p) => a.personas.includes(p))),
      );
      if (!speakable) problems.push(`archetype ${a.id} can't voice its lie ${lie.fact}=${String(lie.claim)}.`);
    }
  }
  for (const k of kindsUsed) {
    const fallback = content.questions.some(
      (q) => q.on.kind === k && q.on.fact === '*' && !q.on.claimed && !q.on.truth && !q.on.persona,
    );
    if (!fallback) problems.push(`No fallback question template for "${k}" answers.`);
  }

  const specs = content.days.map((d) => ({ d, name: `day ${d.day}` }));
  if (content.daily) specs.push({ d: content.daily, name: `the Daily (day ${content.daily.day} mechanics)` });
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
    const inForce = content.rules
      .filter((r) => r.since <= d.day && (r.until === undefined || d.day < r.until))
      .sort((a, b) => a.order - b.order);
    const last = inForce[inForce.length - 1];
    if (!last || !('always' in last.when)) problems.push(`${name}: the last rule in force must always apply.`);
  }
  return problems;
}
