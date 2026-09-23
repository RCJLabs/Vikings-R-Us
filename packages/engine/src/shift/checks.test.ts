import { loadDailyContent } from '@cots/testkit';
import { describe, expect, it } from 'vitest';
import { buildDailyChecks, dailyChecksum, expectedChecksum, guardDaily } from './checks';

const content = loadDailyContent();

describe('the Daily checksum guard', () => {
  const checks = buildDailyChecks(content, -2, 3);

  it('packs one checksum per Daily in the range', () => {
    expect(checks).toMatchObject({ g: content.genVersion, from: -2 });
    expect(checks.hashes).toHaveLength(6 * 8);
    for (let n = -2; n <= 3; n++)
      expect(expectedChecksum(checks, n, content.genVersion)).toBe(dailyChecksum(content, n));
  });

  it('passes the Daily this device generates, and flags one that differs', () => {
    expect(guardDaily(checks, 2, content.genVersion, dailyChecksum(content, 2))).toBe('ok');
    expect(guardDaily(checks, 2, content.genVersion, dailyChecksum(content, 3))).toBe('mismatch');
  });

  it('says unchecked outside the table or for another generator version', () => {
    expect(guardDaily(checks, 4, content.genVersion, 'deadbeef')).toBe('unchecked');
    expect(guardDaily(checks, -3, content.genVersion, 'deadbeef')).toBe('unchecked');
    expect(guardDaily(checks, 1, content.genVersion + 1, 'deadbeef')).toBe('unchecked');
    expect(guardDaily(null, 1, content.genVersion, 'deadbeef')).toBe('unchecked');
  });

  it('matches the pinned golden checksums', async () => {
    const golden = (await import('../../../../tests/golden/dailies.json', { with: { type: 'json' } }))
      .default as unknown as Record<string, string>;
    const table = buildDailyChecks(content, 1, 5);
    for (let n = 1; n <= 5; n++) expect(expectedChecksum(table, n, content.genVersion)).toBe(golden[`#${n}`]);
  });
});
