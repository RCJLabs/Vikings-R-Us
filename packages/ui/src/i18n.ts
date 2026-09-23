import { strings } from 'virtual:content';

/**
 * Looks up a string key and fills `{name}` placeholders. Replaced by
 * intl-messageformat (plurals, gender) when the shift UI lands in M2.
 */
export function t(key: string, params?: Readonly<Record<string, string | number>>): string {
  const text = strings[key];
  if (text === undefined) return `⟦${key}⟧`;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}
