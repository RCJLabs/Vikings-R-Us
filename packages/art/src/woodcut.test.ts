import type { Value } from '@cots/engine';
import { describe, expect, it } from 'vitest';
import type { BodyScene } from './contract';
import { woodcutBody } from './woodcut';

// The woodcut is the chosen art; these pin choices beyond the shared contract.
const scene = (view: BodyScene['view'], grip: Value): BodyScene => ({
  view,
  look: { gender: 'm', name: 'Toki', patronym: 'Ulfsson', age: 30, build: 'broad', beard: 'long' },
  obs: {
    grip,
    gripHand: 'right',
    woundsFront: 0,
    skin: 'normal',
    lips: 'normal',
    hair: 'dark',
    ornament: 'none',
    woundsBack: 0,
  },
  cues: [],
  tools: [],
});

describe('woodcut body art', () => {
  it('shows the held weapon from behind as well as from the front', () => {
    for (const view of ['front', 'back'] as const) {
      expect(woodcutBody.draw(scene(view, 'weapon')), view).not.toBe(woodcutBody.draw(scene(view, 'none')));
    }
  });

  it('keeps the weapon off the back view hotspots: a back-view tap reveals only the back', () => {
    const spots = woodcutBody.hotspots(scene('back', 'weapon'));
    expect(spots.map((s) => s.id)).toEqual(['back']);
  });
});
