/**
 * The build-target matrix (docs/build-plan.md §3). Plain data with no
 * dependencies, so the Vite config can import it directly.
 */
export const PACK_IDS = ['core', 'daily', 'demo', 'campaign'] as const;
export type PackId = (typeof PACK_IDS)[number];

/**
 * Which packs each pack may depend on. Enforced by the content compiler, so a
 * demo pack can never pull in campaign content by editing its own manifest.
 */
export const ALLOWED_PACK_DEPS: Readonly<Record<PackId, readonly PackId[]>> = {
  core: [],
  daily: ['core'],
  demo: ['core'],
  campaign: ['core', 'demo'],
};

export type PlatformKind = 'web' | 'itch' | 'electron' | 'android';

export interface TargetDef {
  /** `demo` builds must not contain campaign content; `full` builds must. */
  edition: 'demo' | 'full';
  packs: readonly PackId[];
  platform: PlatformKind;
  pwa: boolean;
  /** `pages` = GitHub Pages path, `relative` = './', `root` = '/'. */
  base: 'pages' | 'relative' | 'root';
  /** Includes the Case Lab debug tools. */
  lab: boolean;
}

const DEMO_PACKS = ['core', 'daily', 'demo'] as const satisfies readonly PackId[];
const ALL_PACKS = PACK_IDS;

export const TARGETS = {
  'web-demo': { edition: 'demo', packs: DEMO_PACKS, platform: 'web', pwa: true, base: 'pages', lab: false },
  'web-itch': { edition: 'demo', packs: DEMO_PACKS, platform: 'itch', pwa: false, base: 'relative', lab: false },
  'electron-demo': {
    edition: 'demo',
    packs: DEMO_PACKS,
    platform: 'electron',
    pwa: false,
    base: 'relative',
    lab: false,
  },
  'electron-full': {
    edition: 'full',
    packs: ALL_PACKS,
    platform: 'electron',
    pwa: false,
    base: 'relative',
    lab: false,
  },
  'android-full': {
    edition: 'full',
    packs: ALL_PACKS,
    platform: 'android',
    pwa: false,
    base: 'relative',
    lab: false,
  },
  'dev-full': { edition: 'full', packs: ALL_PACKS, platform: 'web', pwa: false, base: 'root', lab: true },
} as const satisfies Record<string, TargetDef>;

export type TargetId = keyof typeof TARGETS;
export const TARGET_IDS = Object.keys(TARGETS) as TargetId[];

export function isTargetId(value: string): value is TargetId {
  return Object.hasOwn(TARGETS, value);
}

/** Default GitHub Pages path for this repo; override with COTS_BASE (e.g. for a custom domain). */
export const PAGES_BASE = '/Vikings-R-Us/';
