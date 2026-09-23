import { describe, expect, it } from 'vitest';
import { endpoint } from './telemetry';

describe('telemetry endpoints', () => {
  it('keeps any path in the configured base URL', () => {
    expect(endpoint('https://t.example.workers.dev', '/v1/shift')).toBe('https://t.example.workers.dev/v1/shift');
    expect(endpoint('https://t.example.workers.dev/', '/v1/shift')).toBe('https://t.example.workers.dev/v1/shift');
    expect(endpoint('https://example.com/cots/telemetry/', '/v1/guard')).toBe(
      'https://example.com/cots/telemetry/v1/guard',
    );
  });
});
