/**
 * Body art (docs/tech-spec.md §6.5): the provider contract, the shared figure
 * layout, the placeholder provider and the title sigil. The candidate art
 * directions are separate entry points (`@cots/art/woodcut`,
 * `@cots/art/pixel`) so builds load them only when chosen.
 */
export * from './contract';
export * from './layout';
export { placeholderBody } from './placeholder';

/** The art styles a build can switch between; the first is the default. */
export const ART_STYLES = ['placeholder', 'woodcut', 'pixel'] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

/** Stamp ring and quill. Deliberately avoids runes and symbols that extremists have appropriated. */
export function placeholderSigil(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-hidden="true">',
    '<circle cx="256" cy="256" r="178" fill="none" stroke="#c8a96a" stroke-width="18"/>',
    '<circle cx="256" cy="256" r="150" fill="none" stroke="#c8a96a" stroke-width="4" stroke-dasharray="6 10"/>',
    '<g transform="rotate(-38 256 256)">',
    '<path d="M256 104C306 150 318 238 300 318C290 362 272 392 256 408C240 392 222 362 212 318C194 238 206 150 256 104Z" fill="#efe6d2"/>',
    '<path d="M256 128V430" stroke="#15110d" stroke-width="6" stroke-linecap="round"/>',
    '<path d="M256 200L292 176M256 250L298 226M256 300L292 280M256 200L220 176M256 250L214 226M256 300L220 280" stroke="#15110d" stroke-width="4" stroke-linecap="round"/>',
    '</g>',
    '</svg>',
  ].join('');
}
