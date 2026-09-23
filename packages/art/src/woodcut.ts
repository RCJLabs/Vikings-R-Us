import { fnv1a32, type Look, type Value } from '@cots/engine';
import type { BodyArtProvider, BodyScene, Portrait } from './contract';
import {
  BACK_WOUNDS,
  BLADE_Y,
  CX,
  FRONT_WOUNDS,
  H,
  half,
  hands,
  PORTRAIT_VIEWBOX,
  portraitScene,
  SIGN_VIEWS,
  standardHotspots,
  W,
  type WeaponKind,
  weaponKind,
} from './layout';

/**
 * Candidate art direction A: a hand-coloured woodcut. Heavy ink outlines,
 * parallel hatching for shade, a few flat washes on paper, like a printed
 * chronicle. SVG, so it's sharp at any size. Signs stay shape-coded: wounds
 * are gashes with drips, fever is stipple, sea-foam is bubbles and each hair
 * colour has its own cut (solid, lines, curls, cross-hatch).
 */

const PAPER = '#f1e6cc';
const INK = '#1c1510';
const SKIN = '#efd8b6';
const TROUSERS = '#6a5a47';
const WRAPS = '#cdbd97';
const WOOD = '#8c5e33';
const IRON = '#a3aaae';
const BLOOD = '#b3261e';
const AMBER = '#d98a1c';
const SILVER = '#c9ced2';
const GOLD = '#c79a3a';
const FOAM_EDGE = '#4f7584';

/** Tunic washes, picked per soul for variety (cosmetic only). */
const TUNICS = ['#a2543a', '#566e84', '#8c7a5c', '#6f7a4c'] as const;

const HAIR: Readonly<Record<string, string>> = { dark: INK, fair: '#e2c46e', red: '#b24a2a', grey: '#c9c5bb' };

const OUTLINE = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const THIN = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;

const tunicOf = (look: Look) => TUNICS[fnv1a32(`${look.name}|${look.patronym}|tunic`) % TUNICS.length] ?? TUNICS[0];

/** Pattern defs shared by every woodcut drawing (identical everywhere, so repeated ids are harmless). */
const DEFS = [
  '<defs>',
  `<pattern id="wc-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0V5" stroke="${INK}" stroke-width="1.5"/></pattern>`,
  `<pattern id="wc-hatch-fine" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><path d="M0 0V4" stroke="${INK}" stroke-width="0.9"/></pattern>`,
  `<pattern id="wc-cross" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6M0 0H6" stroke="${INK}" stroke-width="1.1"/></pattern>`,
  `<pattern id="wc-strands" width="7" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(8)"><path d="M2 0V12" stroke="${INK}" stroke-width="1.4"/></pattern>`,
  `<pattern id="wc-cut" width="7" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(8)"><path d="M3 0V12" stroke="${PAPER}" stroke-width="1.3"/></pattern>`,
  `<pattern id="wc-curls" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M1 6Q4.5 0 8 6" fill="none" stroke="${INK}" stroke-width="1.3"/></pattern>`,
  `<pattern id="wc-grain" width="40" height="6" patternUnits="userSpaceOnUse"><path d="M0 3Q10 1 20 3T40 3" fill="none" stroke="${INK}" stroke-width="0.8" opacity="0.6"/></pattern>`,
  '</defs>',
].join('');

/** Hair texture by colour: dark is solid ink with cut lines, fair is strands, red is curls, grey is cross-hatch. */
function hairFill(hair: string, d: string): string {
  const fill = HAIR[hair] ?? INK;
  const texture =
    hair === 'dark' ? 'wc-cut' : hair === 'fair' ? 'wc-strands' : hair === 'red' ? 'wc-curls' : 'wc-cross';
  return [
    `<path d="${d}" fill="${fill}"/>`,
    `<path d="${d}" fill="url(#${texture})"/>`,
    `<path d="${d}" fill="none" ${OUTLINE}/>`,
  ].join('');
}

function hairShape(look: Look, front: boolean): string {
  if (!front) {
    const back = 'M104 100C98 44 202 44 196 100C198 128 186 144 150 146C114 144 102 128 104 100Z';
    return look.gender === 'f' ? `${back}M136 140C134 160 138 178 150 192C162 178 166 160 164 140Z` : back;
  }
  const cap = 'M104 98C100 40 200 40 196 98C188 78 170 68 150 70C130 68 112 78 104 98Z';
  return look.gender === 'f'
    ? `${cap}M105 92C94 124 96 160 108 186L120 182C112 156 112 124 116 96Z M195 92C206 124 204 160 192 186L180 182C188 156 188 124 184 96Z`
    : cap;
}

