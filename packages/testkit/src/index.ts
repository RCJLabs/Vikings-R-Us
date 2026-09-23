import fc from 'fast-check';

export { fc };

/** A short non-empty seed string, the shape the engine's RNG takes. */
export const arbSeed = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 16 });
