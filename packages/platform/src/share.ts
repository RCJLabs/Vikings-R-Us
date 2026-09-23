import type { ShareResult } from './index';

/** Copies text; falls back to a selected textarea where the async clipboard is blocked (itch iframes). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      // Deprecated, but still the only copy path inside some iframes.
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** Native share sheet on touch devices when available, otherwise the clipboard. */
export async function shareWithFallback(text: string, url?: string): Promise<ShareResult> {
  const full = url ? `${text}\n${url}` : text;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share(url ? { text, url } : { text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'failed';
      // Blocked: fall back to copying.
    }
  }
  return (await copyText(full)) ? 'copied' : 'failed';
}

/** For builds with no update channel of their own. */
export const noUpdates = (): (() => Promise<void>) => async () => {};