function beard(look: Look, hair: string): string {
  if (look.beard === 'none' || look.gender === 'f') return '';
  const d =
    look.beard === 'short'
      ? 'M116 118Q124 150 150 156Q176 150 184 118Q178 136 164 140Q150 146 136 140Q122 136 116 118Z'
      : 'M116 118Q120 150 136 164L150 184L164 164Q180 150 184 118Q178 138 164 142Q150 148 136 142Q122 138 116 118Z';
  const parts = [hairFill(hair, d)];
  if (look.beard === 'braided') {
    parts.push(
      `<rect x="142" y="160" width="16" height="6" rx="2" fill="${GOLD}" ${THIN}/>`,
      `<rect x="144" y="170" width="12" height="5" rx="2" fill="${GOLD}" ${THIN}/>`,
    );
  }
  return parts.join('');
}

function slash(x: number, y: number): string {
  // A gash: a red lens with an ink edge, and two drips below it.
  return [
    `<path d="M${x - 17} ${y - 7}Q${x} ${y - 9} ${x + 17} ${y + 7}Q${x} ${y + 5} ${x - 17} ${y - 7}Z" fill="${BLOOD}" ${THIN}/>`,
    `<path d="M${x - 4} ${y + 2}v8M${x + 6} ${y + 5}v6" stroke="${BLOOD}" stroke-width="3" stroke-linecap="round"/>`,
  ].join('');
}

function wounds(n: Value | undefined, at: readonly (readonly [number, number])[]): string {
  const count = typeof n === 'number' ? Math.max(0, Math.min(at.length, n)) : 0;
  return at
    .slice(0, count)
    .map(([x, y]) => slash(x, y))
    .join('');
}

/** The weapon in the fist, of the kind the soul's words name. The fist is drawn over its grip. */
function weapon(kind: WeaponKind, x: number, y: number, outward: 1 | -1): string {
  const b = (dx: number) => x + dx * outward;
  const shaft = (from: number, to: number) => [
    `<path d="M${x} ${from}V${to}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`,
    `<path d="M${x} ${from}V${to}" stroke="${WOOD}" stroke-width="5" stroke-linecap="round"/>`,
  ];
  if (kind === 'sword') {
    return [
      `<path d="M${x - 5} ${y - 16}V${y - 88}L${x} ${y - 100}L${x + 5} ${y - 88}V${y - 16}Z" fill="${IRON}" ${OUTLINE}/>`,
      `<path d="M${x - 1} ${y - 86}V${y - 22}" stroke="${INK}" stroke-width="1.6"/>`,
      `<path d="M${x + 2} ${y - 84}V${y - 26}" stroke="${PAPER}" stroke-width="1.4"/>`,
      `<rect x="${x - 15}" y="${y - 21}" width="30" height="7" rx="2" fill="${GOLD}" ${THIN}/>`,
      ...shaft(y - 14, y + 14),
      `<circle cx="${x}" cy="${y + 20}" r="6" fill="${GOLD}" ${THIN}/>`,
    ].join('');
  }
  if (kind === 'spear') {
    return [
      ...shaft(y - 112, y + 46),
      `<path d="M${x} ${y - 150}Q${x + 11} ${y - 128} ${x} ${y - 106}Q${x - 11} ${y - 128} ${x} ${y - 150}Z" fill="${IRON}" ${OUTLINE}/>`,
      `<path d="M${x} ${y - 144}V${y - 110}" stroke="${INK}" stroke-width="1.6"/>`,
      `<path d="M${x - 4} ${y - 110}H${x + 4}M${x - 4} ${y - 104}H${x + 4}" ${THIN}/>`,
    ].join('');
  }
  if (kind === 'seax') {
    // A long single-edged knife: a straight back, the edge rising to an angled point.
    return [
      `<path d="M${b(-4)} ${y - 14}V${y - 66}L${b(3)} ${y - 78}L${b(9)} ${y - 58}V${y - 14}Z" fill="${IRON}" ${OUTLINE}/>`,
      `<path d="M${b(2)} ${y - 62}L${b(6)} ${y - 56}V${y - 20}" fill="none" stroke="${PAPER}" stroke-width="1.4"/>`,
      `<rect x="${x - 9}" y="${y - 18}" width="18" height="6" rx="2" fill="${GOLD}" ${THIN}/>`,
      ...shaft(y - 12, y + 16),
    ].join('');
  }
  const top = y - 80;
  const head = `M${x} ${top + 2}L${b(20)} ${top - 4}Q${b(40)} ${top + 18} ${b(28)} ${top + 44}Q${b(18)} ${top + 30} ${x} ${top + 26}Z`;
  return [
    ...shaft(top - 6, y + 30),
    `<path d="${head}" fill="${IRON}" ${OUTLINE}/>`,
    `<path d="M${b(8)} ${top + 18}L${b(26)} ${top + 34}L${b(14)} ${top + 24}Z" fill="url(#wc-hatch)"/>`,
    `<path d="M${b(24)} ${top}Q${b(36)} ${top + 18} ${b(27)} ${top + 38}" fill="none" stroke="${PAPER}" stroke-width="2"/>`,
  ].join('');
}

