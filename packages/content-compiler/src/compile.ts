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
import { fnv1a32 } from '@cots/engine';
import { LineCounter, parseDocument } from 'yaml';
import { z } from 'zod';

export class ContentError extends Error {
  override name = 'ContentError';
}

export interface LoadedPack {
  manifest: PackManifest;
  strings: StringTable;
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
    packs.set(manifest.id, { manifest, strings, dir });
  }
  validatePacks(packs);
  return packs;
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

  const outDir = join(outRoot, targetId);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const tables = target.packs.map((id) => sortedObject((packs.get(id) as LoadedPack).strings));
  target.packs.forEach((id, i) => {
    writeFileSync(join(outDir, `strings.${id}.en.json`), `${JSON.stringify(tables[i], null, 2)}\n`);
  });

  const canaries = target.packs.flatMap((id) => {
    const canary = (packs.get(id) as LoadedPack).manifest.canary;
    return canary ? [canary] : [];
  });
  const contentHash = hex(
    fnv1a32(JSON.stringify(target.packs.map((id, i) => [id, packs.get(id)?.manifest, tables[i]]))),
  );
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
      `import manifest from './manifest.json';`,
      ...imports,
      '',
      'export { manifest };',
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

/** Writes `<outRoot>/leak/<pack>.tokens.json`: strings that must never appear outside builds of that pack. */
export function writeLeakTokens(packs: Packs, outRoot: string): void {
  const dir = join(outRoot, 'leak');
  mkdirSync(dir, { recursive: true });
  for (const [id, pack] of packs) {
    const file: LeakTokens = {
      pack: id,
      canary: pack.manifest.canary ?? null,
      tokens: [...(pack.manifest.canary ? [pack.manifest.canary] : []), ...Object.keys(pack.strings).sort()],
    };
    writeFileSync(join(dir, `${id}.tokens.json`), `${JSON.stringify(file, null, 2)}\n`);
  }
}
