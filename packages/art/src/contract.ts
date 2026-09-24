import type { Look, Salience, ToolId, Value } from '@cots/engine';

/**
 * The body-art contract (docs/tech-spec.md §6.5). The engine owns what the
 * signs are and how visible they must be; a provider owns drawing them, the
 * hotspot shapes and a conformance table. Swapping providers never changes
 * generation, judgments or Dailies.
 */

export type BodyView = 'front' | 'back';
export type HotspotId = 'hair' | 'face' | 'neck' | 'chest' | 'handR' | 'handL' | 'back';

export interface BodyScene {
  readonly view: BodyView;
  readonly look: Look;
  /** Observation key -> value for every sign the body carries (the art draws the current view's). */
  readonly obs: Readonly<Record<string, Value>>;
  /** Cue keys showing on the body (e.g. breathFog). */
  readonly cues: readonly string[];
  /** Tools used on this soul; their readings are drawn (the feather at the lips). */
  readonly tools: readonly ToolId[];
  /**
   * The weapon the soul's own words name (sword, spear, ...), drawn when it
   * holds one so the picture never contradicts what it says. Cosmetic.
   */
  readonly weapon?: string;
}

export interface Hotspot {
  readonly id: HotspotId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Observation and cue keys this region shows. */
  readonly keys: readonly string[];
}

/** What a registry portrait shows: a face to compare with the body. */
export interface Portrait {
  readonly gender: Look['gender'];
  readonly hair: string;
  readonly beard: Look['beard'];
  readonly build: Look['build'];
}

export interface BodyArtProvider {
  readonly id: string;
  /**
   * The drawing's size in frame units (hotspots use the same units). `grid`
   * is one art pixel in frame units, for art that must be scaled in whole
   * device pixels (pixel art); smooth art leaves it out.
   */
  readonly frame: { readonly w: number; readonly h: number; readonly grid?: number };
  hotspots(scene: BodyScene): Hotspot[];
  /** The body as an SVG document. */
  draw(scene: BodyScene): string;
  /** A head-and-shoulders registry portrait as an SVG document, in the same style. */
  portrait(p: Portrait): string;
  /** How visible each drawn sign is, by observation or cue key. Must meet the gameplay salience. */
  readonly conformance: Readonly<Record<string, Salience>>;
  /** The view each key is drawn on. */
  readonly views: Readonly<Record<string, BodyView>>;
}
