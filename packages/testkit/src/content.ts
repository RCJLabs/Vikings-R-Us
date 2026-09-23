import { resolve } from 'node:path';
import { buildTarget, loadPacks } from '@cots/content-compiler';
import { TARGETS, type TargetId } from '@cots/content-schema';
import type { Content } from '@cots/engine';

const packsDir = resolve(import.meta.dirname, '../../../content/packs');
const cache = new Map<TargetId, Content>();

/** Compiles the real content packs in memory (no build step needed in tests). */
export function loadContent(target: TargetId = 'dev-full'): Content {
  const hit = cache.get(target);
  if (hit) return hit;
  const { content } = buildTarget(TARGETS[target], loadPacks(packsDir));
  cache.set(target, content);
  return content;
}
