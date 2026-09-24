/*
 * Signing a scene off (docs/story-drafts.md): a scene is draft while its
 * source starts with `# draft`, which the game shows as "Draft text" and the
 * compiler counts. Signing off removes that line, and the comment under it
 * that says what kind of draft it is ("// FIRST DRAFT (M7): rewrite or sign
 * off. …"); nothing else in the file changes.
 */

export function signOff(source: string): { readonly source: string; readonly changed: boolean } {
  const lines = source.split('\n');
  const at = lines.findIndex((l) => /^\s*#\s*draft\s*$/.test(l));
  if (at < 0) return { source, changed: false };
  lines.splice(at, 1);
  if (/^\s*\/\/.*\bDRAFT\b.*\bsign off\b/i.test(lines[at] ?? '')) lines.splice(at, 1);
  return { source: lines.join('\n'), changed: true };
}

/** A scene's name as `pnpm story:approve` takes it: `d9.night`, `scene.d9.night` or `d9.night.ink`. */
export const sceneName = (arg: string) => arg.replace(/^scene\./, '').replace(/\.ink$/, '');
