import { strings } from 'virtual:content';
import { IntlMessageFormat } from 'intl-messageformat';

type Params = Readonly<Record<string, string | number>>;

const cache = new Map<string, IntlMessageFormat>();

/**
 * Formats a string key as ICU MessageFormat (plurals, selects, `{name}`
 * arguments). The content compiler has already checked every message parses.
 * Missing keys render as ⟦key⟧ so tests can catch them.
 */
export function t(key: string, params?: Params): string {
  const text = strings[key];
  if (text === undefined) return `⟦${key}⟧`;
  let message = cache.get(key);
  if (!message) {
    message = new IntlMessageFormat(text, 'en');
    cache.set(key, message);
  }
  try {
    const out = message.format(params);
    return typeof out === 'string' ? out : String(out);
  } catch {
    return `⟦${key}⟧`;
  }
}

/** m:ss for sun time. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "a, b and c". */
export function listText(items: readonly string[]): string {
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items);
}
