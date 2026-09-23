/**
 * FNV-1a (32-bit) over the UTF-8 bytes of a string.
 *
 * UTF-8 is encoded by hand instead of with TextEncoder so the engine needs no
 * platform APIs. Lone surrogates hash as U+FFFD, matching TextEncoder.
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a32(input: string): number {
  let h = FNV_OFFSET;
  const eat = (byte: number): void => {
    h ^= byte;
    h = Math.imul(h, FNV_PRIME);
  };
  for (let i = 0; i < input.length; i++) {
    let cp = input.codePointAt(i) as number;
    if (cp > 0xffff) {
      i++; // consumed both halves of a surrogate pair
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) {
      eat(cp);
    } else if (cp < 0x800) {
      eat(0xc0 | (cp >>> 6));
      eat(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      eat(0xe0 | (cp >>> 12));
      eat(0x80 | ((cp >>> 6) & 0x3f));
      eat(0x80 | (cp & 0x3f));
    } else {
      eat(0xf0 | (cp >>> 18));
      eat(0x80 | ((cp >>> 12) & 0x3f));
      eat(0x80 | ((cp >>> 6) & 0x3f));
      eat(0x80 | (cp & 0x3f));
    }
  }
  return h >>> 0;
}

/** Hashes several parts with an unambiguous separator, e.g. (seed, day, index). */
export function hashParts(...parts: readonly (string | number)[]): number {
  return fnv1a32(parts.join('\u001f'));
}
