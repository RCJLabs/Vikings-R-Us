import type { ShareResult } from './index';

/** Native share sheet when available, otherwise the clipboard. */
export async function shareWithFallback(text: string, url?: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(url ? { text, url } : { text });
      return 'shared';
    } catch {
      // Cancelled or blocked: fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
