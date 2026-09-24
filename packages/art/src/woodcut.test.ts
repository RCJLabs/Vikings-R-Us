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
  });

  it('leans the weapon out from the fist, away from the body, the same from either side', () => {
    // The right hand is on the viewer's left from the front and on the right from behind.
    expect(woodcutBody.draw(scene('front', 'weapon'))).toMatch(/rotate\(-14 /);
    expect(woodcutBody.draw(scene('back', 'weapon'))).toMatch(/rotate\(14 /);
  });

  it('keeps the rune-lens beside the leaning blade and inside the frame, for every build, hand and weapon', () => {
    for (const build of ['lean', 'broad', 'heavy'] as const) {
      for (const gripHand of ['right', 'left'] as const) {
        for (const weapon of ['axe', 'sword', 'spear', 'seax']) {
          const s = scene('front', 'weapon');
          const svg = woodcutBody.draw({
            ...s,
            look: { ...s.look, build },
            obs: { ...s.obs, gripHand, inscription: 'own', makersMark: 'markTrue' },
            tools: ['runeLens'],
            weapon,
          });
          const lens = /<circle cx="([\d.]+)" cy="([\d.]+)" r="24"/.exec(svg);
          const where = `${build} ${gripHand} ${weapon}`;
          expect(lens, where).not.toBeNull();
          const [cx, cy] = [Number(lens?.[1]), Number(lens?.[2])];
          expect(cx - 24, where).toBeGreaterThan(11);
          expect(cx + 24, where).toBeLessThan(289);
          expect(cy - 24, where).toBeGreaterThan(11);
        }
      }
    }
  });

  it('keeps the weapon off the back view hotspots: a back-view tap reveals only the back', () => {
    const spots = woodcutBody.hotspots(scene('back', 'weapon'));
    expect(spots.map((s) => s.id)).toEqual(['back']);
  });
});
