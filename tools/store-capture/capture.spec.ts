import { test } from '@playwright/test';
import { CLIPS, STILLS } from './catalog';
import { CLIP_PLAYS, STILL_PLAYS } from './moments';
import { Clip, type Size, shot } from './stage';

/*
 * The store capture (docs/tech-spec.md §37): each still and clip in catalog.ts, played to and shot. Run with
 * `pnpm store:capture`; finish.ts then checks the files and makes the GIFs, videos and contact sheet.
 */

test.describe('stills', () => {
  // At rest: the game stills its own motion when the device asks it to.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  for (const m of STILLS) {
    test(m.id, async ({ page }, info) => {
      const size = info.project.name as Size;
      test.skip(!m.sizes.includes(size), `no ${size} shot of this one`);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const play = STILL_PLAYS[m.id];
      if (!play) throw new Error(`No way to play to ${m.id}`);
      await play(page, size);
      if (errors.length > 0) throw new Error(`The page failed: ${errors.join('; ')}`);
      await shot(page, m.id, size);
    });
  }
});

test.describe('clips', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  for (const c of CLIPS) {
    test(c.id, async ({ page }, info) => {
      test.skip(info.project.name !== 'steam', 'clips are shot at Steam size');
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const play = CLIP_PLAYS[c.id];
      if (!play) throw new Error(`No way to play ${c.id}`);
      const clip = new Clip(page, c.id);
      await play(page, clip);
      if (errors.length > 0) throw new Error(`The page failed: ${errors.join('; ')}`);
      clip.done();
    });
  }
});
