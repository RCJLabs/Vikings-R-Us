import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TARGETS } from '@cots/content-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentError, compileTarget, loadPacks, writeLeakTokens } from './compile';

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fixture(overrides: Record<string, { yaml?: string; strings?: Record<string, string> }> = {}) {
  root = mkdtempSync(join(tmpdir(), 'cots-content-'));
  const packs = {
    core: { yaml: 'id: core\ndependsOn: []\n', strings: { 'core.title': 'Chooser' } },
    daily: { yaml: 'id: daily\ndependsOn: [core]\n', strings: { 'daily.intro': 'Daily' } },
    demo: { yaml: 'id: demo\ndependsOn: [core]\n', strings: { 'demo.days': 'Days 1-3' } },
    campaign: {
      yaml: 'id: campaign\ndependsOn: [core, demo]\ncanary: test-canary-campaign-0001\n',
      strings: { 'campaign.days': 'Days 4-20' },
    },
    ...overrides,
  };
  for (const [id, pack] of Object.entries(packs)) {
    mkdirSync(join(root, 'packs', id, 'strings'), { recursive: true });
    if (pack.yaml) writeFileSync(join(root, 'packs', id, 'pack.yaml'), pack.yaml);
    writeFileSync(join(root, 'packs', id, 'strings', 'en.json'), JSON.stringify(pack.strings ?? {}));
  }
  return join(root, 'packs');
}

describe('content compiler', () => {
  it('ships campaign content only in full targets', () => {
    const packs = loadPacks(fixture());
    const out = join(root, 'generated');
    compileTarget('web-demo', TARGETS['web-demo'], packs, out);
    compileTarget('electron-full', TARGETS['electron-full'], packs, out);

    const demo = readFileSync(join(out, 'web-demo', 'index.ts'), 'utf8');
    expect(demo).not.toContain('campaign');
    expect(readFileSync(join(out, 'web-demo', 'manifest.json'), 'utf8')).not.toContain('test-canary');

    const full = JSON.parse(readFileSync(join(out, 'electron-full', 'manifest.json'), 'utf8'));
    expect(full.packs).toEqual(['core', 'daily', 'demo', 'campaign']);
    expect(full.canaries).toEqual(['test-canary-campaign-0001']);
  });

  it('writes leak tokens with the canary first', () => {
    const packs = loadPacks(fixture());
    writeLeakTokens(packs, join(root, 'generated'));
    const tokens = JSON.parse(readFileSync(join(root, 'generated', 'leak', 'campaign.tokens.json'), 'utf8'));
    expect(tokens).toEqual({
      pack: 'campaign',
      canary: 'test-canary-campaign-0001',
      tokens: ['test-canary-campaign-0001', 'campaign.days'],
    });
  });

  it('rejects a demo pack that depends on the campaign', () => {
    const dir = fixture({ demo: { yaml: 'id: demo\ndependsOn: [core, campaign]\n' } });
    expect(() => loadPacks(dir)).toThrow(/may not depend on "campaign"/);
  });

  it('rejects the same string key in two packs', () => {
    const dir = fixture({ daily: { yaml: 'id: daily\ndependsOn: [core]\n', strings: { 'core.title': 'x' } } });
    expect(() => loadPacks(dir)).toThrow(/defined in both/);
  });

  it('requires a campaign canary', () => {
    const dir = fixture({ campaign: { yaml: 'id: campaign\ndependsOn: [core, demo]\n' } });
    expect(() => loadPacks(dir)).toThrow(/needs a canary/);
  });

  it('refuses a demo target that includes a canary pack', () => {
    const packs = loadPacks(fixture());
    const leaky = { ...TARGETS['web-demo'], packs: ['core', 'demo', 'campaign'] as const };
    expect(() => compileTarget('leaky', leaky, packs, join(root, 'generated'))).toThrow(ContentError);
  });

  it('reports duplicate YAML keys and unknown fields', () => {
    expect(() => loadPacks(fixture({ core: { yaml: 'id: core\nid: core\ndependsOn: []\n' } }))).toThrow(ContentError);
    expect(() => loadPacks(fixture({ core: { yaml: 'id: core\ndependsOn: []\nextra: 1\n' } }))).toThrow(ContentError);
  });
});
