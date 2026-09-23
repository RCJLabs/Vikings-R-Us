import { describe, expect, it } from 'vitest';
import { blankComments, checkClientSource, checkEngineSource } from './rules';

const rules = (source: string) => checkEngineSource('x.ts', source).map((v) => `${v.line}:${v.rule}`);

describe('engine purity', () => {
  it('flags nondeterminism and host APIs', () => {
    const found = rules(
      [
        'const a = Math.random();',
        'const b = Math.pow(2, 3);',
        'const c = 2 ** 3;',
        'const d = new Date();',
        "const e = 'a'.localeCompare('b');",
        'const f = window.innerWidth;',
      ].join('\n'),
    );
    expect(found.map((f) => f.split(':')[0])).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('allows integer math and ignores comments', () => {
    expect(rules('/** Date and Math.random in a comment */\nconst x = Math.imul(3, 5) >>> 0; // Math.pow')).toEqual([]);
  });

  it('allows property names that look like globals', () => {
    expect(
      rules(
        'interface A { readonly require?: string[] }\nconst a = { require: [], performance: 1 };\nuse(arch.require);',
      ),
    ).toEqual([]);
    expect(rules("const fs = require('fs');").map((f) => f.split(':')[0])).toEqual(['1']);
  });

  it('allows only relative imports', () => {
    expect(rules("import { a } from './a';\nexport { b } from '../b';")).toEqual([]);
    expect(rules("import { z } from 'zod';")).toEqual(['1:engine may only import its own files (found "zod")']);
  });

  it('keeps line numbers when blanking comments', () => {
    expect(blankComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
  });
});

describe('client boundaries', () => {
  it('blocks direct content imports and Node-only modules', () => {
    const found = checkClientSource(
      'ui.ts',
      [
        "import m from '../../generated/web-demo/manifest.json';",
        "import s from 'content/packs/core/strings/en.json';",
        "import { readFileSync } from 'node:fs';",
        "import { manifest } from 'virtual:content';",
      ].join('\n'),
    );
    expect(found.map((v) => v.line)).toEqual([1, 2, 3]);
  });
});
