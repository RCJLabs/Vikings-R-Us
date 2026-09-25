import { dailyContent, gameContent, manifest } from 'virtual:content';
import { ENGINE_MAJOR, type RunSave, resumeSave } from '@cots/engine';
import { signal } from '@preact/signals';
import {
  type Backup,
  type Here,
  mergeBackup,
  newerSlot,
  parseBackup,
  type RestoreReport,
  type SlotRecord,
  validSlot,
} from './save-data';
import {
  dailyProgress,
  dailyRecord,
  endlessProgress,
  keepStorage,
  kvStore,
  localKey,
  mirror,
  readMirrorRaw,
  saveDailyProgress,
  saveDailyRecord,
  saveEndlessProgress,
  settings,
  settleAchievements,
  today,
  UNREAD_KEYS,
  updateSettings,
} from './store';

/*
 * The campaign's save slots in storage, and backups of everything
 * (docs/tech-spec.md §7, §28). Each slot is kept twice, like the Daily's
 * progress: in IndexedDB and, synchronously, in localStorage. A slot neither
 * copy of which can be read is kept as it was found and shown as unreadable,
 * never as empty, so nothing writes over it until the player clears it.
 */

export const SLOT_COUNT = 3;

const slotKey = (i: number) => `campaign.${i}`;
const mirrorKey = (i: number) => localKey(`campaign.${i}`);

/** What a slot held that this build couldn't read, as found in each copy. */
export interface Unreadable {
  readonly stored?: unknown;
  readonly mirror?: string;
}

export const slots = signal<readonly (SlotRecord | null)[]>(Array.from({ length: SLOT_COUNT }, () => null));
export const unreadable = signal<readonly (Unreadable | null)[]>(Array.from({ length: SLOT_COUNT }, () => null));

const parse = (raw: string | null): unknown => {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export async function loadSlots(): Promise<void> {
  const store = kvStore();
  const found = await Promise.all(
    Array.from({ length: SLOT_COUNT }, async (_, i) => {
      const stored = store ? await store.get<unknown>(slotKey(i)).catch(() => undefined) : undefined;
      const raw = readMirrorRaw(mirrorKey(i));
      const record = newerSlot(validSlot(stored), validSlot(parse(raw)));
      const bad: Unreadable | null =
        !record && (stored !== undefined || raw !== null)
          ? { ...(stored !== undefined ? { stored } : {}), ...(raw !== null ? { mirror: raw } : {}) }
          : null;
      return { record, bad };
    }),
  );
  slots.value = found.map((f) => f.record);
  unreadable.value = found.map((f) => f.bad);
}

/** A slot that holds nothing at all: neither a save nor something unreadable. */
export const isFree = (i: number): boolean => slots.peek()[i] === null && unreadable.peek()[i] === null;

/** Writes a slot's record to both copies; the promise is IndexedDB's write. */
export function writeSlot(i: number, record: SlotRecord): Promise<void> {
  slots.value = slots.peek().map((r, k) => (k === i ? record : r));
  mirror(mirrorKey(i), record);
  // A campaign is worth asking the browser to keep.
  void keepStorage();
  return kvStore()?.set(slotKey(i), record) ?? Promise.resolve();
}

/** Empties a slot, whatever it held (a save, or something unreadable the player chose to clear). */
export function clearSlot(i: number): void {
  slots.value = slots.peek().map((r, k) => (k === i ? null : r));
  unreadable.value = unreadable.peek().map((u, k) => (k === i ? null : u));
  mirror(mirrorKey(i), null);
  void kvStore()?.remove(slotKey(i));
}

/** A save that reads but won't open (the engine rejects it): shown as unreadable, stored data untouched. */
export function markUnreadable(i: number, record: SlotRecord): void {
  slots.value = slots.peek().map((r, k) => (k === i ? null : r));
  unreadable.value = unreadable.peek().map((u, k) => (k === i ? { stored: record } : u));
}

/** An unreadable slot's data as text, to keep or to attach to a bug report. */
export function unreadableText(i: number): string {
  return JSON.stringify({
    format: 'cots.unreadable',
    slot: i + 1,
    build: buildOf(),
    found: unreadable.peek()[i] ?? null,
  });
}

const buildOf = () => ({ target: manifest.target, edition: manifest.edition, content: manifest.contentHash });

/** Everything worth keeping, as of now (the slots read fresh from storage). */
export async function makeBackup(): Promise<Backup> {
  await loadSlots();
  const store = kvStore();
  const unread: Record<string, unknown> = {};
  for (const [i, u] of unreadable.peek().entries()) if (u) unread[slotKey(i)] = u;
  for (const key of UNREAD_KEYS) {
    const found = store ? await store.get<unknown>(key).catch(() => undefined) : undefined;
    if (found !== undefined) unread[key] = found;
  }
  return {
    format: 'cots.backup',
    v: 1,
    made: new Date().toISOString(),
    build: buildOf(),
    settings: settings.peek(),
    daily: dailyRecord.peek(),
    dailyProgress: dailyProgress.peek(),
    endless: endlessProgress.peek(),
    slots: slots.peek(),
    ...(Object.keys(unread).length > 0 ? { unreadable: unread } : {}),
  };
}

/** Whether this build can play a campaign save: every day in it is one this build has, and it opens. */
function playable(save: RunSave): boolean {
  if (!save.mornings.every((m) => gameContent.days.some((d) => d.day === m.day))) return false;
  try {
    resumeSave(save, gameContent, ENGINE_MAJOR);
    return true;
  } catch {
    return false;
  }
}

export type Restored =
  | { readonly ok: true; readonly report: RestoreReport }
  | { readonly ok: false; readonly why: 'notJson' | 'notBackup' | 'newer' | 'tooBig' };

/** The largest backup text taken in: three full campaigns come to well under a megabyte. */
const MAX_BACKUP = 8_000_000;

/** Merges a backup's text into this device's saves (save-data.ts's mergeBackup), and stores the result. */
export async function restoreBackup(text: string): Promise<Restored> {
  if (text.length > MAX_BACKUP) return { ok: false, why: 'tooBig' };
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  await loadSlots();
  const here: Here = {
    settings: settings.peek(),
    daily: dailyRecord.peek(),
    dailyProgress: dailyProgress.peek(),
    endless: endlessProgress.peek(),
    slots: slots.peek(),
    unreadable: unreadable.peek().map((u) => u !== null),
  };
  const { next, report } = mergeBackup(here, parsed.backup, {
    today: today().n,
    g: (dailyContent ?? gameContent).genVersion,
    playable,
  });
  if (next.settings !== here.settings) updateSettings(next.settings);
  if (next.daily !== here.daily) saveDailyRecord(next.daily);
  if (next.dailyProgress !== here.dailyProgress) saveDailyProgress(next.dailyProgress);
  if (next.endless !== here.endless) saveEndlessProgress(next.endless);
  await Promise.all(next.slots.map((r, i) => (r && r !== here.slots[i] ? writeSlot(i, r) : Promise.resolve())));
  // What the backup's records show, earned here too (the backup's own achievements came in with its settings).
  settleAchievements();
  void keepStorage();
  return { ok: true, report };
}
