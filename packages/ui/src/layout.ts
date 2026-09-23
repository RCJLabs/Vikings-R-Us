import { signal } from '@preact/signals';

export type LayoutMode = 'desk' | 'drawer';

/** Desk for desktop, Steam Deck and landscape tablets; drawer for phones (docs/build-plan.md §7). */
export function layoutFor(width: number, height: number): LayoutMode {
  return Math.min(width, height) >= 600 && width / height >= 1.2 ? 'desk' : 'drawer';
}

export const layoutMode = signal<LayoutMode>(layoutFor(window.innerWidth, window.innerHeight));

window.addEventListener('resize', () => {
  layoutMode.value = layoutFor(window.innerWidth, window.innerHeight);
});
