/*
 * Where papers lie on the desk layout (docs/tech-spec.md §33): fractions of the desk, a place in the pile.
 * Pure, so a test can check the spots stay on the desk and the pile stays in order; shift/desk.ts moves them.
 */

export type PaperId = 'rules' | 'words' | 'ravens' | 'registry' | 'tally';

/** Where a loose paper lies: its top-left corner and width as fractions of the desk, and its place in the pile. */
export interface PaperSpot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly z: number;
}

export type DeskPapers = Readonly<Partial<Record<PaperId, PaperSpot>>>;

/**
 * A spot kept on the desk: a sensible width, the whole paper across, and its title (`grip`, a fraction of
 * the desk's height) never below the bottom edge, so it can always be picked up again.
 */
export function clampSpot(s: PaperSpot, grip = 0.08): PaperSpot {
  const w = Math.min(Math.max(s.w, 0.15), 0.6);
  return { x: Math.min(Math.max(s.x, 0), 1 - w), y: Math.min(Math.max(s.y, 0), 1 - grip), w, z: s.z };
}

/** The next paper picked up goes on top of the pile. */
export function topZ(papers: DeskPapers): number {
  return Math.max(0, ...Object.values(papers).map((p) => p?.z ?? 0)) + 1;
}

/**
 * Puts a paper down where it is (or back in its place, with `null`). The pile is renumbered 1, 2, 3… in
 * its order, so the numbers stay small however often papers move.
 */
export function putDown(papers: DeskPapers, id: PaperId, spot: PaperSpot | null): DeskPapers {
  const next: Partial<Record<PaperId, PaperSpot>> = { ...papers };
  if (spot) next[id] = spot;
  else delete next[id];
  const pile = (Object.entries(next) as [PaperId, PaperSpot][]).sort(([, a], [, b]) => a.z - b.z);
  return Object.fromEntries(pile.map(([k, v], i) => [k, { ...v, z: i + 1 }]));
}
