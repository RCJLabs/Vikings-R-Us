import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_PACK_DEPS,
  PACK_IDS,
  type PackId,
  type PackManifest,
  PackManifestSchema,
  type StringTable,
  StringTableSchema,
  type TargetDef,
} from '@cots/content-schema';
import { buildDailyChecks, type Content, type DailyChecks, fnv1a32 } from '@cots/engine';
import { parse as parseIcu } from '@formatjs/icu-messageformat-parser';
import { LineCounter, parseDocument } from 'yaml';
import { z } from 'zod';
import { ContentError } from './errors';
import { idsOf, lintContent, loadPackContent, mergeContent, type PackContent } from './gameplay';
import { type CompiledScene, lintScenes, loadScenes } from './scenes';

export { ContentError };

export interface LoadedPack {
  manifest: PackManifest;
  strings: StringTable;
  content: PackContent;
  /** Compiled Ink scenes (`scenes/*.ink`). */
  scenes: CompiledScene[];
  dir: string;
}

export type Packs = ReadonlyMap<PackId, LoadedPack>;

function readYaml(file: string): unknown {
  const lineCounter = new LineCounter();
  // YAML 1.2 core schema keeps words like `NO` as strings; duplicate keys are errors.
  const doc = parseDocument(readFileSync(file, 'utf8'), {
    schema: 'core',
    uniqueKeys: true,
    prettyErrors: true,
    lineCounter,
  });
  if (doc.errors.length > 0) {
    throw new ContentError(`${file}\n${doc.errors.map((e) => e.message).join('\n')}`);
  }
  return doc.toJS();
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ContentError(`${file}\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Loads every pack under `packsDir` (one folder per pack, named after its id). */
export function loadPacks(packsDir: string): Map<PackId, LoadedPack> {
  const packs = new Map<PackId, LoadedPack>();
  for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packsDir, entry.name);
    const manifestFile = join(dir, 'pack.yaml');
    const manifest = parseWith(PackManifestSchema, readYaml(manifestFile), manifestFile);
    if (manifest.id !== entry.name) {
      throw new ContentError(`${manifestFile}\nPack id "${manifest.id}" must match its folder "${entry.name}".`);
    }
    const stringsFile = join(dir, 'strings', 'en.json');
    const strings = existsSync(stringsFile)
      ? parseWith(StringTableSchema, JSON.parse(readFileSync(stringsFile, 'utf8')), stringsFile)
      : {};
    checkMessages(strings, stringsFile);
    const content = loadPackContent(dir, readYaml, parseWith);
    const scenes = loadScenes(dir);
    packs.set(manifest.id, { manifest, strings, content, scenes, dir });
  }
  validatePacks(packs);
  return packs;
}

/** Every string must be valid ICU MessageFormat (plurals, selects, `{name}` arguments). */
export function checkMessages(strings: StringTable, file: string): void {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(strings)) {
    try {
      parseIcu(text);
    } catch (e) {
      problems.push(`"${key}": ${(e as Error).message}`);
    }
  }
  if (problems.length > 0) throw new ContentError(`${file}\nInvalid ICU message:\n${problems.join('\n')}`);
}

/** Checks the rules that keep campaign content out of demo builds. */
export function validatePacks(packs: Packs): void {
  const problems: string[] = [];
  for (const id of PACK_IDS) {
    if (!packs.has(id)) problems.push(`Missing pack "${id}".`);
  }
  const keyOwner = new Map<string, PackId>();
  for (const [id, pack] of packs) {
    const allowed = ALLOWED_PACK_DEPS[id];
    for (const dep of pack.manifest.dependsOn) {
      if (!allowed.includes(dep)) problems.push(`Pack "${id}" may not depend on "${dep}".`);
      if (!packs.has(dep)) problems.push(`Pack "${id}" depends on missing pack "${dep}".`);
    }
    if (id === 'campaign' && !pack.manifest.canary) {
      problems.push('Pack "campaign" needs a canary so the leak check can prove it works.');
    }
    for (const key of Object.keys(pack.strings)) {
      const owner = keyOwner.get(key);
      if (owner) problems.push(`String key "${key}" is defined in both "${owner}" and "${id}".`);
      else keyOwner.set(key, id);
    }
    for (const scene of pack.scenes) {
      const owner = keyOwner.get(scene.id);
      if (owner) problems.push(`Scene "${scene.id}" is defined in both "${owner}" and "${id}".`);
      else keyOwner.set(scene.id, id);
    }
  }
  if (problems.length > 0) throw new ContentError(problems.join('\n'));
}

const sortedObject = (table: StringTable): StringTable =>
  Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const hex = (n: number): string => n.toString(16).padStart(8, '0');

/** The merged gameplay content, strings and scenes a target ships. */
export function buildTarget(
  target: TargetDef,
  packs: Packs,
): { content: Content; strings: StringTable; scenes: CompiledScene[] } {
  const included = target.packs.map((id) => {
    const pack = packs.get(id);
    if (!pack) throw new ContentError(`Target needs missing pack "${id}".`);
    return pack;
  });
  const genVersion = packs.get('core')?.manifest.genVersion ?? 1;
  const content = mergeContent(
    included.map((p) => p.content),
    genVersion,
  );
  const strings: StringTable = Object.assign({}, ...included.map((p) => p.strings));
  const scenes = included.flatMap((p) => p.scenes).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { content, strings, scenes };
}

/**
 * The Daily Shift's content: core plus the daily pack, and nothing else, so a
 * Daily plays the same in the web demo and the full game even when demo or
 * campaign packs add templates, pools or archetypes.
 */
export function buildDaily(packs: Packs): Content | null {
  const core = packs.get('core');
  const daily = packs.get('daily');
  if (!core || !daily?.content.daily) return null;
  return mergeContent([core.content, daily.content], core.manifest.genVersion ?? 1);
}

/**
 * The Dailies whose checksums each build ships for the runtime guard: the
 * preview months before DAILY_EPOCH through about a year after it. Builds made
 * later than that report their Daily as unchecked until this is extended.
 */
export const DAILY_CHECK_RANGE = { from: -120, to: 400 } as const;

const checksCache = new Map<string, DailyChecks>();

/** The checksum table for the Daily content (cached: every target shares it). */
export function dailyChecksFor(daily: Content): DailyChecks {
  const key = hex(fnv1a32(JSON.stringify(daily)));
  let checks = checksCache.get(key);
  if (!checks) {
    checks = buildDailyChecks(daily, DAILY_CHECK_RANGE.from, DAILY_CHECK_RANGE.to);
    checksCache.set(key, checks);
  }
  return checks;
}

export interface CompileResult {
  target: string;
  packs: readonly PackId[];
  contentHash: string;
  outDir: string;
  /** Scenes the target ships, and how many are still marked `# draft`. */
  scenes: number;
  drafts: number;
  /** Rough word count of the target's scenes, for the writing budget. */
  sceneWords: number;
}

/** Writes `<outRoot>/<targetId>/` with only the packs that target is allowed to ship. */
export function compileTarget(targetId: string, target: TargetDef, packs: Packs, outRoot: string): CompileResult {
  const included = new Set<PackId>(target.packs);
  for (const id of target.packs) {
    const pack = packs.get(id);
    if (!pack) throw new ContentError(`Target "${targetId}" needs missing pack "${id}".`);
    for (const dep of pack.manifest.dependsOn) {
      if (!included.has(dep)) {
        throw new ContentError(`Target "${targetId}" includes "${id}" but not its dependency "${dep}".`);
      }
    }
    if (target.edition === 'demo' && pack.manifest.canary) {
      throw new ContentError(`Demo target "${targetId}" may not include canary pack "${id}".`);
    }
  }

  const { content, strings, scenes } = buildTarget(target, packs);
  const problems = [...lintContent(content, strings), ...lintScenes(content, scenes, strings)];
  const daily = included.has('daily') ? buildDaily(packs) : null;
  if (daily) {
    // The Daily may only use core and daily strings, like its content.
    const own = { ...packs.get('core')?.strings, ...packs.get('daily')?.strings };
    problems.push(...lintContent(daily, own).map((p) => `Daily content: ${p}`));
  }
  if (problems.length > 0) throw new ContentError(`Target "${targetId}":\n${problems.join('\n')}`);

  const outDir = join(outRoot, targetId);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const tables = target.packs.map((id) => sortedObject((packs.get(id) as LoadedPack).strings));
  target.packs.forEach((id, i) => {
    writeFileSync(join(outDir, `strings.${id}.en.json`), `${JSON.stringify(tables[i], null, 2)}\n`);
  });
  writeFileSync(join(outDir, 'content.json'), `${JSON.stringify(content)}\n`);
  writeFileSync(join(outDir, 'daily.json'), `${JSON.stringify(daily)}\n`);
  writeFileSync(join(outDir, 'daily-checks.json'), `${JSON.stringify(daily ? dailyChecksFor(daily) : null)}\n`);
  const sceneTable = Object.fromEntries(scenes.map((sc) => [sc.id, sc.json]));
  writeFileSync(join(outDir, 'scenes.json'), `${JSON.stringify(sceneTable)}\n`);

  const canaries = target.packs.flatMap((id) => {
    const canary = (packs.get(id) as LoadedPack).manifest.canary;
    return canary ? [canary] : [];
  });
  const contentHash = hex(fnv1a32(JSON.stringify([target.packs, tables, content, daily, sceneTable])));
  const manifest = {
    target: targetId,
    edition: target.edition,
    lab: target.lab,
    playtest: target.playtest,
    storage: target.storage,
    packs: target.packs,
    canaries,
    contentHash,
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const imports = target.packs.map((id, i) => `import strings${i} from './strings.${id}.en.json';`);
  const spread = target.packs.map((_, i) => `...strings${i}`).join(', ');
  writeFileSync(
    join(outDir, 'index.ts'),
    [
      `// Generated by content-compiler for target "${targetId}". Do not edit.`,
      `import type { Content, DailyChecks } from '@cots/engine';`,
      `import content from './content.json';`,
      `import daily from './daily.json';`,
      `import dailyChecksData from './daily-checks.json';`,
      `import manifest from './manifest.json';`,
      ...imports,
      '',
      'export { manifest };',
      'export const gameContent = content as unknown as Content;',
      '/** Core + daily packs only (see buildDaily). */',
      'export const dailyContent = daily as unknown as Content | null;',
      '/** Checksums every Daily should have, for the runtime guard. */',
      'export const dailyChecks = dailyChecksData as DailyChecks | null;',
      '/** Compiled Ink scenes by id (day specs name them in `scenes`), loaded on first use. */',
      "export const loadScenes = (): Promise<Readonly<Record<string, object>>> => import('./scenes.json').then((m) => m.default);",
      `export const strings: Readonly<Record<string, string>> = { ${spread} };`,
      '',
    ].join('\n'),
  );

  return {
    target: targetId,
    packs: target.packs,
    contentHash,
    outDir,
    scenes: scenes.length,
    drafts: scenes.filter((sc) => sc.draft).length,
    sceneWords: scenes.reduce((n, sc) => n + sc.words, 0),
  };
}

export interface LeakTokens {
  pack: PackId;
  canary: string | null;
  tokens: string[];
}

/**
 * Writes `<outRoot>/leak/<pack>.tokens.json`: the canary plus every string key
 * and content id the pack owns. The leak check looks for them (quoted) in
 * builds that must not contain the pack.
 */
export function writeLeakTokens(packs: Packs, outRoot: string): void {
  const dir = join(outRoot, 'leak');
  mkdirSync(dir, { recursive: true });
  for (const [id, pack] of packs) {
    const file: LeakTokens = {
      pack: id,
      canary: pack.manifest.canary ?? null,
      tokens: [
        ...(pack.manifest.canary ? [pack.manifest.canary] : []),
        ...[
          ...new Set([...Object.keys(pack.strings), ...idsOf(pack.content), ...pack.scenes.map((sc) => sc.id)]),
        ].sort(),
      ],
    };
    writeFileSync(join(dir, `${id}.tokens.json`), `${JSON.stringify(file, null, 2)}\n`);
  }
}
