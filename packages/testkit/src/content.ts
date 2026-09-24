import { resolve } from 'node:path';
import { buildDaily, buildTarget, loadPacks } from '@cots/content-compiler';
import { TARGETS, type TargetId } from '@cots/content-schema';
import type { Content } from '@cots/engine';

const packsDir = resolve(import.meta.dirname, '../../../content/packs');
const cache = new Map<TargetId, { content: Content; scenes: Readonly<Record<string, object>> }>();

function built(target: TargetId) {
  const hit = cache.get(target);
  if (hit) return hit;
  const { content, scenes } = buildTarget(TARGETS[target], loadPacks(packsDir));
  const out = { content, scenes: Object.fromEntries(scenes.map((sc) => [sc.id, sc.json])) };
  cache.set(target, out);
  return out;
}

/** Compiles the real content packs in memory (no build step needed in tests). */
export function loadContent(target: TargetId = 'dev-full'): Content {
  return built(target).content;
}

/** The target's compiled Ink scenes by id, as its build ships them. */
export function loadScenes(target: TargetId = 'dev-full'): Readonly<Record<string, object>> {
  return built(target).scenes;
}

let daily: Content | undefined;

/** The Daily Shift's content: core + daily packs, as every build ships it. */
export function loadDailyContent(): Content {
  if (daily) return daily;
  const built = buildDaily(loadPacks(packsDir));
  if (!built) throw new Error('No Daily Shift content');
  daily = built;
  return daily;
}
