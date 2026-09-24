import type { Effect } from '@cots/engine';
import { parseFx, parseNeeds } from '@cots/story';
import { type Expr, parseExpr } from './expr';

/*
 * A scene's source, read line by line into what a reader of the script needs
 * (docs/tech-spec.md §31): the lines as written, each option with what it
 * needs and when it's offered, the conditions, the effects and the jumps, each
 * with its source line and how deeply it's nested. Scenes are written in a
 * small part of Ink (docs/story-drafts.md, "Writing a scene"); anything outside
 * it is refused rather than shown wrong.
 */

/** A piece of a line: plain text, or text that depends on the run (`{home("brother"):brother's|family's}`). */
export type Segment = string | { readonly cond: Expr; readonly then: string; readonly else: string };

interface At {
  /** The line in the `.ink` file, from 1. */
  readonly line: number;
  /** How far in the row sits: one step per open option and per open condition. */
  readonly level: number;
}

export type Row =
  | (At & {
      readonly kind: 'line';
      readonly text: readonly Segment[];
      readonly speaker?: string;
      readonly effects: readonly Effect[];
    })
  /** Effect tags on lines of their own: they fire where they're written. */
  | (At & { readonly kind: 'effects'; readonly effects: readonly Effect[] })
  | (At & {
      readonly kind: 'choice';
      readonly depth: number;
      readonly text: string;
      /** Offered only when this holds (conditions on the option, joined). */
      readonly cond?: Expr;
      /** From `#needs: rings N`: offered, but locked while the purse is short. */
      readonly rings?: number;
      /** A `+` option, which can be taken again. */
      readonly sticky: boolean;
    })
  /** Where the options before it join again. */
  | (At & { readonly kind: 'gather'; readonly depth: number })
  | (At & { readonly kind: 'if'; readonly cond: Expr })
  | (At & { readonly kind: 'elif'; readonly cond: Expr })
  | (At & { readonly kind: 'else' })
  /** A jump to a part of the scene, or its end (`END`); with `cond`, only when that holds. */
  | (At & { readonly kind: 'jump'; readonly target: string; readonly cond?: Expr })
  /** A named part of the scene (an Ink knot), reached by jumps. */
  | (At & { readonly kind: 'part'; readonly name: string });

export interface ParsedScene {
  /** Marked `# draft` at the top: writing still to be signed off. */
  readonly draft: boolean;
  readonly rows: readonly Row[];
}

/** Blanks out comments, keeping every line where it was. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

/** Splits `text # tag # tag` into the text and its tags. */
function splitTags(s: string): { text: string; tags: string[] } {
  const [text = '', ...tags] = s.split('#');
  return { text: text.trim(), tags: tags.map((t) => t.trim()).filter(Boolean) };
}

function effectsOf(tags: readonly string[], where: string): Effect[] {
  return tags.flatMap((t) => {
    try {
      const fx = parseFx(t);
      return fx ? [fx] : [];
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`);
    }
  });
}

function speakerOf(tags: readonly string[]): string | undefined {
  for (const t of tags) {
    const m = /^speaker:\s*(\S+)/.exec(t);
    if (m) return m[1];
  }
  return undefined;
}

/** Text with inline conditions (`{cond:a|b}`) split out; any other use of braces is refused. */
function segments(text: string, where: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;
  for (;;) {
    const open = rest.indexOf('{');
    if (open < 0) {
      if (rest.includes('}')) throw new Error(`${where}: a "}" with no "{"`);
      if (rest) out.push(rest);
      return out;
    }
    const close = rest.indexOf('}', open);
    if (close < 0) throw new Error(`${where}: a "{" with no "}"`);
    if (open > 0) out.push(rest.slice(0, open));
    const inner = rest.slice(open + 1, close);
    const colon = inner.indexOf(':');
    if (colon < 0) throw new Error(`${where}: "{${inner}}" isn't a condition (the script reads only {cond:text|else})`);
    const [then = '', other = '', ...more] = inner.slice(colon + 1).split('|');
    if (more.length > 0) throw new Error(`${where}: "{${inner}}" has more than one "|"`);
    out.push({ cond: parseExpr(inner.slice(0, colon)), then, else: other });
    rest = rest.slice(close + 1);
  }
}

const CHOICE = /^([*+][\s*+]*)(\(\w+\)\s*)?((?:\{[^}]*\}\s*)*)\[([^\]]*)\]\s*(?:->\s*([\w.]+)\s*)?$/;

