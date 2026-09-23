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
import { type Content, fnv1a32 } from '@cots/engine';
import { parse as parseIcu } from '@formatjs/icu-messageformat-parser';
import { LineCounter, parseDocument } from 'yaml';
import { z } from 'zod';
import { idsOf, lintContent, loadPackContent, mergeContent, type PackContent } from './gameplay';

export class ContentError extends Error {
  override name = 'ContentError';
}

export interface LoadedPack {
  manifest: PackManifest;
  strings: StringTable;
  content: PackContent;
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
    packs.set(manifest.id, { manifest, strings, content, dir });
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
  }
  if (problems.length > 0) throw new ContentError(problems.join('\n'));
}

const sortedObject = (table: StringTable): StringTable =>
  Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const hex = (n: number): string => n.toString(16).padStart(8, '0');

/** The merged gameplay content and strings a target ships. */
export function buildTarget(target: TargetDef, packs: Packs): { content: Content; strings: StringTable } {
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
  return { content, strings };
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

export interface CompileResult {
  target: string;
  packs: readonly PackId[];
  contentHash: string;
  outDir: string;
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

  const { content, strings } = buildTarget(target, packs);
  const problems = lintContent(content, strings);
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

  const canaries = target.packs.flatMap((id) => {
    const canary = (packs.get(id) as LoadedPack).manifest.canary;
    return canary ? [canary] : [];
  });
  const contentHash = hex(fnv1a32(JSON.stringify([target.packs, tables, content, daily])));
  const manifest = {
    target: targetId,
    edition: target.edition,
    lab: target.lab,
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
      `import type { Content } from '@cots/engine';`,
      `import content from './content.json';`,
      `import daily from './daily.json';`,
      `import manifest from './manifest.json';`,
      ...imports,
      '',
      'export { manifest };',
      'export const gameContent = content as unknown as Content;',
      '/** Core + daily packs only (see buildDaily). */',
      'export const dailyContent = daily as unknown as Content | null;',
      `export const strings: Readonly<Record<string, string>> = { ${spread} };`,
      '',
    ].join('\n'),
  );

  return { target: targetId, packs: target.packs, contentHash, outDir };
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
        ...[...new Set([...Object.keys(pack.strings), ...idsOf(pack.content)])].sort(),
      ],
    };
    writeFileSync(join(dir, `${id}.tokens.json`), `${JSON.stringify(file, null, 2)}\n`);
  }
}
