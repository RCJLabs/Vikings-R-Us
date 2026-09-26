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

// docs/tech-spec.md §52.
describe('day events, as content', () => {
  type Events = NonNullable<CampaignPart['events']>;
  const withEvents = (change: (events: Events) => Events) =>
    compileWith((c) => (c.events ? { ...c, events: change(c.events) } : c));
  const first = (edit: (e: Events['pool'][number]) => Events['pool'][number]) =>
    withEvents((d) => ({ ...d, pool: d.pool.map((e, i) => (i === 0 ? edit(e) : e)) }));
  it('compiles as shipped, and refuses missing words, an event named twice, or more drawn than there are', () => {
    expect(withEvents((d) => d)).not.toThrow();
    expect(first((e) => ({ ...e, text: 'event.nobody' }))).toThrow(/day event event\.\w+ uses missing string/);
    expect(withEvents((d) => ({ ...d, pool: [...d.pool, ...d.pool.slice(0, 1)] }))).toThrow(
      /Duplicate day event "event\.\w+"/,
    );
    expect(withEvents((d) => ({ ...d, perRun: d.pool.length + 1 }))).toThrow(/draws \d+ day events, from only \d+/);
  }, 60_000);
  it('refuses souls of a kind a day lacks, one bound where its kind never goes, and too short a line', () => {
    const storm = (edit: (e: Events['pool'][number]) => Events['pool'][number]) =>
      withEvents((d) => ({ ...d, pool: d.pool.map((e) => (e.id === 'event.storm' ? edit(e) : e)) }));
    // Days 5-8 have no bedridden souls, and a drowned raider is never Valhalla's.
    expect(storm((e) => ({ ...e, souls: [{ kind: 'arch.bedridden', to: ['TRANSFER'], n: 1 }] }))).toThrow(
      /day event event\.storm: day 5 has no arch\.bedridden bound for TRANSFER/,
    );
    expect(storm((e) => ({ ...e, souls: [{ kind: 'arch.drowned_raider', to: ['VALHALLA'], n: 1 }] }))).toThrow(
      /has no arch\.drowned_raider bound for VALHALLA/,
    );
    expect(storm((e) => ({ ...e, fewer: 9 }))).toThrow(/day event event\.storm leaves day \d+ too short a line/);
  }, 60_000);
});

// docs/tech-spec.md §53.
describe('the Norns’ weave, as content', () => {
  type Weaving = NonNullable<CampaignPart['weaving']>;
  const withWeaving = (change: (w: Weaving) => Weaving) =>
    compileWith((c) => (c.weaving ? { ...c, weaving: change(c.weaving) } : c));
  const first = (edit: (w: Weaving['weaves'][number]) => Weaving['weaves'][number]) =>
    withWeaving((d) => ({ ...d, weaves: d.weaves.map((w, i) => (i === 0 ? edit(w) : w)) }));
  it('compiles as shipped, and refuses missing words, an unknown ending or rule, and a weave named twice', () => {
    expect(withWeaving((d) => d)).not.toThrow();
    expect(first((w) => ({ ...w, name: 'weave.nobody' }))).toThrow(/weave weave\.\w+ uses missing string/);
    expect(withWeaving((d) => ({ ...d, after: ['ending.nowhere'] }))).toThrow(/opens after "ending\.nowhere"/);
    expect(first((w) => ({ ...w, order: { 'rule.nothing': 10 } }))).toThrow(/moves unknown rule "rule\.nothing"/);
    expect(withWeaving((d) => ({ ...d, weaves: [...d.weaves, ...d.weaves.slice(0, 1)] }))).toThrow(
      /Duplicate weave "weave\.\w+"/,
    );
  }, 60_000);
  it('refuses a weave that changes no day, one that leaves no catch-all last, and souls it can’t bring', () => {
    // Rán's rule moved to where it already is changes nothing.
    expect(first((w) => ({ ...w, order: { 'rule.ran': 500 }, souls: [] }))).toThrow(/weave weave\.\w+ changes no day/);
    // Hel's catch-all read before Valhalla's is no catch-all.
    expect(first((w) => ({ ...w, order: { 'rule.hel': 650 }, souls: [] }))).toThrow(
      /the last rule read doesn't always apply/,
    );
    // Drowned raiders are never Odin's.
    expect(first((w) => ({ ...w, souls: [{ kind: 'arch.drowned_raider', to: ['VALHALLA'], n: 1 }] }))).toThrow(
      /has no arch\.drowned_raider bound for VALHALLA/,
    );
  }, 60_000);
});
