import type { Look, Salience, ToolId, Value } from '@cots/engine';

/**
 * The placeholder body-art provider (docs/tech-spec.md §6.5): procedural SVG
 * drawn from a soul's look and its body signs. The engine owns what the signs
 * are and how visible they must be; art owns drawing them, the hotspot shapes
 * and a conformance table. Every sign is shape-coded, never colour alone:
 * fever is stipple, sea-foam is bubbles, wounds are slashes, pendants have
 * different silhouettes and each hair colour has its own texture.
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

export interface BodyArtProvider {
  readonly id: string;
  readonly frame: { readonly w: number; readonly h: number };
  hotspots(scene: BodyScene): Hotspot[];
  draw(scene: BodyScene): string;
  /** How visible each drawn sign is, by observation or cue key. Must meet the gameplay salience. */
  readonly conformance: Readonly<Record<string, Salience>>;
  /** The view each key is drawn on. */
  readonly views: Readonly<Record<string, BodyView>>;
}

const W = 300;
const H = 420;
const CX = 150;

const INK = '#2a211a';
const SKIN = '#d9cdbb';
const TUNIC = '#5d4b3a';
const TROUSERS = '#3e342b';
const WOUND = '#7a1f1a';

const HAIR: Readonly<Record<string, { fill: string; texture: string }>> = {
  dark: { fill: '#2e241c', texture: '' },
  fair: {
    fill: '#d8c07a',
    texture: '<path d="M2 0V10M6 0V10" stroke="#8a7440" stroke-width="1"/>',
  },
  red: {
    fill: '#a4432a',
    texture: '<path d="M1 7Q4 1 7 7" fill="none" stroke="#5a1d10" stroke-width="1.2"/>',
  },
  grey: {
    fill: '#a8a8a8',
    texture: '<path d="M1 2H5M4 7H9" stroke="#5f5f5f" stroke-width="1.2"/>',
  },
};

const half = (look: Look): number => (look.build === 'lean' ? 46 : look.build === 'broad' ? 58 : 64);

/** Where each hand is on screen. The body faces us, so its right hand is on our left (and swaps when flipped). */
function hands(look: Look, view: BodyView): { R: number; L: number; y: number } {
  const off = half(look) + 26;
  return view === 'front' ? { R: CX - off, L: CX + off, y: 300 } : { R: CX + off, L: CX - off, y: 300 };
}

function hairPath(look: Look, view: BodyView): string {
  if (view === 'back') return 'M104 98C104 44 196 44 196 98C196 124 184 140 150 142C116 140 104 124 104 98Z';
  const cap = 'M106 96C104 48 196 48 194 96C184 76 116 76 106 96Z';
  return look.gender === 'f'
    ? `${cap}M106 92C98 120 100 150 110 172L118 170C112 146 112 118 114 94Z M194 92C202 120 200 150 190 172L182 170C188 146 188 118 186 94Z`
    : cap;
}

function slash(x: number, y: number): string {
  return [
    `<path d="M${x - 14} ${y - 8}L${x + 14} ${y + 8}" stroke="${WOUND}" stroke-width="5" stroke-linecap="round"/>`,
    ...[-7, 0, 7].map(
      (d) =>
        `<path d="M${x + d - 3} ${y + d / 2 + 5}L${x + d + 3} ${y + d / 2 - 5}" stroke="${WOUND}" stroke-width="2" stroke-linecap="round"/>`,
    ),
  ].join('');
}

const FRONT_WOUNDS: readonly (readonly [number, number])[] = [
  [CX - 22, 216],
  [CX + 18, 238],
  [CX - 8, 262],
];
const BACK_WOUNDS: readonly (readonly [number, number])[] = [
  [CX - 20, 208],
  [CX + 20, 232],
  [CX, 258],
];

