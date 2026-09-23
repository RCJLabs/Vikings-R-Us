import type { BodyScene, Hotspot } from '@cots/art-placeholder';
import { type CaseSpec, type DayCtx, type Field, inspectable, type ShiftState, type SoulState } from '@cots/engine';
import { t } from '../i18n';

/** The sign key a body field shows (observation or cue). */
export const signKey = (f: Field): string | undefined => f.obs?.key ?? f.cue?.key;

/** A field as the player reads it: a sign chip, a cue, or a line of testimony or raven report. */
export function fieldText(f: Field): string {
  if (f.obs) {
    const v = f.obs.value;
    return typeof v === 'number' ? t(`obs.${f.obs.key}`, { n: v }) : t(`obs.${f.obs.key}.${String(v)}`);
  }
  if (f.cue) return t(`cue.${f.cue.key}`);
  if (f.text) return t(f.text.msg, f.text.params);
  return f.id;
}

/** What the body art draws for a soul: every sign it carries, its cues and the tools used on it. */
export function sceneFor(c: CaseSpec, soul: SoulState): BodyScene {
  const obs: Record<string, string | number | boolean> = {};
  const cues: string[] = [];
  for (const f of c.evidence.fields) {
    if (f.obs) obs[f.obs.key] = f.obs.value;
    if (f.cue) cues.push(f.cue.key);
  }
  return { view: soul.view, look: c.evidence.look, obs, cues, tools: soul.tools };
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
