import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SOUND_ROLES, type SoundPack, TARGETS } from '@cots/content-schema';
import { afterAll, describe, expect, it } from 'vitest';
import { compileTarget, loadPacks } from './compile';
import { compileSound, type SoundPackIn, soundModule } from './sound';

const root = mkdtempSync(join(tmpdir(), 'cots-sound-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A pack's assets folder holding the given sound files. */
function assets(pack: string, files: readonly string[]): string {
  const dir = join(root, pack);
  mkdirSync(join(dir, 'sound'), { recursive: true });
  for (const f of files) writeFileSync(join(dir, 'sound', f), 'not really audio');
  return dir;
}

/** A bed for every role, as core has them, so a pack under test needs only what it's testing. */
const roles: SoundPack = { beds: SOUND_ROLES.map((id) => ({ id, about: id, music: id })) };

describe('the sound a target ships', () => {
  it('keeps only the layers and cues whose files are here, Opus first, and lists the rest as missing', () => {
    const core: SoundPackIn = {
      id: 'core',
      sound: {
        beds: [
          ...(roles.beds ?? []).filter((b) => b.id !== 'gate'),
          { id: 'gate', about: 'the gate', music: 'gate', tension: 'gate-tension', ambience: 'gate-wind' },
        ],
        cues: { stamp: ['stamp-1', 'stamp-2'], citation: ['citation'] },
      },
      assetsDir: assets('core-a', ['gate.m4a', 'gate.ogg', 'gate-wind.ogg', 'stamp-2.m4a', 'title.ogg']),
    };
    const s = compileSound([core], new Set());
    expect(Object.keys(s.beds).sort()).toEqual(['gate', 'title']);
    expect(s.beds.gate?.music?.src.map((f) => f.type)).toEqual([
      'audio/ogg; codecs=opus',
      'audio/mp4; codecs="mp4a.40.2"',
    ]);
    expect(s.beds.gate?.music?.loop).toBe(true);
    expect(s.beds.gate?.tension).toBeUndefined();
    expect(s.beds.gate?.ambience?.src).toHaveLength(1);
    expect(s.cues.stamp).toHaveLength(1);
    expect(s.cues.stamp?.[0]?.loop).toBe(false);
    expect(s.cues.citation).toBeUndefined();
    expect(s.named).toBe(6 + 2 + 2 + 1);
    expect(s.missing).toContain('core/gate-tension');
    expect(s.missing).toContain('core/stamp-1');
    expect(s.missing).not.toContain('core/gate');
  });

  it("drops a day's or an ending's bed that has no files, so the place's own plays", () => {
    const core: SoundPackIn = { id: 'core', sound: roles, assetsDir: assets('core-b', ['gate.ogg']) };
    const campaign: SoundPackIn = {
      id: 'campaign',
      sound: {
        beds: [
          { id: 'ragnarok', about: 'Day 20', music: 'ragnarok' },
          { id: 'ending-home', about: 'home', music: { file: 'ending-home', loop: false } },
          { id: 'ending-dark', about: 'dark', music: { file: 'ending-dark', loop: false } },
        ],
        days: [{ day: 20, beds: { gate: 'ragnarok', night: 'ending-home' } }],
        endings: [
          { ending: 'ending.rebirth', bed: 'ending-home' },
          { ending: 'ending.hel', bed: 'ending-dark' },
        ],
      },
      assetsDir: assets('campaign-b', ['ending-home.ogg']),
    };
    const s = compileSound([core, campaign], new Set(['ending.rebirth', 'ending.hel']));
    expect(s.days).toEqual({ 20: { night: 'ending-home' } });
    expect(s.endings).toEqual({ 'ending.rebirth': 'ending-home' });
    expect(s.beds['ending-home']?.music?.loop).toBe(false);
  });

  it('refuses a bed named twice, a bed or ending that does not exist, and a missing place', () => {
    const at = (sound: SoundPack): SoundPackIn => ({ id: 'core', sound, assetsDir: assets('core-c', []) });
    const beds = roles.beds ?? [];
    expect(() => compileSound([at({ beds: [...beds, { id: 'title', about: 'again' }] })], new Set())).toThrow(
      'bed "title" is in both core and core',
    );
    expect(() => compileSound([at({ beds, days: [{ day: 20, beds: { gate: 'ragnarok' } }] })], new Set())).toThrow(
      `Day 20's gate names bed "ragnarok"`,
    );
    expect(() =>
      compileSound([at({ beds, endings: [{ ending: 'ending.nope', bed: 'ending' }] })], new Set(['ending.odin'])),
    ).toThrow(`"ending.nope", which isn't an ending`);
    expect(() => compileSound([at({ beds: beds.filter((b) => b.id !== 'night') })], new Set())).toThrow(
      'no bed "night" for the night screens',
    );
    // Packs with no sound at all ask for none.
    expect(compileSound([{ id: 'core', sound: null, assetsDir: assets('core-e', []) }], new Set()).named).toBe(0);
  });

  it('writes each file as a URL beside the module, for the bundler to copy in', () => {
    const core: SoundPackIn = {
      id: 'core',
      sound: { ...roles, cues: { dusk: ['dusk'] } },
      assetsDir: assets('core-d', ['title.ogg', 'dusk.m4a']),
    };
    const out = join(root, 'generated', 'web-demo');
    const code = soundModule(compileSound([core], new Set()), out, 'web-demo');
    expect(code).toContain(
      `"title": { music: { loop: true, src: [{ url: new URL("../../core-d/sound/title.ogg", import.meta.url).href, type: "audio/ogg; codecs=opus" }] } },`,
    );
    expect(code).toContain(`"dusk": [{ loop: false, src: [{ url: new URL("../../core-d/sound/dusk.m4a"`);
    expect(code).toContain('// 2 of 7 sound files named in sound.yaml are here; the rest are silent.');
  });

  // This builds whole targets (content, scenes, story souls, the Daily check table): seconds on a busy CI runner.
  it("names the campaign's music only in the full game", { timeout: 30_000 }, () => {
    const repo = resolve(import.meta.dirname, '../../..');
    const packs = loadPacks(join(repo, 'content/packs'), join(root, 'no-assets'));
    const beds = (id: 'web-demo' | 'dev-full') => {
      const all = [...TARGETS[id].packs].flatMap((p) => packs.get(p)?.sound?.beds ?? []).map((b) => b.id);
      const r = compileTarget(id, TARGETS[id], packs, join(root, 'generated'));
      return { all, files: r.soundFiles };
    };
    const demo = beds('web-demo');
    const full = beds('dev-full');
    expect(demo.all).not.toContain('ragnarok');
    expect(full.all).toContain('ragnarok');
    expect(demo.files).toEqual({ named: 26, present: 0 });
    expect(full.files).toEqual({ named: 32, present: 0 });
  });
});
