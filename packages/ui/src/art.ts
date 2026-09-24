import { ART_STYLES, type ArtStyle, type BodyArtProvider, placeholderBody } from '@cots/art';
import { woodcutBody } from '@cots/art/woodcut';
import { signal } from '@preact/signals';
import { useLayoutEffect, useState } from 'preact/hooks';
import { mirror, readMirror } from './store';

/**
 * The body art in use (docs/tech-spec.md §6.5). The woodcut, the chosen art
 * direction, is the default and ships in the main bundle, so the first soul
 * never waits for it. The placeholder and the pixel candidate stay for
 * comparison: choose one with `?art=placeholder` or `?art=pixel` (remembered
 * on this device) or in the Body Lab; `?art=woodcut` goes back. Art never
 * changes what a soul is or how it's judged.
 */
export const DEFAULT_ART: ArtStyle = 'woodcut';
export const art = signal<BodyArtProvider>(woodcutBody);
export const artStyle = signal<ArtStyle>(DEFAULT_ART);

const KEY = 'cots.art';

const LOADERS: Readonly<Record<ArtStyle, () => Promise<BodyArtProvider>>> = {
  placeholder: async () => placeholderBody,
  woodcut: async () => woodcutBody,
  pixel: () => import('@cots/art/pixel').then((m) => m.pixelBody),
};

export const isArtStyle = (x: unknown): x is ArtStyle =>
  typeof x === 'string' && (ART_STYLES as readonly string[]).includes(x);

export const loadArt = (style: ArtStyle): Promise<BodyArtProvider> => LOADERS[style]();

export async function setArtStyle(style: ArtStyle): Promise<void> {
  artStyle.value = style;
  mirror(KEY, style === DEFAULT_ART ? null : style);
  const provider = await loadArt(style);
  if (artStyle.value === style) art.value = provider;
}

/** Applies `?art=` if present, else the style this device last used. */
export function initArt(): void {
  let asked: string | null = null;
  try {
    asked = new URLSearchParams(window.location.search).get('art');
  } catch {
    asked = null;
  }
  const style = isArtStyle(asked) ? asked : readMirror<string>(KEY);
  if (isArtStyle(style) && style !== artStyle.value) void setArtStyle(style);
  else if (isArtStyle(asked)) mirror(KEY, asked === DEFAULT_ART ? null : asked);
}

/**
 * For art drawn on a pixel grid: the largest size, in CSS pixels, at which
 * each art pixel covers a whole number of device pixels and the frame still
 * fits the stage. Smooth art gets `undefined` and sizes itself in CSS.
 */
export function usePixelFrame(
  stage: { readonly current: HTMLElement | null },
  frame: BodyArtProvider['frame'],
): { width: string; height: string } | undefined {
  const [size, setSize] = useState<{ width: string; height: string } | undefined>(undefined);
  useLayoutEffect(() => {
    const el = stage.current;
    const grid = frame.grid;
    if (!grid || !el) {
      setSize(undefined);
      return;
    }
    const cols = frame.w / grid;
    const rows = frame.h / grid;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const box = el.getBoundingClientRect();
      const k = Math.floor(Math.min((box.width * dpr) / cols, (box.height * dpr) / rows));
      setSize(k >= 1 ? { width: `${(k * cols) / dpr}px`, height: `${(k * rows) / dpr}px` } : undefined);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stage, frame]);
  return size;
}
