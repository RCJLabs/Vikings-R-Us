import type { Session } from '../store';

/**
 * The primer's coach (docs/tech-spec.md §11, M3): one short instruction at a
 * time, for the soul at the gate. A step ends when the player has done the
 * thing (looked at the hands, turned the body over, caught the lie) or, for
 * reading steps, pressed Next. The last step of each soul lasts until it is
 * judged. `focus` names what to highlight (see `[data-coach~=…]` in styles.css).
 */
export interface CoachStep {
  readonly id: string;
  readonly text: string;
  readonly focus: string;
  /** A reading step: it ends when the player presses Next. */
  readonly next?: boolean;
  readonly done?: (s: Session) => boolean;
}

const seen = (s: Session, id: string) => s.state.soul.seen.includes(id);

export const PRIMER_STEPS: readonly (readonly CoachStep[])[] = [
  [
    { id: 'c1.look', text: 'primer.c1.look', focus: 'hands', done: (s) => seen(s, 'body.front.grip') },
    { id: 'c1.chest', text: 'primer.c1.chest', focus: 'chest', done: (s) => seen(s, 'body.front.woundsFront') },
    { id: 'c1.rules', text: 'primer.c1.rules', focus: 'rules', next: true },
    { id: 'c1.stamp', text: 'primer.c1.stamp', focus: 'judge' },
  ],
  [
    { id: 'c2.words', text: 'primer.c2.words', focus: 'words', next: true },
    { id: 'c2.flip', text: 'primer.c2.flip', focus: 'flip', done: (s) => s.state.soul.flipped },
    { id: 'c2.back', text: 'primer.c2.back', focus: 'back', done: (s) => seen(s, 'body.back.woundsBack') },
    {
      id: 'c2.compare',
      text: 'primer.c2.compare',
      focus: 'words back',
      done: (s) => s.state.soul.flagged.length > 0,
    },
    { id: 'c2.judge', text: 'primer.c2.judge', focus: 'judge' },
  ],
  [
    { id: 'c3.face', text: 'primer.c3.face', focus: 'face', done: (s) => seen(s, 'cue.breathFog') },
    {
      id: 'c3.feather',
      text: 'primer.c3.feather',
      focus: 'feather',
      done: (s) => s.state.soul.tools.includes('feather'),
    },
    { id: 'c3.stamp', text: 'primer.c3.stamp', focus: 'judge' },
  ],
];

/** The step to show now, or null outside the primer. */
export function coachStep(s: Session, acks: readonly string[]): CoachStep | null {
  if (s.mode.kind !== 'primer' || s.state.phase !== 'shift') return null;
  const steps = PRIMER_STEPS[s.state.cursor] ?? [];
  return steps.find((st) => !(st.next ? acks.includes(st.id) : (st.done?.(s) ?? false))) ?? null;
}
