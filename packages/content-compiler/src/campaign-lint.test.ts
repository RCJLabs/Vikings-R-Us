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

/** Compiles the full game from the real packs, with the campaign pack's part changed. */
function compileWith(change: (campaign: CampaignPart) => CampaignPart): () => void {
  const packs = loadPacks(packsDir);
  const pack = packs.get('campaign');
  if (!pack?.content.campaign) throw new Error('the campaign pack has no campaign');
  pack.content.campaign = change(pack.content.campaign);
  return () => {
    out = mkdtempSync(join(tmpdir(), 'cots-campaign-'));
    compileTarget('dev-full', TARGETS['dev-full'], packs, out);
  };
}

type Requests = NonNullable<CampaignPart['requests']>;
type Favours = NonNullable<CampaignPart['favours']>;

// docs/tech-spec.md §42.
describe('the gods’ requests, as content', () => {
  const withRequests = (change: (list: Requests['list']) => Requests['list']) =>
    compileWith((c) => (c.requests ? { ...c, requests: { ...c.requests, list: change(c.requests.list) } } : c));
  it('refuses words that are missing, a favour that is no mistake, and one that stops before it starts', () => {
    const first = (edit: (r: Requests['list'][number]) => Requests['list'][number]) =>
      withRequests(([r, ...rest]) => (r ? [edit(r), ...rest] : rest));
    expect(first((r) => ({ ...r, text: 'request.nobody' }))).toThrow(
      /request req\.\w+ uses missing string "request\.nobody"/,
    );
    expect(first((r) => ({ ...r, to: r.from }))).toThrow(/asks for souls sent where they already belong/);
    expect(first((r) => ({ ...r, until: r.since }))).toThrow(/stops before it starts/);
    expect(withRequests((list) => [...list, ...list.slice(0, 1)])).toThrow(/Duplicate request "req\.\w+"/);
  }, 60_000);
});

// docs/tech-spec.md §43.
describe('the gods’ favours, as content', () => {
  const withFavours = (change: (list: Favours) => Favours) =>
    compileWith((c) => ({ ...c, favours: change(c.favours ?? []) }));
  it('compiles as shipped, and refuses words that are missing or a favour named twice', () => {
    expect(withFavours((list) => list)).not.toThrow();
    expect(withFavours(([f, ...rest]) => (f ? [{ ...f, text: 'favour.nobody' }, ...rest] : rest))).toThrow(
      /favour fav\.\w+ uses missing string "favour\.nobody"/,
    );
    expect(withFavours((list) => [...list, ...list.slice(0, 1)])).toThrow(/Duplicate favour "fav\.\w+"/);
  }, 60_000);
});

// docs/tech-spec.md §44.
describe('promotion, as content', () => {
  type Ranks = NonNullable<CampaignPart['promotion']>['ranks'];
  const withRanks = (change: (ranks: Ranks) => Ranks) =>
    compileWith((c) => (c.promotion ? { ...c, promotion: { ...c.promotion, ranks: change(c.promotion.ranks) } } : c));
  it('refuses a rank whose words are missing, or a rank named twice', () => {
    expect(withRanks(([r, ...rest]) => (r ? [{ ...r, name: 'rank.nobody' }, ...rest] : rest))).toThrow(
      /rank rank\.\w+ uses missing string "rank\.nobody"/,
    );
    expect(withRanks((list) => [...list, ...list.slice(0, 1)])).toThrow(/Duplicate rank "rank\.\w+"/);
  }, 60_000);
});
