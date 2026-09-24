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

  it('turns the weapon hand round from behind: the back of the fist, the weapon behind the arm', () => {
    const front = woodcutBody.draw(scene('front', 'weapon'));
    const back = woodcutBody.draw(scene('back', 'weapon'));
    // The front's thumb lies over the index finger; from behind, the fingers and thumb are out of sight.
    const thumb = 'M10 -2.5Q5 -10.5 -4.5 -8';
    expect(front).toContain(thumb);
    expect(back).not.toContain(thumb);
    // From the front the weapon is drawn over the sleeves; from behind, before them (and leaning out).
    const sleeve = back.indexOf('stroke-width="30"');
    const blade = (svg: string) => svg.indexOf('fill="#a3aaae"');
    expect(sleeve).toBeGreaterThan(0);
    expect(blade(back)).toBeGreaterThan(0);
    expect(blade(back)).toBeLessThan(sleeve);
    expect(blade(front)).toBeGreaterThan(front.indexOf('stroke-width="30"'));
    expect(back).toMatch(/rotate\(14 /);
  });

  it('keeps the weapon off the back view hotspots: a back-view tap reveals only the back', () => {
    const spots = woodcutBody.hotspots(scene('back', 'weapon'));
    expect(spots.map((s) => s.id)).toEqual(['back']);
  });
});