/** A grip wrapped for a bigger hand: a thick leather band bound with crossing thongs. */
function wrongGrip(x: number, y: number): string {
  return [
    `<rect x="${x - 10}" y="${y - 48}" width="20" height="28" rx="4" fill="#6b4424" ${THIN}/>`,
    `<path d="M${x - 10} ${y - 44}L${x + 10} ${y - 34}M${x - 10} ${y - 34}L${x + 10} ${y - 24}M${x + 10} ${y - 44}L${x - 10} ${y - 34}" stroke="${WRAPS}" stroke-width="2"/>`,
  ].join('');
}

/** Long nails: curved horn claws past the knuckles. After the clippers, nothing shows. */
function claws(x: number, y: number): string {
  return [-9, -3, 3, 9]
    .map((d) => {
      const tip = x + d * 1.5;
      return `<path d="M${x + d - 2} ${y + 9}Q${x + d} ${y + 20} ${tip} ${y + 26}Q${x + d + 3} ${y + 18} ${x + d + 2} ${y + 9}Z" fill="#efe3c2" ${THIN}/>`;
    })
    .join('');
}

/** Abstract staves in a lens: the text chip reads the runes out; the drawing only has to differ. */
function runeReading(
  x: number,
  y: number,
  inscription: Value | undefined,
  mark: Value | undefined,
  kind: WeaponKind,
): string {
  const top = y + BLADE_Y[kind] - 14;
  const staves = (seed: string, x0: number, y0: number) =>
    [...seed]
      .map((ch, i) => {
        const cx = x0 + i * 5.5;
        const k = ch.charCodeAt(0) % 3;
        const branch =
          k === 0
            ? `M${cx} ${y0 + 2}L${cx + 3} ${y0 - 1}`
            : k === 1
              ? `M${cx} ${y0 + 5}L${cx - 3} ${y0 + 2}`
              : `M${cx - 2} ${y0 + 3}L${cx + 2} ${y0 + 3}`;
        return `<path d="M${cx} ${y0 - 3}V${y0 + 8}${branch}" stroke="${INK}" stroke-width="1.5" fill="none"/>`;
      })
      .join('');
  const owner = inscription === 'other' ? 'xqzv' : inscription === 'own' ? 'amik' : '';
  const maker = mark === 'markTrue' ? '+vlfberh+t' : mark === 'markCopy' ? '+vlfberht+' : '';
  return [
    `<path d="M${x + 36} ${top + 34}L${x + 50} ${top + 48}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`,
    `<path d="M${x + 36} ${top + 34}L${x + 50} ${top + 48}" stroke="${WOOD}" stroke-width="5" stroke-linecap="round"/>`,
    `<circle cx="${x + 18}" cy="${top + 14}" r="24" fill="${PAPER}" fill-opacity="0.9" ${OUTLINE}/>`,
    owner ? staves(owner, x + 6, top + 4) : '',
    maker ? staves(maker.slice(-6), x + 2, top + 19) : '',
  ].join('');
}

function hand(x: number, y: number, open: boolean): string {
  const fingers = open
    ? [-8, 0, 8].map((d) => `<path d="M${x + d} ${y + 8}L${x + d * 1.4} ${y + 21}" ${THIN}/>`).join('')
    : '';
  return `${fingers}<circle cx="${x}" cy="${y}" r="13" fill="${SKIN}" ${OUTLINE}/>`;
}

