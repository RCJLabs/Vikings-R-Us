import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { fnv1a32, hashParts } from './hash';

/** Straightforward FNV-1a over Node's own UTF-8 encoding. */
function reference(input: string): number {
  let h = 0x811c9dc5;
  for (const byte of Buffer.from(input, 'utf8')) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('fnv1a32', () => {
  it('matches the published FNV-1a test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('hashes Old Norse and astral characters as UTF-8', () => {
    for (const s of ['Þórr', 'ǫ ø ð þ', 'ᚠᚢᚦᚬᚱᚴ', '𐌰𐌱 emoji 🪶']) expect(fnv1a32(s)).toBe(reference(s));
  });

  test.prop([fc.string({ unit: 'binary' })])('matches a Buffer-based reference for any string', (s) => {
    expect(fnv1a32(s)).toBe(reference(s));
  });
});

describe('hashParts', () => {
  it('separates parts so ("ab","c") differs from ("a","bc")', () => {
    expect(hashParts('ab', 'c')).not.toBe(hashParts('a', 'bc'));
    expect(hashParts('seed', 3, 7)).toBe(hashParts('seed', '3', '7'));
  });
});
