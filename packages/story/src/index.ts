import { type Effect, type Faction, fnv1a32, type RunState } from '@cots/engine';
import { Story } from 'inkjs';

/*
 * Ink scenes for the campaign (docs/tech-spec.md §5.4). Each scene is its own
 * compiled story with no Ink state kept between scenes: memory across days is
 * the run's flags. Scenes read the run through a few external functions and
 * change it only through `# fx:` tags, which the engine applies once when the
 * scene ends. Replaying a scene from its start with the same choices gives the
 * same lines and effects.
 */

/** What a scene can read about the run when it starts. */
export interface SceneEnv {
  /** Seeds Ink's RANDOM and shuffles. */
  readonly seed: number;
  readonly day: number;
  readonly rings: number;
  readonly flags: Readonly<Record<string, number>>;
  readonly standing: Readonly<Record<Faction, number>>;
  /** Family member id -> 'well' | 'sick' | 'gone'. */
  readonly family: Readonly<Record<string, string>>;
}

/** External functions a scene may declare (`EXTERNAL flag(name)` …). */
export const EXTERNALS = ['flag', 'standing', 'rings', 'day', 'home', 'sick'] as const;

export interface SceneLine {
  readonly text: string;
  /** From a `# speaker: name` tag. */
  readonly speaker?: string;
  readonly tags: readonly string[];
  /** The option the player picked, echoed so the reply that follows makes sense. */
  readonly chosen?: boolean;
  /**
   * On the last line before a choice (or the end): the effects since the previous choice, which is
   * what that choice did. (Ink gives a tag written under a line to the next line, so a line's own
   * tags don't say which choice an effect belongs to.)
   */
  readonly effects?: readonly Effect[];
}

/** A scene's view of the run as it stands; the seed is fixed per run, day and scene. */
export function sceneEnv(run: RunState, sceneId: string): SceneEnv {
  return {
    seed: fnv1a32(`${run.seed}|${run.day}|${sceneId}`),
    day: run.day,
    rings: run.rings,
    flags: run.flags,
    standing: run.standing,
    family: Object.fromEntries(run.family.map((m) => [m.id, m.status])),
  };
}

export interface SceneFrame {
  /** The scene is marked `# draft` at its top: placeholder writing. */
  readonly draft: boolean;
  readonly lines: readonly SceneLine[];
  /** The choices waiting now; empty when the scene has ended. */
  readonly choices: readonly string[];
  /** Everything the scene does, in order, from all `# fx:` tags seen so far. */
  readonly effects: readonly Effect[];
  readonly done: boolean;
}

const FACTIONS = new Set(['odin', 'freyja', 'hel', 'loki', 'clerk']);

/**
 * Parses one `fx:` tag:
 *   fx: rings -5            fx: standing freyja +1
 *   fx: flag owes_loki      fx: flag thorvald +1      fx: flag deals = 2
 *   fx: family sister sick  fx: family sister well
 * Returns null for tags that aren't effects, and throws on a malformed one.
 */
export function parseFx(tag: string): Effect | null {
  const m = /^\s*fx:\s*(.*)$/.exec(tag);
  if (!m) return null;
  const parts = (m[1] ?? '').trim().split(/\s+/);
  const [kind, a, b, c] = parts;
  const int = (s: string | undefined) => {
    if (s === undefined || !/^[+-]?\d+$/.test(s)) throw new Error(`bad number in "${tag}"`);
    return Number(s);
  };
  switch (kind) {
    case 'rings':
      if (parts.length !== 2) break;
      return { rings: int(a) };
    case 'standing':
      if (parts.length !== 3 || !a || !FACTIONS.has(a)) break;
      return { standing: a as Faction, by: int(b) };
    case 'flag': {
      if (!a || !/^[A-Za-z0-9_]+$/.test(a)) break;
      if (parts.length === 2) return { flag: a, set: 1 };
      if (parts.length === 3) return { flag: a, inc: int(b) };
      if (parts.length === 4 && b === '=') return { flag: a, set: int(c) };
      break;
    }
    case 'family':
      if (parts.length !== 3 || !a || (b !== 'sick' && b !== 'well')) break;
      return { family: a, becomes: b };
  }
  throw new Error(`malformed effect tag "${tag}"`);
}

function speakerOf(tags: readonly string[]): string | undefined {
  for (const t of tags) {
    const m = /^\s*speaker:\s*(\S+)/.exec(t);
    if (m) return m[1];
  }
  return undefined;
}

