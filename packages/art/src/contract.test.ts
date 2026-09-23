import type { Look, ObservationDef, ToolId, Value } from '@cots/engine';
import { loadContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import type { BodyArtProvider, BodyScene } from './contract';
import { pixelBody } from './pixel';
import { placeholderBody } from './placeholder';
import { woodcutBody } from './woodcut';

// The body-art contract (docs/tech-spec.md §6.5). Every provider must pass these.
const providers: BodyArtProvider[] = [placeholderBody, woodcutBody, pixelBody];
const content = loadContent('dev-full');
// Body signs only: readings from a document (the registry) are drawn elsewhere.
const bodyObservations = content.observations.filter((o) => o.doc === undefined);
const toolOf = (key: string): ToolId[] => {
  const tool = content.observations.find((o) => o.key === key)?.tool;
  return tool ? [tool] : [];
};

const look = (over: Partial<Look> = {}): Look => ({
  gender: 'm',
  name: 'Toki',
  patronym: 'Ulfsson',
  age: 30,
  build: 'broad',
  beard: 'long',
  ...over,
});

const BASE: Record<string, Value> = {
  grip: 'weapon',
  gripHand: 'right',
  woundsFront: 1,
  skin: 'normal',
  lips: 'normal',
  hair: 'dark',
  ornament: 'none',
  woundsBack: 0,
  breath: 'still',
};

function valuesOf(o: ObservationDef): Value[] {
  if ('map' in o.from) return [...new Set([...o.from.map.map((m) => m.value), o.from.otherwise])];
  const fact = content.facts.find((f) => f.id === (o.from as { fact: string }).fact);
  if (!fact) throw new Error(`no fact for ${o.key}`);
  const d = fact.domain;
  if (d.kind === 'enum') return [...d.values];
  if (d.kind === 'bool') return [false, true];
  return Array.from({ length: d.max - d.min + 1 }, (_, i) => d.min + i);
}

describe.each(providers.map((p) => [p.id, p] as const))('body art provider %s', (_, art) => {
  const scene = (key: string, value: Value, over: Partial<BodyScene> = {}): BodyScene => ({
    view: art.views[key] ?? 'front',
    look: look(),
    obs: { ...BASE, [key]: value },
    cues: [],
    // A tool's reading is drawn once the tool is used (the feather at the lips, the rune-lens on the blade).
    tools: toolOf(key),
    ...over,
  });

  it('draws every value of every sign differently', () => {
    for (const o of bodyObservations) {
      const drawn = valuesOf(o).map((v) => art.draw(scene(o.key, v)));
      expect(new Set(drawn).size, `${o.key}: ${valuesOf(o).join(', ')}`).toBe(drawn.length);
    }
    for (const c of content.cues) {
      const on = art.draw({ ...scene('hair', 'dark'), view: art.views[c.key] ?? 'front', cues: [c.key] });
      const off = art.draw({ ...scene('hair', 'dark'), view: art.views[c.key] ?? 'front' });
      expect(on, c.key).not.toBe(off);
    }
  });

  it('draws each sign on its view, as visibly as gameplay requires, under a hotspot', () => {
    const signs = [
      ...bodyObservations.map((o) => ({ key: o.key, view: o.view, salience: o.salience })),
      ...content.cues.map((c) => ({ key: c.key, view: c.view, salience: c.salience })),
    ];
    for (const s of signs) {
      expect(art.views[s.key], s.key).toBe(s.view);
      expect(art.conformance[s.key] ?? 0, s.key).toBeGreaterThanOrEqual(s.salience);
      for (const build of ['lean', 'broad', 'heavy'] as const) {
        const spots = art.hotspots({ ...scene(s.key, BASE[s.key] ?? 0), look: look({ build }) });
        expect(
          spots.some((h) => h.keys.includes(s.key)),
          `${s.key} (${build})`,
        ).toBe(true);
      }
    }
  });

  it('keeps hotspots inside the frame and apart from each other', () => {
    for (const view of ['front', 'back'] as const) {
      for (const build of ['lean', 'broad', 'heavy'] as const) {
        const spots = art.hotspots({ ...scene('hair', 'dark'), view, look: look({ build }) });
        for (const h of spots) {
          expect(h.x >= 0 && h.y >= 0 && h.x + h.w <= art.frame.w && h.y + h.h <= art.frame.h, h.id).toBe(true);
          // At least 12% of the frame's width each way, so a region is a comfortable tap on a phone.
          expect(Math.min(h.w, h.h) / art.frame.w, h.id).toBeGreaterThanOrEqual(0.12);
        }
        for (const a of spots) {
          for (const b of spots) {
            if (a === b) continue;
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${view} ${build}: ${a.id} overlaps ${b.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('draws every look without holes', () => {
    for (const gender of ['m', 'f'] as const) {
      for (const build of ['lean', 'broad', 'heavy'] as const) {
        for (const beard of ['none', 'short', 'long', 'braided'] as const) {
          for (const view of ['front', 'back'] as const) {
            const svg = art.draw({ ...scene('hair', 'red'), view, look: look({ gender, build, beard, age: 70 }) });
            expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
            expect(svg).not.toMatch(/undefined|NaN|null/);
          }
        }
      }
    }
  });

  it('draws registry portraits that set one face apart from another', () => {
    const face = (hair: string, beard: 'none' | 'long') => art.portrait({ gender: 'm', hair, beard, build: 'broad' });
    const faces = ['dark', 'fair', 'red', 'grey'].flatMap((hair) => [face(hair, 'none'), face(hair, 'long')]);
    expect(new Set(faces).size).toBe(faces.length);
    for (const svg of faces) expect(svg).toMatch(/^<svg [^>]*viewBox="[\d. ]+"/);
    const woman = art.portrait({ gender: 'f', hair: 'red', beard: 'none', build: 'lean' });
    expect(woman).not.toMatch(/undefined|NaN|null/);
  });
});