/** Tablet-woven trim: a band of little diamonds. */
function trim(x0: number, x1: number, y: number): string {
  const n = Math.max(1, Math.floor((x1 - x0) / 10));
  const step = (x1 - x0) / n;
  const marks = Array.from({ length: n }, (_, i) => {
    const cx = x0 + step * (i + 0.5);
    return `M${cx} ${y - 3}L${cx + 3} ${y}L${cx} ${y + 3}L${cx - 3} ${y}Z`;
  }).join('');
  return `<path d="M${x0} ${y - 5}H${x1}M${x0} ${y + 5}H${x1}" ${THIN}/><path d="${marks}" fill="${INK}"/>`;
}

function figure(scene: BodyScene, uid: string): string {
  const { look, view } = scene;
  const h = half(look);
  const hp = hands(look, view);
  const tunic = tunicOf(look);
  const front = view === 'front';
  const parts: string[] = [];

  // Legs: trousers, leg wraps bound with crossing bands, shoes.
  for (const lx of [CX - h + 10, CX + 4]) {
    const w = h - 14;
    parts.push(
      `<rect x="${lx}" y="300" width="${w}" height="60" fill="${TROUSERS}" ${OUTLINE}/>`,
      `<rect x="${lx}" y="300" width="${w / 2}" height="60" fill="url(#wc-hatch-fine)"/>`,
      `<rect x="${lx + 1}" y="356" width="${w - 2}" height="42" fill="${WRAPS}" ${OUTLINE}/>`,
      `<path d="M${lx + 1} 364L${lx + w - 1} 374M${lx + 1} 376L${lx + w - 1} 386M${lx + 1} 388L${lx + w - 1} 396" ${THIN}/>`,
      `<path d="M${lx - 6} 410Q${lx - 4} 396 ${lx + 4} 396H${lx + w - 2}Q${lx + w + 6} 400 ${lx + w + 4} 410Z" fill="${INK}"/>`,
    );
  }

  // Sleeves: an ink edge under a coloured sleeve, then the torso.
  const left = Math.min(hp.R, hp.L);
  const right = Math.max(hp.R, hp.L);
  for (const [sx, ex] of [
    [CX - h + 4, left],
    [CX + h - 4, right],
  ] as const) {
    parts.push(
      `<path d="M${sx} 170L${ex} ${hp.y - 12}" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>`,
      `<path d="M${sx} 170L${ex} ${hp.y - 12}" stroke="${tunic}" stroke-width="22" stroke-linecap="round"/>`,
      `<path d="M${sx + (ex - sx) * 0.55} ${170 + (hp.y - 182) * 0.55}L${ex} ${hp.y - 12}" stroke="url(#wc-hatch)" stroke-width="16" stroke-linecap="round" opacity="0.7"/>`,
    );
  }
  const torso = `M${CX - h} 172Q${CX - h} 156 ${CX - h + 16} 156H${CX + h - 16}Q${CX + h} 156 ${CX + h} 172L${CX + h + 4} 312H${CX - h - 4}Z`;
  parts.push(
    `<clipPath id="wc-torso-${uid}"><path d="${torso}"/></clipPath>`,
    `<path d="${torso}" fill="${tunic}"/>`,
    `<rect x="${front ? CX + h * 0.35 : CX - h - 4}" y="150" width="${h * 0.7 + 4}" height="170" fill="url(#wc-hatch)" clip-path="url(#wc-torso-${uid})"/>`,
    `<path d="${torso}" fill="none" ${OUTLINE}/>`,
    trim(CX - h + 2, CX + h + 2, 304),
    `<rect x="${CX - h - 2}" y="274" width="${2 * h + 4}" height="12" fill="#3b2a1c" ${THIN}/>`,
  );
  if (front) {
    parts.push(
      `<path d="M136 158L150 180L164 158" fill="none" ${THIN}/>`,
      trim(CX - 26, CX + 26, 164),
      `<rect x="${CX - 8}" y="273" width="16" height="14" fill="${GOLD}" ${THIN}/>`,
      `<path d="M${CX} 276V284" ${THIN}/>`,
    );
  } else {
    parts.push(`<path d="M${CX} 160V272" stroke="${INK}" stroke-width="2" stroke-dasharray="7 5"/>`);
  }

  // Neck and head.
  parts.push(
    `<rect x="136" y="128" width="28" height="34" fill="${SKIN}" ${OUTLINE}/>`,
    `<path d="M150 132H164V160H150Z" fill="url(#wc-hatch-fine)"/>`,
    `<ellipse cx="${CX}" cy="96" rx="43" ry="46" fill="${SKIN}" ${OUTLINE}/>`,
  );
  if (front) parts.push(`<path d="M172 118Q178 108 180 96" fill="none" stroke="url(#wc-hatch)" stroke-width="10"/>`);

  // The weapon under the fist, front view only.
  const grip = scene.obs.grip;
  const weaponHand = grip === 'weapon' ? (scene.obs.gripHand === 'left' ? 'L' : 'R') : null;
  if (front && weaponHand) {
    const x = weaponHand === 'L' ? hp.L : hp.R;
    const kind = weaponKind(scene.weapon);
    parts.push(weapon(kind, x, hp.y, x < CX ? -1 : 1));
    if (scene.cues.includes('wrongGrip')) parts.push(wrongGrip(x, hp.y));
    if (scene.tools.includes('runeLens')) {
      parts.push(runeReading(x, hp.y, scene.obs.inscription, scene.obs.makersMark, kind));
    }
  }
  for (const side of ['R', 'L'] as const) {
    const x = side === 'L' ? hp.L : hp.R;
    parts.push(hand(x, hp.y, front && grip === 'none'));
    if (front && scene.obs.nails === true && !scene.tools.includes('clippers')) parts.push(claws(x, hp.y));
    parts.push(
      `<text x="${x}" y="${hp.y + 46}" font-size="14" font-family="Georgia, serif" font-weight="bold" text-anchor="middle" fill="${INK}">${side}</text>`,
    );
  }
  return parts.join('');
}