function axe(x: number, y: number, outward: 1 | -1): string {
  const top = y - 76;
  const b = (dx: number) => x + dx * outward;
  return [
    `<path d="M${x} ${top}V${y + 26}" stroke="#6b4a2b" stroke-width="6" stroke-linecap="round"/>`,
    `<path d="M${x} ${top + 4}L${b(28)} ${top - 8}Q${b(36)} ${top + 16} ${b(26)} ${top + 34}L${x} ${top + 24}Z" fill="#9aa3a8" stroke="#2a2f33" stroke-width="2"/>`,
  ].join('');
}

function hand(x: number, y: number, open: boolean): string {
  const fingers = open
    ? [-8, 0, 8]
        .map(
          (d) =>
            `<path d="M${x + d} ${y + 8}L${x + d * 1.4} ${y + 20}" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
        )
        .join('')
    : '';
  return `<circle cx="${x}" cy="${y}" r="13" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>${fingers}`;
}

function figure(scene: BodyScene): string {
  const { look, view } = scene;
  const h = half(look);
  const hp = hands(look, view);
  const parts: string[] = [];
  // Legs and feet.
  parts.push(
    `<rect x="${CX - h + 10}" y="300" width="${h - 14}" height="104" rx="6" fill="${TROUSERS}"/>`,
    `<rect x="${CX + 4}" y="300" width="${h - 14}" height="104" rx="6" fill="${TROUSERS}"/>`,
    `<ellipse cx="${CX - h / 2}" cy="408" rx="${h / 2}" ry="8" fill="${INK}"/>`,
    `<ellipse cx="${CX + h / 2}" cy="408" rx="${h / 2}" ry="8" fill="${INK}"/>`,
  );
  // Arms, torso, belt.
  parts.push(
    `<path d="M${CX - h + 4} 170L${Math.min(hp.R, hp.L)} ${hp.y - 12}" stroke="${TUNIC}" stroke-width="22" stroke-linecap="round"/>`,
    `<path d="M${CX + h - 4} 170L${Math.max(hp.R, hp.L)} ${hp.y - 12}" stroke="${TUNIC}" stroke-width="22" stroke-linecap="round"/>`,
    `<path d="M${CX - h} 172Q${CX - h} 156 ${CX - h + 16} 156H${CX + h - 16}Q${CX + h} 156 ${CX + h} 172L${CX + h - 6} 306H${CX - h + 6}Z" fill="${TUNIC}" stroke="${INK}" stroke-width="2"/>`,
    `<rect x="${CX - h + 5}" y="276" width="${2 * h - 10}" height="10" fill="#3a2c20"/>`,
  );
  if (view === 'back')
    parts.push(`<path d="M${CX} 162V272" stroke="#4a3b2d" stroke-width="3" stroke-dasharray="6 6"/>`);
  // Neck and head.
  parts.push(
    `<rect x="136" y="132" width="28" height="30" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>`,
    `<circle cx="${CX}" cy="96" r="44" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>`,
  );
  // Hands (the weapon is drawn under the fist, front view only).
  const grip = scene.obs.grip;
  const weaponHand = grip === 'weapon' ? (scene.obs.gripHand === 'left' ? 'L' : 'R') : null;
  if (view === 'front' && weaponHand) {
    const x = weaponHand === 'L' ? hp.L : hp.R;
    parts.push(axe(x, hp.y, x < CX ? -1 : 1));
  }
  for (const side of ['R', 'L'] as const) {
    const x = side === 'L' ? hp.L : hp.R;
    const open = view === 'front' && grip === 'none';
    parts.push(hand(x, hp.y, open));
    parts.push(
      `<text x="${x}" y="${hp.y + 42}" font-size="13" font-family="sans-serif" text-anchor="middle" fill="#8f7e63">${side}</text>`,
    );
  }
  return parts.join('');
}

function hair(scene: BodyScene): string {
  const value = String(scene.obs.hair ?? 'dark');
  const style = HAIR[value] ?? HAIR.dark;
  if (!style) return '';
  const d = hairPath(scene.look, scene.view);
  const texture = style.texture ? `<path d="${d}" fill="url(#cots-hair-${value})"/>` : '';
  return `<path d="${d}" fill="${style.fill}" stroke="${INK}" stroke-width="2"/>${texture}`;
}

function face(scene: BodyScene): string {
  const { look, obs } = scene;
  const parts: string[] = [
    // Closed eyes and a nose: the dead, resting.
    `<path d="M124 96Q132 101 140 96M160 96Q168 101 176 96" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
    `<path d="M150 100L145 114H153" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  ];
  if (look.age >= 60) {
    parts.push(
      `<path d="M132 70Q150 66 168 70M136 78Q150 75 164 78" fill="none" stroke="#9c8d78" stroke-width="1.5"/>`,
    );
  }
  if (obs.skin === 'feverFlush') {
    const dots = (x: number) =>
      [
        [0, 0],
        [6, 0],
        [-6, 0],
        [3, 5],
        [-3, 5],
        [3, -5],
        [-3, -5],
      ]
        .map(([dx = 0, dy = 0]) => `<circle cx="${x + dx}" cy="${112 + dy}" r="1.8" fill="#9e2a20"/>`)
        .join('');
    parts.push(
      `<ellipse cx="124" cy="112" rx="13" ry="9" fill="#e07a6a" opacity="0.45"/>`,
      `<ellipse cx="176" cy="112" rx="13" ry="9" fill="#e07a6a" opacity="0.45"/>`,
      dots(124),
      dots(176),
    );
  }
  if (look.beard !== 'none') {
    const beard = HAIR[String(obs.hair ?? 'dark')]?.fill ?? '#2e241c';
    const d =
      look.beard === 'short'
        ? 'M120 128Q150 158 180 128Q176 146 150 150Q124 146 120 128Z'
        : 'M122 128Q150 150 178 128Q174 150 162 164L150 170L138 164Q126 150 122 128Z';
    parts.push(`<path d="${d}" fill="${beard}" stroke="${INK}" stroke-width="1.5"/>`);
    if (look.beard === 'braided') {
      parts.push(`<path d="M143 156H157M144 162H156" stroke="#c8a96a" stroke-width="2.5"/>`);
    }
  }
  // Lips: a plain line, or sea-foam bubbles.
  parts.push(
    `<path d="M140 124Q150 128 160 124" fill="none" stroke="#7d5a4c" stroke-width="2.5" stroke-linecap="round"/>`,
  );
  if (obs.lips === 'seaFoam') {
    for (const [x, y, r] of [
      [140, 126, 3.5],
      [147, 130, 4],
      [155, 129, 3],
      [161, 125, 3.5],
      [151, 123, 2.5],
    ] as const) {
      parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#f4f7f8" stroke="#6f8791" stroke-width="1.2"/>`);
    }
  }
  if (scene.cues.includes('breathFog')) {
    parts.push(
      `<g opacity="0.8"><circle cx="180" cy="122" r="6" fill="#e8eef2" stroke="#8fa3ae" stroke-width="1"/>`,
      `<circle cx="189" cy="116" r="7" fill="#e8eef2" stroke="#8fa3ae" stroke-width="1"/>`,
      `<circle cx="197" cy="123" r="5" fill="#e8eef2" stroke="#8fa3ae" stroke-width="1"/></g>`,
    );
  }
  if (scene.tools.includes('feather')) {
    const stirs = obs.breath === 'stirs';
    const tilt = stirs ? -8 : 0;
    parts.push(
      `<g transform="rotate(${tilt} 138 126)">`,
      `<path d="M96 156L136 126" stroke="${INK}" stroke-width="2"/>`,
      `<path d="M100 150C104 134 124 122 136 126C128 138 112 152 100 150Z" fill="#f2ede2" stroke="${INK}" stroke-width="1.5"/>`,
      '</g>',
    );
    if (stirs) {
      parts.push(
        `<path d="M126 112Q122 118 126 124M120 108Q114 118 120 128" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
      );
    }
  }
  return parts.join('');
}

function ornament(value: Value | undefined): string {
  if (value !== 'amber' && value !== 'silver') return '';
  const cord = `<path d="M136 150L150 176L164 150" fill="none" stroke="#3a2c20" stroke-width="2"/>`;
  return value === 'amber'
    ? `${cord}<path d="M150 172C160 184 158 196 150 198C142 196 140 184 150 172Z" fill="#d98e1f" stroke="#6b3d05" stroke-width="2"/><circle cx="147" cy="186" r="2" fill="#f6d28a"/>`
    : `${cord}<circle cx="150" cy="186" r="9" fill="none" stroke="#c9ced3" stroke-width="5"/><circle cx="150" cy="186" r="9" fill="none" stroke="#5c6166" stroke-width="1"/>`;
}

function wounds(n: Value | undefined, at: readonly (readonly [number, number])[]): string {
  const count = typeof n === 'number' ? Math.max(0, Math.min(at.length, n)) : 0;
  return at
    .slice(0, count)
    .map(([x, y]) => slash(x, y))
    .join('');
}

function defs(): string {
  const patterns = Object.entries(HAIR)
    .filter(([, s]) => s.texture)
    .map(
      ([k, s]) =>
        `<pattern id="cots-hair-${k}" width="10" height="10" patternUnits="userSpaceOnUse">${s.texture}</pattern>`,
    );
  return `<defs>${patterns.join('')}</defs>`;
}

function draw(scene: BodyScene): string {
  const body =
    scene.view === 'front'
      ? [
          figure(scene),
          hair(scene),
          face(scene),
          ornament(scene.obs.ornament),
          wounds(scene.obs.woundsFront, FRONT_WOUNDS),
        ]
      : [figure(scene), hair(scene), wounds(scene.obs.woundsBack, BACK_WOUNDS)];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">`,
    defs(),
    ...body,
    '</svg>',
  ].join('');
}

function hotspots(scene: BodyScene): Hotspot[] {
  const h = half(scene.look);
  const hp = hands(scene.look, scene.view);
  const handSpot = (id: 'handR' | 'handL', x: number): Hotspot => ({
    id,
    x: x - 26,
    y: 226,
    w: 52,
    h: 110,
    keys: ['grip', 'gripHand'],
  });
  if (scene.view === 'back') {
    return [{ id: 'back', x: CX - h, y: 158, w: 2 * h, h: 146, keys: ['woundsBack'] }];
  }
  return [
    { id: 'hair', x: 100, y: 46, w: 100, h: 38, keys: ['hair'] },
    { id: 'face', x: 100, y: 84, w: 100, h: 56, keys: ['skin', 'lips', 'breath', 'breathFog'] },
    { id: 'neck', x: 110, y: 140, w: 80, h: 62, keys: ['ornament'] },
    { id: 'chest', x: CX - h, y: 202, w: 2 * h, h: 102, keys: ['woundsFront'] },
    handSpot('handR', hp.R),
    handSpot('handL', hp.L),
  ];
}

export const placeholderBody: BodyArtProvider = {
  id: 'placeholder',
  frame: { w: W, h: H },
  hotspots,
  draw,
  conformance: {
    grip: 3,
    gripHand: 2,
    woundsFront: 3,
    skin: 3,
    lips: 2,
    hair: 3,
    ornament: 2,
    woundsBack: 3,
    breath: 3,
    breathFog: 2,
  },
  views: {
    grip: 'front',
    gripHand: 'front',
    woundsFront: 'front',
    skin: 'front',
    lips: 'front',
    hair: 'front',
    ornament: 'front',
    woundsBack: 'back',
    breath: 'front',
    breathFog: 'front',
  },
};
