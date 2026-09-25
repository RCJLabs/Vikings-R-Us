import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SOUND_ROLES, SOUND_TYPES, type SoundBedDef, type SoundPack } from '@cots/content-schema';
import { ContentError } from './errors';

/*
 * The sound a target ships (docs/tech-spec.md §39): each pack's `sound.yaml` names its beds and cue files, and
 * the files live in `assets/<pack>/sound/`. Only the target's packs are read, so a demo never names the
 * campaign's music. A layer or cue whose files aren't there yet is left out, and so is a day's or an ending's
 * bed with no files: the player hears the place's own bed instead, or the placeholder cue, or nothing.
 */

const LAYERS = ['music', 'tension', 'ambience'] as const;
type LayerName = (typeof LAYERS)[number];

export interface SoundFile {
  /** The file on disk. */
  readonly path: string;
  readonly type: string;
}

export interface SoundLayerOut {
  readonly loop: boolean;
  /** The file in each format there is, first choice first. */
  readonly src: readonly SoundFile[];
}

export type SoundBedOut = Partial<Record<LayerName, SoundLayerOut>>;

export interface CompiledSound {
  readonly beds: Readonly<Record<string, SoundBedOut>>;
  readonly days: Readonly<Record<number, Readonly<Record<string, string>>>>;
  readonly endings: Readonly<Record<string, string>>;
  readonly cues: Readonly<Record<string, readonly SoundLayerOut[]>>;
  /** How many files the packs name, and which have none yet (`<pack>/<name>`). */
  readonly named: number;
  readonly missing: readonly string[];
}

export interface SoundPackIn {
  readonly id: string;
  readonly sound: SoundPack | null;
  /** `assets/<pack>`: the pack's files are in its `sound/` folder. */
  readonly assetsDir: string;
}

export function compileSound(packs: readonly SoundPackIn[], endings: ReadonlySet<string>): CompiledSound {
  const problems: string[] = [];
  const missing: string[] = [];
  let named = 0;

  const filesFor = (pack: SoundPackIn, name: string, loop: boolean): SoundLayerOut | null => {
    named += 1;
    const src = Object.entries(SOUND_TYPES).flatMap(([ext, type]) => {
      const path = join(pack.assetsDir, 'sound', `${name}.${ext}`);
      return existsSync(path) ? [{ path, type }] : [];
    });
    if (src.length === 0) missing.push(`${pack.id}/${name}`);
    return src.length > 0 ? { loop, src } : null;
  };

  const defined = new Map<string, string>();
  const beds: Record<string, SoundBedOut> = {};
  for (const pack of packs) {
    for (const bed of pack.sound?.beds ?? []) {
      const other = defined.get(bed.id);
      if (other) problems.push(`sound: bed "${bed.id}" is in both ${other} and ${pack.id}.`);
      defined.set(bed.id, pack.id);
      const out: SoundBedOut = {};
      for (const layer of LAYERS) {
        const def: SoundBedDef[LayerName] = bed[layer];
        if (def === undefined) continue;
        const file = typeof def === 'string' ? { file: def, loop: true } : def;
        const found = filesFor(pack, file.file, file.loop);
        if (found) out[layer] = found;
      }
      if (Object.keys(out).length > 0) beds[bed.id] = out;
    }
  }
  // Packs with sound give every place its bed (a typo would be silence nobody notices); packs without, none.
  if (packs.some((p) => p.sound !== null)) {
    for (const role of SOUND_ROLES) {
      if (!defined.has(role)) problems.push(`sound: no bed "${role}" for the ${role} screens.`);
    }
  }

  const known = (bed: string, where: string) => {
    if (!defined.has(bed)) problems.push(`sound: ${where} names bed "${bed}", which no pack defines.`);
    return beds[bed] !== undefined;
  };
  const days: Record<number, Record<string, string>> = {};
  for (const pack of packs) {
    for (const d of pack.sound?.days ?? []) {
      for (const [role, bed] of Object.entries(d.beds)) {
        if (bed === undefined) continue;
        const set = days[d.day] ?? {};
        days[d.day] = set;
        if (set[role]) problems.push(`sound: Day ${d.day}'s ${role} is given twice.`);
        if (known(bed, `Day ${d.day}'s ${role}`)) set[role] = bed;
      }
    }
  }
  const endingBeds: Record<string, string> = {};
  for (const pack of packs) {
    for (const e of pack.sound?.endings ?? []) {
      if (!endings.has(e.ending))
        problems.push(`sound: ${pack.id} gives music to "${e.ending}", which isn't an ending.`);
      if (endingBeds[e.ending]) problems.push(`sound: "${e.ending}" is given music twice.`);
      if (known(e.bed, `"${e.ending}"`)) endingBeds[e.ending] = e.bed;
    }
  }

  const cues: Record<string, SoundLayerOut[]> = {};
  const cueFrom = new Map<string, string>();
  for (const pack of packs) {
    for (const [cue, names] of Object.entries(pack.sound?.cues ?? {})) {
      if (names === undefined) continue;
      const other = cueFrom.get(cue);
      if (other) problems.push(`sound: cue "${cue}" is in both ${other} and ${pack.id}.`);
      cueFrom.set(cue, pack.id);
      const variants = names.flatMap((name) => filesFor(pack, name, false) ?? []);
      if (variants.length > 0) cues[cue] = variants;
    }
  }

  if (problems.length > 0) throw new ContentError(problems.join('\n'));
  const nonEmpty = Object.fromEntries(Object.entries(days).filter(([, set]) => Object.keys(set).length > 0));
  return { beds, days: nonEmpty, endings: endingBeds, cues, named, missing };
}

/**
 * The generated module: each file as `new URL(<path>, import.meta.url)`, which Vite copies into the build with
 * a hashed name, so only files a target names are shipped.
 */
export function soundModule(sound: CompiledSound, outDir: string, targetId: string): string {
  const file = (f: SoundFile) => {
    const path = relative(outDir, f.path).split(sep).join('/');
    return `{ url: new URL(${JSON.stringify(path.startsWith('.') ? path : `./${path}`)}, import.meta.url).href, type: ${JSON.stringify(f.type)} }`;
  };
  const layer = (l: SoundLayerOut) => `{ loop: ${l.loop}, src: [${l.src.map(file).join(', ')}] }`;
  const bed = (b: SoundBedOut) => `{ ${LAYERS.flatMap((k) => (b[k] ? [`${k}: ${layer(b[k])}`] : [])).join(', ')} }`;
  const beds = Object.entries(sound.beds).map(([id, b]) => `    ${JSON.stringify(id)}: ${bed(b)},`);
  const cues = Object.entries(sound.cues).map(([id, v]) => `    ${JSON.stringify(id)}: [${v.map(layer).join(', ')}],`);
  return [
    `// Generated by content-compiler for target "${targetId}". Do not edit.`,
    `// ${sound.named - sound.missing.length} of ${sound.named} sound files named in sound.yaml are here; the rest are silent.`,
    'export const sound = {',
    `  beds: {${beds.length > 0 ? `\n${beds.join('\n')}\n  ` : ''}},`,
    `  days: ${JSON.stringify(sound.days)},`,
    `  endings: ${JSON.stringify(sound.endings)},`,
    `  cues: {${cues.length > 0 ? `\n${cues.join('\n')}\n  ` : ''}},`,
    '};',
    '',
  ].join('\n');
}
