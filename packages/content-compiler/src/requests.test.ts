import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type CampaignPart, TARGETS } from '@cots/content-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { compileTarget, loadPacks } from './compile';

const packsDir = resolve(import.meta.dirname, '../../../content/packs');

let out = '';
afterEach(() => {
  if (out) rmSync(out, { recursive: true, force: true });
  out = '';
});

type Requests = NonNullable<CampaignPart['requests']>;

/** Compiles the full game from the real packs, with the campaign pack's requests changed. */
function compileWith(change: (list: Requests['list']) => Requests['list']): () => void {
  const packs = loadPacks(packsDir);
  const pack = packs.get('campaign');
  const campaign = pack?.content.campaign;
  if (!pack || !campaign?.requests) throw new Error('the campaign pack has no requests');
  pack.content.campaign = { ...campaign, requests: { ...campaign.requests, list: change(campaign.requests.list) } };
  return () => {
    out = mkdtempSync(join(tmpdir(), 'cots-requests-'));
    compileTarget('dev-full', TARGETS['dev-full'], packs, out);
  };
}

// docs/tech-spec.md §42.
describe('the gods’ requests, as content', () => {
  it('refuses words that are missing, a favour that is no mistake, and one that stops before it starts', () => {
    const first = (edit: (r: Requests['list'][number]) => Requests['list'][number]) =>
      compileWith(([r, ...rest]) => (r ? [edit(r), ...rest] : rest));
    expect(first((r) => ({ ...r, text: 'request.nobody' }))).toThrow(
      /request req\.\w+ uses missing string "request\.nobody"/,
    );
    expect(first((r) => ({ ...r, to: r.from }))).toThrow(/asks for souls sent where they already belong/);
    expect(first((r) => ({ ...r, until: r.since }))).toThrow(/stops before it starts/);
    expect(compileWith((list) => [...list, ...list.slice(0, 1)])).toThrow(/Duplicate request "req\.\w+"/);
  }, 60_000);
});