/** Reads a scene's source (`d9.night.ink`) into the rows the script shows. */
export function parseScene(source: string, file = 'scene'): ParsedScene {
  const rows: Row[] = [];
  let draft = false;
  /** The option depth the text is in: 0 before any option, or after a gather at depth 1. */
  let weave = 0;
  /**
   * Open `{ … }` blocks: `switch` for one opened with a bare `{`, whose branches are all `- cond:` lines,
   * and how many branches each has had so far.
   */
  const blocks: { switch: boolean; branches: number }[] = [];
  let pendingSpeaker: string | undefined;
  const level = () => weave + blocks.length;

  stripComments(source)
    .split('\n')
    .forEach((raw, i) => {
      const line = i + 1;
      const where = `${file}:${line}`;
      const t = raw.trim();
      if (!t) return;
      if (/^#\s*draft\s*$/.test(t)) {
        draft = true;
        return;
      }
      if (/^EXTERNAL\s/.test(t)) return;
      if (/^(VAR|CONST|LIST|INCLUDE)\s|^~|^<-|^=(?!=)\s*\w/.test(t)) {
        throw new Error(`${where}: "${t}" is Ink the script doesn't read`);
      }

      const knot = /^={2,}\s*(\w+)\s*=*$/.exec(t);
      if (knot) {
        if (blocks.length > 0) throw new Error(`${where}: a part starts inside an open condition`);
        weave = 0;
        rows.push({ kind: 'part', line, level: 0, name: knot[1] as string });
        return;
      }

      // Tags on a line of their own: effects fire here; a speaker names the next line.
      if (t.startsWith('#')) {
        const { tags } = splitTags(t);
        const fx = effectsOf(tags, where);
        const who = speakerOf(tags);
        if (who) pendingSpeaker = who;
        if (fx.length > 0) {
          const last = rows[rows.length - 1];
          // Tags written one per line read as one group.
          if (last?.kind === 'effects' && last.level === level()) {
            rows[rows.length - 1] = { ...last, effects: [...last.effects, ...fx] };
          } else rows.push({ kind: 'effects', line, level: level(), effects: fx });
        }
        return;
      }

      // Conditions spread over lines.
      if (t === '}') {
        if (!blocks.pop()) throw new Error(`${where}: a "}" with no open condition`);
        return;
      }
      if (t === '{') {
        blocks.push({ switch: true, branches: 0 });
        return;
      }
      const opens = /^\{\s*([^{}]+?)\s*:\s*$/.exec(t);
      if (opens) {
        rows.push({ kind: 'if', line, level: level(), cond: parseExpr(opens[1] as string) });
        blocks.push({ switch: false, branches: 1 });
        return;
      }
      const branch = /^-\s*(else|[^:]+?)\s*:\s*(.*)$/.exec(t);
      if (branch && blocks.length > 0) {
        const head = branch[1] as string;
        let cond: Expr | null = null;
        if (head !== 'else') {
          try {
            cond = parseExpr(head);
          } catch {
            cond = null;
          }
        }
        if (head === 'else' || cond) {
          const block = blocks[blocks.length - 1] as { switch: boolean; branches: number };
          // The branch heads sit at the block's own level; what they hold sits one in.
          const at = level() - 1;
          if (head === 'else') rows.push({ kind: 'else', line, level: at });
          else rows.push({ kind: block.branches === 0 ? 'if' : 'elif', line, level: at, cond: cond as Expr });
          block.branches++;
          const rest = (branch[2] as string).trim();
          if (rest) pushText(rest, line, level());
          return;
        }
      }

      // A condition on one line: a jump, or a line of text.
      const oneLine = /^\{\s*([^{}:]+?)\s*:\s*->\s*([\w.]+)\s*\}$/.exec(t);
      if (oneLine) {
        rows.push({
          kind: 'jump',
          line,
          level: level(),
          cond: parseExpr(oneLine[1] as string),
          target: oneLine[2] as string,
        });
        return;
      }

      // Options: `* { cond } [text #needs: rings N] -> part`.
      if (/^[*+]/.test(t)) {
        const m = CHOICE.exec(t);
        if (!m) throw new Error(`${where}: an option the script can't read: "${t}"`);
        const marks = (m[1] as string).replace(/\s/g, '');
        const depth = marks.length;
        const conds = [...(m[3] ?? '').matchAll(/\{([^}]*)\}/g)].map((c) => parseExpr(c[1] as string));
        const { text, tags } = splitTags(m[4] as string);
        let rings: number | undefined;
        for (const tag of tags) rings = parseNeeds(tag)?.rings ?? rings;
        weave = depth - 1;
        const cond: Expr | undefined = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : { and: conds };
        rows.push({
          kind: 'choice',
          line,
          level: level(),
          depth,
          text,
          ...(cond ? { cond } : {}),
          ...(rings !== undefined ? { rings } : {}),
          sticky: marks.includes('+'),
        });
        weave = depth;
        if (m[5]) rows.push({ kind: 'jump', line, level: level(), target: m[5] });
        return;
      }

      // Gathers: `- text`, `- -> part`, `- { cond: -> part }`, and deeper `- -`.
      const gather = /^((?:-\s*)+)(?!>)(.*)$/.exec(t);
      if (gather && !t.startsWith('->')) {
        const depth = (gather[1] as string).replace(/\s/g, '').length;
        weave = depth - 1;
        rows.push({ kind: 'gather', line, level: level(), depth });
        const rest = (gather[2] as string).trim();
        if (rest) readContent(rest, line);
        return;
      }

      readContent(t, line);
    });

  if (blocks.length > 0) throw new Error(`${file}: a condition is never closed with "}"`);
  return { draft, rows };

  /** A line's content after any gather mark: a jump, a one-line conditional jump, or text. */
  function readContent(t: string, line: number): void {
    const where = `${file}:${line}`;
    const jump = /^->\s*([\w.]+)\s*$/.exec(t);
    if (jump) {
      rows.push({ kind: 'jump', line, level: level(), target: jump[1] as string });
      return;
    }
    const oneLine = /^\{\s*([^{}:]+?)\s*:\s*->\s*([\w.]+)\s*\}$/.exec(t);
    if (oneLine) {
      rows.push({
        kind: 'jump',
        line,
        level: level(),
        cond: parseExpr(oneLine[1] as string),
        target: oneLine[2] as string,
      });
      return;
    }
    if (t.includes('->')) throw new Error(`${where}: a jump in the middle of a line: "${t}"`);
    pushText(t, line, level());
  }

  function pushText(t: string, line: number, at: number): void {
    const where = `${file}:${line}`;
    const { text, tags } = splitTags(t);
    const speaker = speakerOf(tags) ?? pendingSpeaker;
    pendingSpeaker = undefined;
    const effects = effectsOf(tags, where);
    if (!text) {
      if (effects.length > 0) rows.push({ kind: 'effects', line, level: at, effects });
      return;
    }
    rows.push({ kind: 'line', line, level: at, text: segments(text, where), ...(speaker ? { speaker } : {}), effects });
  }
}

/** Every way a line of text can read, its conditions taken either way (for checking against Ink). */
export function readings(text: readonly Segment[]): string[] {
  let out = [''];
  for (const s of text) {
    if (typeof s === 'string') out = out.map((o) => o + s);
    else out = out.flatMap((o) => [o + s.then, o + s.else]);
  }
  return [...new Set(out.map((o) => o.replace(/\s+/g, ' ').trim()))];
}
