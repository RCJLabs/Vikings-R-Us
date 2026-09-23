/**
 * Import boundaries and engine purity (docs/build-plan.md §3, "Engine rules").
 * Comments are blanked before scanning, so rules only see code.
 */
export interface Violation {
  file: string;
  line: number;
  rule: string;
}

interface PatternRule {
  rule: string;
  pattern: RegExp;
}

const ENGINE_PATTERNS: readonly PatternRule[] = [
  { rule: 'no Math.random (use Rng)', pattern: /\bMath\.random\b/ },
  {
    rule: 'no transcendental Math (results differ between JS engines)',
    pattern:
      /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|fround)\b/,
  },
  { rule: 'no ** operator (floating-point pow)', pattern: /\*\*/ },
  { rule: 'no Date (the engine never reads a clock)', pattern: /\bDate\b/ },
  { rule: 'no Intl or localeCompare (locale-dependent)', pattern: /\bIntl\b|\.localeCompare\s*\(/ },
  {
    rule: 'no timers or clocks',
    pattern: /\b(setTimeout|setInterval|requestAnimationFrame|performance)\b/,
  },
  {
    rule: 'no DOM or host globals',
    pattern: /\b(window|document|navigator|localStorage|indexedDB|globalThis|process|require)\b/,
  },
];

/** Replaces comments with spaces (keeping newlines) so line numbers stay right. */
export function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function importsOf(code: string): { spec: string; line: number }[] {
  const found: { spec: string; line: number }[] = [];
  for (const m of code.matchAll(IMPORT_SPECIFIER)) {
    found.push({ spec: m[1] as string, line: code.slice(0, m.index).split('\n').length });
  }
  return found;
}

/** Engine code: no nondeterminism, no host APIs, and only relative imports. */
export function checkEngineSource(file: string, source: string): Violation[] {
  const code = blankComments(source);
  const out: Violation[] = [];
  code.split('\n').forEach((text, i) => {
    for (const { rule, pattern } of ENGINE_PATTERNS) {
      if (pattern.test(text)) out.push({ file, line: i + 1, rule });
    }
  });
  for (const { spec, line } of importsOf(code)) {
    if (!spec.startsWith('.')) out.push({ file, line, rule: `engine may only import its own files (found "${spec}")` });
  }
  return out;
}

/** Browser code: content only through `virtual:content`, never Node-only packages. */
export function checkClientSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  for (const { spec, line } of importsOf(blankComments(source))) {
    if (/(^|\/)(generated|content)(\/|$)/.test(spec)) {
      out.push({ file, line, rule: `load content through virtual:content (found "${spec}")` });
    }
    if (spec === '@cots/content-compiler' || spec.startsWith('node:')) {
      out.push({ file, line, rule: `browser code may not import "${spec}"` });
    }
  }
  return out;
}