function face(scene: BodyScene): string {
  const { look, obs } = scene;
  const parts: string[] = [
    // Heavy lids, brows and a carved nose: the dead, resting.
    `<path d="M122 94Q131 101 140 94M160 94Q169 101 178 94" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M124 97l-2 4M131 99v4M138 97l2 4M162 97l-2 4M169 99v4M176 97l2 4" ${THIN}/>`,
    `<path d="M120 82Q130 76 140 81M160 81Q170 76 180 82" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
    `<path d="M151 92L146 112Q150 116 156 112" fill="none" ${THIN}/>`,
  ];
  if (look.age >= 60) {
    parts.push(`<path d="M132 66Q150 61 168 66M136 73Q150 69 164 73M118 102l-5 3M182 102l5 3" fill="none" ${THIN}/>`);
  }
  if (obs.skin === 'feverFlush') {
    const stipple = (x: number) =>
      [
        [0, 0],
        [6, -2],
        [-6, 2],
        [3, 5],
        [-3, -5],
        [8, 4],
        [-8, -3],
        [2, -7],
      ]
        .map(([dx = 0, dy = 0]) => `<circle cx="${x + dx}" cy="${112 + dy}" r="1.9" fill="${INK}"/>`)
        .join('');
    parts.push(
      `<ellipse cx="124" cy="112" rx="14" ry="10" fill="${BLOOD}" opacity="0.4"/>`,
      `<ellipse cx="176" cy="112" rx="14" ry="10" fill="${BLOOD}" opacity="0.4"/>`,
      stipple(124),
      stipple(176),
    );
  }
  parts.push(beard(look, String(obs.hair ?? 'dark')));
  // Lips: a dry line, or sea-foam bubbles and a trickle of brine.
  parts.push(
    `<path d="M138 124Q150 129 162 124" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  );
  if (obs.lips === 'seaFoam') {
    parts.push(
      `<path d="M162 127Q165 136 162 146" fill="none" stroke="${FOAM_EDGE}" stroke-width="3" stroke-linecap="round"/>`,
    );
    for (const [x, y, r] of [
      [139, 126, 4],
      [147, 131, 4.5],
      [156, 130, 3.5],
      [162, 125, 4],
      [151, 123, 3],
    ] as const) {
      parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${FOAM_EDGE}" stroke-width="1.8"/>`);
    }
  }
  if (scene.cues.includes('breathFog')) {
    // A carved cloud: scalloped, with a curl.
    parts.push(
      `<path d="M176 128Q174 118 184 116Q188 106 198 112Q208 110 208 120Q214 128 204 132Q196 138 186 134Q176 136 176 128Z" fill="#e3eaec" ${THIN}/>`,
      `<path d="M186 126Q190 120 196 124" fill="none" ${THIN}/>`,
    );
  }
  if (scene.tools.includes('feather')) {
    const stirs = obs.breath === 'stirs';
    parts.push(
      `<g transform="rotate(${stirs ? -16 : 0} 138 126)">`,
      `<path d="M94 158L137 126" stroke="${INK}" stroke-width="2.5"/>`,
      `<path d="M98 152C102 134 124 120 137 126C129 140 112 154 98 152Z" fill="${PAPER}" ${THIN}/>`,
      `<path d="M104 146L112 138M110 144L119 134M116 140L125 130" ${THIN}/>`,
      '</g>',
    );
    if (stirs) {
      // Air lines beside the head, clear of the face.
      parts.push(
        `<path d="M100 102Q92 112 100 122M88 96Q76 112 88 128" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      );
    }
  }
  return parts.join('');
}

function ornament(value: Value | undefined): string {
  if (value !== 'amber' && value !== 'silver') return '';
  const cord = `<path d="M136 156L150 178L164 156" fill="none" stroke="${INK}" stroke-width="2"/>`;
  return value === 'amber'
    ? `${cord}<path d="M150 174C162 186 160 200 150 202C140 200 138 186 150 174Z" fill="${AMBER}" ${THIN}/><path d="M146 184Q147 190 150 194" fill="none" stroke="${PAPER}" stroke-width="2"/>`
    : `${cord}<circle cx="150" cy="188" r="10" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="150" cy="188" r="10" fill="none" stroke="${SILVER}" stroke-width="4"/>`;
}

/** An oath-ring on a thong, snapped open, beside any pendant. */
function brokenRing(on: boolean): string {
  if (!on) return '';
  return [
    `<path d="M160 150L178 178" fill="none" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M187 182A10 10 0 1 1 176 173" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`,
    `<path d="M187 182A10 10 0 1 1 176 173" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="M180 170L184 164M188 177L194 176" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  ].join('');
}

/** A tally stick in the belt, its notches fresh and pale. */
function freshTally(on: boolean, look: Look): string {
  if (!on) return '';
  const x = CX + half(look) - 22;
  const t = `rotate(12 ${x + 5} 284)`;
  return [
    `<rect x="${x}" y="260" width="11" height="46" rx="2" fill="${WOOD}" ${THIN} transform="${t}"/>`,
    ...[266, 274, 282, 290].map(
      (y) => `<path d="M${x + 1} ${y}L${x + 10} ${y + 2}" stroke="${PAPER}" stroke-width="3" transform="${t}"/>`,
    ),
  ].join('');
}

/** A carved ground under the feet: a hatched band with a few tufts. */
const GROUND = [
  `<path d="M11 404H${W - 11}V${H - 11}H11Z" fill="url(#wc-hatch)"/>`,
  `<path d="M11 404H${W - 11}" ${THIN}/>`,
  `<path d="M40 404l4 -9l3 9M58 404l3 -7l3 7M236 404l4 -9l3 9M254 404l3 -7l3 7" fill="none" ${THIN}/>`,
].join('');

function sceneId(scene: BodyScene): string {
  return fnv1a32(JSON.stringify([scene.view, scene.look, scene.obs, scene.cues, scene.tools])).toString(36);
}

function draw(scene: BodyScene): string {
  const uid = sceneId(scene);
  const hair = String(scene.obs.hair ?? 'dark');
  const front = scene.view === 'front';
  const body = front
    ? [
        figure(scene, uid),
        hairFill(hair, hairShape(scene.look, true)),
        face(scene),
        ornament(scene.obs.ornament),
        brokenRing(scene.cues.includes('brokenRing')),
        freshTally(scene.cues.includes('freshCarving'), scene.look),
        wounds(scene.obs.woundsFront, FRONT_WOUNDS),
      ]
    : [figure(scene, uid), hairFill(hair, hairShape(scene.look, false)), wounds(scene.obs.woundsBack, BACK_WOUNDS)];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">`,
    DEFS,
    `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`,
    `<rect x="11" y="11" width="${W - 22}" height="${H - 22}" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
    GROUND,
    ...body,
    '</svg>',
  ].join('');
}

function portrait(p: Portrait): string {
  return draw(portraitScene(p)).replace(/viewBox="[^"]*"/, `viewBox="${PORTRAIT_VIEWBOX}"`);
}

export const woodcutBody: BodyArtProvider = {
  id: 'woodcut',
  frame: { w: W, h: H },
  hotspots: standardHotspots,
  draw,
  portrait,
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
    brokenRing: 2,
    nails: 2,
    wrongGrip: 2,
    inscription: 2,
    makersMark: 2,
    freshCarving: 2,
  },
  views: SIGN_VIEWS,
};
