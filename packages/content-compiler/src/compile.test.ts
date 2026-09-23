import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TARGETS } from '@cots/content-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentError, compileTarget, loadPacks, writeLeakTokens } from './compile';

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

type PackFixture = { yaml?: string; strings?: Record<string, string>; files?: Record<string, string> };

function fixture(overrides: Record<string, PackFixture> = {}) {
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
  for (const [id, pack] of Object.entries(packs) as [string, PackFixture][]) {
    mkdirSync(join(root, 'packs', id, 'strings'), { recursive: true });
    if (pack.yaml) writeFileSync(join(root, 'packs', id, 'pack.yaml'), pack.yaml);
    writeFileSync(join(root, 'packs', id, 'strings', 'en.json'), JSON.stringify(pack.strings ?? {}));
    for (const [file, text] of Object.entries(pack.files ?? {})) {
      mkdirSync(dirname(join(root, 'packs', id, file)), { recursive: true });
      writeFileSync(join(root, 'packs', id, file), text);
    }
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

describe('gameplay content lints', () => {
  const core = (files: Record<string, string>, strings: Record<string, string> = {}): PackFixture => ({
    yaml: 'id: core\ndependsOn: []\n',
    strings: { 'core.title': 'Chooser', 'rule.hel': 'Hel', 'dest.HEL': 'Hel', ...strings },
    files: {
      'facts.yaml': '- { id: cause, domain: { enum: [battle, sickness] } }\n',
      'rules.yaml': '- { id: rule.hel, order: 999, since: 1, when: { always: true }, then: HEL, text: rule.hel }\n',
      ...files,
    },
  });
  const day = (archetype: string) => ({
    yaml: 'id: demo\ndependsOn: [core]\n',
    strings: { 'demo.days': 'Days 1-3', 'decree.d1': 'Decree' },
    files: {
      'days/day-01.yaml': [
        'day: 1',
        'sunS: 360',
        'decree: decree.d1',
        'queue:',
        '  count: [6, 6]',
        `  archetypes: [{ id: ${archetype}, w: 1 }]`,
        '  mix: { HEL: [100, 100] }',
        '  knobs: { lieRate: 100, maxLies: 1, decoyRate: 0, ravenRate: 0, forgetRate: 0, proofCostS: [0, 20], maxTools: 0, maxDocs: 3, salienceFloor: 2 }',
      ].join('\n'),
    },
  });
  const archetype = (lie: string) =>
    `- { id: arch.liar, since: 1, personas: [braggart], truth: { cause: { is: sickness } }, lies: [${lie}] }\n`;
  const compile = (packs: Record<string, PackFixture>) =>
    compileTarget('web-demo', TARGETS['web-demo'], loadPacks(fixture(packs)), join(root, 'generated'));

  it('compiles consistent content and emits it', () => {
    compile({ core: core({ 'archetypes.yaml': archetype('') }), demo: day('arch.liar') });
    const content = JSON.parse(readFileSync(join(root, 'generated', 'web-demo', 'content.json'), 'utf8'));
    expect(content.days.map((d: { day: number }) => d.day)).toEqual([1]);
    expect(content.facts[0]).toMatchObject({ id: 'cause', domain: { kind: 'enum' }, since: 1, inert: 'battle' });
  });

  it('rejects missing strings, unknown archetypes and unvoiceable lies', () => {
    expect(() =>
      compile({ core: core({ 'archetypes.yaml': archetype('') }), demo: { ...day('arch.nobody') } }),
    ).toThrow(/unknown archetype "arch.nobody"/);
    const lie = '{ fact: cause, claim: battle, p: 90, motive: wantsValhalla, onQuestion: { confess: 1 } }';
    expect(() => compile({ core: core({ 'archetypes.yaml': archetype(lie) }), demo: day('arch.liar') })).toThrow(
      /can't voice its lie cause=battle/,
    );
    const noText = core({
      'rules.yaml': '- { id: rule.hel, order: 999, since: 1, when: { always: true }, then: HEL, text: rule.missing }\n',
    });
    expect(() => compile({ core: noText, demo: day('arch.liar') })).toThrow(/missing string "rule.missing"/);
    // Every sign needs chip text for each value it can show.
    const sign = core({
      'archetypes.yaml': archetype(''),
      'observations.yaml': '- { key: cause, view: front, since: 1, salience: 3, cost: 1, from: { fact: cause } }\n',
    });
    expect(() => compile({ core: sign, demo: day('arch.liar') })).toThrow(/missing string "obs.cause.sickness"/);
  });

  it('rejects strings that are not valid ICU messages', () => {
    expect(() =>
      compile({
        core: core({ 'archetypes.yaml': archetype('') }, { 'core.bad': '{n, plural, one {x}' }),
        demo: day('arch.liar'),
      }),
    ).toThrow(/Invalid ICU message:\n"core.bad"/);
  });

  const dailyPack = (archetype: string): PackFixture => {
    const spec = day(archetype).files['days/day-01.yaml'].replace('decree: decree.d1', 'decree: daily.decree');
    return {
      yaml: 'id: daily\ndependsOn: [core]\n',
      strings: { 'daily.intro': 'Daily', 'daily.decree': 'Everything' },
      files: { 'daily.yaml': spec },
    };
  };

  it('emits the Daily from core and daily packs only, and lints it', () => {
    const demoOnly = {
      ...day('arch.liar'),
      files: { ...day('arch.liar').files, 'archetypes.yaml': archetype('').replace('arch.liar', 'arch.demoOnly') },
    };
    compile({ core: core({ 'archetypes.yaml': archetype('') }), daily: dailyPack('arch.liar'), demo: demoOnly });
    const out = (f: string) => JSON.parse(readFileSync(join(root, 'generated', 'web-demo', f), 'utf8'));
    expect(out('daily.json').daily).toMatchObject({ day: 1, decree: 'daily.decree' });
    expect(out('daily.json').days).toEqual([]);
    expect(out('daily.json').archetypes.map((a: { id: string }) => a.id)).toEqual(['arch.liar']);
    expect(out('content.json').archetypes.map((a: { id: string }) => a.id)).toEqual(['arch.liar', 'arch.demoOnly']);
    expect(() =>
      compile({
        core: core({ 'archetypes.yaml': archetype('') }),
        daily: dailyPack('arch.nobody'),
        demo: day('arch.liar'),
      }),
    ).toThrow(/the Daily \(day 1 mechanics\) uses unknown archetype "arch.nobody"/);
  });

  it('requires the last rule in force to always apply', () => {
    const partial = core({
      'rules.yaml':
        '- { id: rule.hel, order: 999, since: 1, when: { fact: cause, is: sickness }, then: HEL, text: rule.hel }\n',
      'archetypes.yaml': archetype(''),
    });
    expect(() => compile({ core: partial, demo: day('arch.liar') })).toThrow(/last rule in force must always apply/);
  });
});
