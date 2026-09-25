import type { Size } from './stage';

/*
 * What the store capture takes (docs/tech-spec.md §37): the stills, in the order a store page would show
 * them, and the clips. moments.ts plays the game to each; finish.ts checks every one is there.
 */

export interface Entry {
  readonly id: string;
  readonly title: string;
  /** What it shows, for the contact sheet. */
  readonly note: string;
  readonly sizes: readonly Size[];
}

export const STILLS: readonly Entry[] = [
  {
    id: 'gate',
    title: 'A soul at the gate',
    note: 'Daily #41, the first soul, every sign looked at: the rules, the body, its words and the ravens.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'caught',
    title: 'A lie caught',
    note: 'The liar of Daily #41: their claim set against the body and marked a lie, with Question beside it.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'answer',
    title: 'Questioned, the soul confesses',
    note: 'The same liar, questioned.',
    sizes: ['steam'],
  },
  {
    id: 'stamped',
    title: 'Stamped for Fólkvangr',
    note: "The first soul, rightly stamped: the ink on the body, Send next. On the phone, the judge's sheet.",
    sizes: ['steam', 'phone'],
  },
  {
    id: 'citation',
    title: 'A citation',
    note: 'The first soul sent to Hel: the rule it broke and the sign that was never looked at.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'dusk',
    title: 'Dusk',
    note: 'The sixth soul with 40 seconds of sun left, the sky gone down with it.',
    sizes: ['steam'],
  },
  {
    id: 'registry',
    title: 'Day 6: the registry of outlaws',
    note: "The day's first soul, an outlaw, looked up in the registry: the entry and its portrait.",
    sizes: ['steam'],
  },
  {
    id: 'loki',
    title: 'Day 12: Loki at the gate',
    note: 'Loki in a dead man’s shape, the stitch scars on the lips giving him away. DETAIN is on the rack.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'morning',
    title: 'A morning scene',
    note: 'Day 3’s morning: the story, and the choice it asks for.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'night',
    title: 'Night: the family’s bills',
    note: 'Night 5: hearth and food, what each bill left unpaid will do, and the nights ahead.',
    sizes: ['steam', 'phone'],
  },
  {
    id: 'ending',
    title: 'An ending',
    note: 'A 20-day run’s ending: the report of the host at Ragnarök.',
    sizes: ['steam'],
  },
];

export const CLIPS: readonly Omit<Entry, 'sizes'>[] = [
  {
    id: 'stamp-send',
    title: 'Stamp and send',
    note: 'Fólkvangr stamped, the soul sent: it walks off the way its stamp sends it, and the next walks up.',
  },
  {
    id: 'catch-lie',
    title: 'Catching a lie',
    note: 'A claim set against the body, the contradiction marked, the soul questioned.',
  },
  {
    id: 'sundown',
    title: 'Sundown',
    note: 'A Daily’s six minutes of sun in four seconds: the sky goes down with it.',
  },
];
