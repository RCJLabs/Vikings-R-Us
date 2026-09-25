import type { ShiftEvent } from '@cots/engine';
import { afterEach, describe, expect, it } from 'vitest';
// The content's list of cues (sound.yaml names files for them), from the package that checks sound.yaml.
import { SOUND_CUES } from '../../content-schema/src/sound-names';
import { play, SOUNDS, setVolume, soundFor, unlockAudio } from './audio';

describe('placeholder sound', () => {
  it('gives the shift events their sounds, and leaves the rest silent', () => {
    const e = (x: object) => x as ShiftEvent;
    expect(soundFor(e({ e: 'stamped', dest: 'HEL' }))).toBe('stamp');
    expect(soundFor(e({ e: 'toolUsed', tool: 'feather', fields: [], penaltyMs: 0 }))).toBe('feather');
    expect(soundFor(e({ e: 'toolUsed', tool: 'flip', fields: [], penaltyMs: 0 }))).toBe('tool');
    expect(soundFor(e({ e: 'contradiction', lie: 'a', fact: 'b', with: 'c' }))).toBe('found');
    expect(soundFor(e({ e: 'noConflict', a: 'a', b: 'b', penaltyMs: 0 }))).toBe('miss');
    expect(soundFor(e({ e: 'dusk' }))).toBe('dusk');
    expect(soundFor(e({ e: 'begun' }))).toBeNull();
    expect(soundFor(e({ e: 'rejected', reason: 'x' }))).toBeNull();
  });

  it('has the cues that sound.yaml can name files for', () => {
    expect([...SOUNDS]).toEqual([...SOUND_CUES]);
  });

  it('stays silent, without errors, where there is no audio', () => {
    setVolume(1);
    expect(() => {
      unlockAudio();
      play('stamp');
    }).not.toThrow();
  });

  describe('with an audio context', () => {
    const g = globalThis as { AudioContext?: unknown };
    let made = 0;
    afterEach(() => {
      delete g.AudioContext;
    });

    it('makes none at volume 0', () => {
      made = 0;
      g.AudioContext = class {
        constructor() {
          made += 1;
        }
      };
      setVolume(0);
      unlockAudio();
      play('dusk');
      expect(made).toBe(0);
    });
  });
});
