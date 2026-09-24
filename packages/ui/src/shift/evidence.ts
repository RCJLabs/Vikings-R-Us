import { gameContent } from 'virtual:content';
import type { BodyScene, Hotspot, Portrait } from '@cots/art';
import {
  type CaseSpec,
  type DayCtx,
  type Field,
  fnv1a32,
  inspectable,
  type Look,
  type ShiftState,
  type SoulState,
} from '@cots/engine';
import { t } from '../i18n';

/** The sign key a body field shows (observation or cue). */
export const signKey = (f: Field): string | undefined => f.obs?.key ?? f.cue?.key;

const HAIRS = ['dark', 'fair', 'red', 'grey'] as const;
const BEARDS: readonly Look['beard'][] = ['none', 'short', 'long', 'braided'];
const BUILDS: readonly Look['build'][] = ['lean', 'broad', 'heavy'];

export interface RegistryEntry extends Portrait {
  /** The soul's own entry, someone else's of the same name, or nobody. Hidden: the player tells them apart by the hair. */
  readonly kind: 'self' | 'other' | 'nobody';
  readonly name: string;
  readonly patronym: string;
  readonly crime: string;
}

/**
 * What searching the registry by name finds (docs/build-plan.md §2, Day 6):
 * this soul's own entry, someone else's with the same name, whose hair is
 * always different, or nobody. Cosmetic details come from the case id, so a
 * soul finds the same entry every time.
 */
export function registryEntry(c: CaseSpec, f: Field): RegistryEntry {
  const value = f.obs?.value;
  const kind = value === 'listed' ? 'self' : value === 'none' ? 'nobody' : 'other';
  const { look } = c.evidence;
  const h = fnv1a32(`${c.id}|registry`);
  const own = HAIRS.indexOf(String(c.truth.hair) as (typeof HAIRS)[number]);
  const other = <T>(list: readonly T[], value: T, k: number) =>
    list[(Math.max(0, list.indexOf(value)) + 1 + (k % (list.length - 1))) % list.length] as T;
  const crimes = gameContent.pools['pool.crimes'] ?? [];
  const namesake = kind === 'other';
  return {
    kind,
    name: look.name,
    patronym: look.patronym,
    gender: look.gender,
    hair: namesake ? other(HAIRS, HAIRS[own] ?? 'dark', h) : (HAIRS[own] ?? 'dark'),
    beard: namesake && look.gender === 'm' ? other(BEARDS, look.beard, h >>> 3) : look.beard,
    build: namesake ? other(BUILDS, look.build, h >>> 6) : look.build,
    crime: crimes[h % Math.max(1, crimes.length)] ?? '',
  };
}

/** What the decree also required and wasn't done, e.g. "clip the nails". */
export function skippedText(skipped: readonly string[] | undefined, ctx: DayCtx): string[] {
  return (skipped ?? []).map((id) => {
    const p = ctx.procedures.find((x) => x.id === id);
    return p ? t(`${p.text}.short`) : id;
  });
}

/** Somebody else's given name for this soul's case (an owner's runes that don't name the soul). */
export function otherName(c: CaseSpec): string {
  const names = (gameContent.pools['names.m'] ?? []).filter((n) => n !== c.evidence.look.name);
  return names[fnv1a32(`${c.id}|owner`) % Math.max(1, names.length)] ?? 'Nobody';
}

/** A field as the player reads it: a sign chip, a cue, or a line of testimony or raven report. */
export function fieldText(f: Field, c?: CaseSpec): string {
  if (f.item === 'registry' && f.obs) {
    if (!c) return t('ui.registry.field');
    const e = registryEntry(c, f);
    return t(`obs.registry.${String(f.obs.value)}`, {
      name: e.name,
      patronym: e.patronym,
      hair: t(`obs.hair.${e.hair}`),
      crime: e.crime,
    });
  }
  if (f.obs) {
    const v = f.obs.value;
    // Readings that name somebody (a weapon's owner) get the names; other signs ignore them.
    const who: Record<string, string> = c
      ? { name: c.evidence.look.name, patronym: c.evidence.look.patronym, other: otherName(c) }
      : {};
    return typeof v === 'number' ? t(`obs.${f.obs.key}`, { n: v, ...who }) : t(`obs.${f.obs.key}.${String(v)}`, who);
  }
  if (f.cue) return t(`cue.${f.cue.key}`);
  if (f.text) return t(f.text.msg, f.text.params);
  return f.id;
}

/**
 * What the body art draws for a soul: every sign it carries, its cues, the tools used on it and the
 * weapon its words name, or would (an Ulfberht is a sword even when nobody says so).
 */
export function sceneFor(c: CaseSpec, soul: SoulState): BodyScene {
  const obs: Record<string, string | number | boolean> = {};
  const cues: string[] = [];
  let weapon: string | undefined;
  for (const f of c.evidence.fields) {
    if (f.obs) obs[f.obs.key] = f.obs.value;
    if (f.cue) cues.push(f.cue.key);
    const named = f.text?.params.weapon;
    if (weapon === undefined && typeof named === 'string') weapon = named;
  }
  weapon ??= c.evidence.words?.['pool.weapons'];
  return { view: soul.view, look: c.evidence.look, obs, cues, tools: soul.tools, ...(weapon ? { weapon } : {}) };
}

/** Fields a hotspot would reveal right now. */
export function regionFields(h: Hotspot, state: ShiftState, ctx: DayCtx): Field[] {
  return inspectable(state, ctx).filter((f) => {
    const k = signKey(f);
    return k !== undefined && f.item === 'body' && h.keys.includes(k);
  });
}

/** True once every field under the hotspot has been looked at. */
export function regionSeen(h: Hotspot, state: ShiftState, ctx: DayCtx): boolean {
  const fields = regionFields(h, state, ctx);
  return fields.length > 0 && fields.every((f) => state.soul.seen.includes(f.id));
}