function bind(story: Story, env: SceneEnv): void {
  story.BindExternalFunction('flag', (k: string) => env.flags[k] ?? 0, true);
  story.BindExternalFunction('standing', (f: string) => env.standing[f as Faction] ?? 0, true);
  story.BindExternalFunction('rings', () => env.rings, true);
  story.BindExternalFunction('day', () => env.day, true);
  story.BindExternalFunction('home', (id: string) => (env.family[id] && env.family[id] !== 'gone' ? 1 : 0), true);
  story.BindExternalFunction('sick', (id: string) => (env.family[id] === 'sick' ? 1 : 0), true);
}

/** Plays a scene from its start through `choices`, stopping at the next choice or the end. */
export function playScene(json: string | object, env: SceneEnv, choices: readonly number[]): SceneFrame {
  const story = typeof json === 'string' ? new Story(json) : new Story(json as Record<string, unknown>);
  story.state.storySeed = env.seed;
  bind(story, env);
  const draft = (story.globalTags ?? []).some((t) => t.trim() === 'draft');
  const lines: SceneLine[] = [];
  const effects: Effect[] = [];
  let pending: Effect[] = [];
  let i = 0;
  for (;;) {
    while (story.canContinue) {
      const text = (story.Continue() ?? '').trim();
      const tags = story.currentTags ?? [];
      for (const t of tags) {
        const fx = parseFx(t);
        if (fx) pending.push(fx);
      }
      if (text) {
        const speaker = speakerOf(tags);
        lines.push({ text, tags, ...(speaker ? { speaker } : {}) });
      }
    }
    // What happened since the last choice goes with the last line before the next one (or the end).
    const last = lines[lines.length - 1];
    if (pending.length > 0 && last) lines[lines.length - 1] = { ...last, effects: pending };
    effects.push(...pending);
    pending = [];
    const open = story.currentChoices;
    if (open.length === 0) return { draft, lines, choices: [], effects, done: true };
    if (i >= choices.length) return { draft, lines, choices: open.map((c) => c.text), effects, done: false };
    const pick = choices[i++] as number;
    const picked = open[pick];
    if (!picked) throw new RangeError(`choice ${pick} of ${open.length}`);
    lines.push({ text: picked.text.trim(), tags: [], chosen: true });
    story.ChooseChoiceIndex(pick);
  }
}

/** One complete way through a scene: the choices made and everything they did. */
export interface ScenePath {
  readonly choices: readonly number[];
  readonly effects: readonly Effect[];
}

/**
 * Every path through a scene, depth-first over choices (up to `limit` paths).
 * One story is parsed and reset for each path, so it's cheap enough for bots
 * that weigh every option of every scene in a whole campaign.
 */
export function scenePaths(json: string | object, env: SceneEnv, limit = 500): ScenePath[] {
  const story = typeof json === 'string' ? new Story(json) : new Story(json as Record<string, unknown>);
  bind(story, env);
  const play = (choices: readonly number[]): { open: number; effects: Effect[] } => {
    story.ResetState();
    story.state.storySeed = env.seed;
    const effects: Effect[] = [];
    let i = 0;
    for (;;) {
      while (story.canContinue) {
        story.Continue();
        for (const t of story.currentTags ?? []) {
          const fx = parseFx(t);
          if (fx) effects.push(fx);
        }
      }
      const open = story.currentChoices.length;
      if (open === 0 || i >= choices.length) return { open, effects };
      story.ChooseChoiceIndex(choices[i++] as number);
    }
  };
  const paths: ScenePath[] = [];
  const visit = (choices: number[]): void => {
    if (paths.length >= limit) throw new Error(`more than ${limit} paths`);
    const { open, effects } = play(choices);
    if (open === 0) {
      paths.push({ choices, effects });
      return;
    }
    for (let i = 0; i < open; i++) visit([...choices, i]);
  };
  visit([]);
  return paths;
}

/**
 * Every path through a scene (depth-first over choices, up to `limit` paths),
 * for the content linter: each must end, and every fx tag on it must parse.
 */
export function walkScene(json: string | object, env: SceneEnv, limit = 500): { paths: number; effects: Effect[][] } {
  const effects = scenePaths(json, env, limit).map((p) => [...p.effects]);
  return { paths: effects.length, effects };
}
