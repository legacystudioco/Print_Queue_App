import { describe, expect, it } from 'vitest';
import {
  classifyBambuConnectionError,
  healthCheckMessageFor,
  normalizeBambuConnectionError,
} from './errors.js';

function mqttReasonError(message: string, code: number): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

function systemError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('classifyBambuConnectionError', () => {
  it('classifies "Bad username or password" CONNACK codes as invalid_access_code', () => {
    expect(classifyBambuConnectionError(mqttReasonError('Connection refused: Bad username or password', 4))).toBe(
      'invalid_access_code',
    );
    expect(
      classifyBambuConnectionError(mqttReasonError('Connection refused: Bad User Name or Password', 134)),
    ).toBe('invalid_access_code');
  });

  it('classifies "Not authorized" CONNACK codes as authentication_failed', () => {
    expect(classifyBambuConnectionError(mqttReasonError('Connection refused: Not authorized', 5))).toBe(
      'authentication_failed',
    );
    expect(classifyBambuConnectionError(mqttReasonError('Connection refused: Not authorized', 135))).toBe(
      'authentication_failed',
    );
  });

  it('classifies unreachable-host system errors as connection_failed', () => {
    for (const code of ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ENOTFOUND']) {
      expect(classifyBambuConnectionError(systemError('boom', code))).toBe('connection_failed');
    }
  });

  it('falls back to connection_failed for unrecognized errors rather than guessing', () => {
    expect(classifyBambuConnectionError(new Error('something weird'))).toBe('connection_failed');
    expect(classifyBambuConnectionError('a string, not an Error')).toBe('connection_failed');
    expect(classifyBambuConnectionError(null)).toBe('connection_failed');
  });

  it('falls back to connection_failed for an unmapped numeric reason code', () => {
    expect(classifyBambuConnectionError(mqttReasonError('Connection refused: Server unavailable', 3))).toBe(
      'connection_failed',
    );
  });
});

describe('healthCheckMessageFor', () => {
  it('matches the exact required health-check wording', () => {
    expect(healthCheckMessageFor('connection_failed')).toBe('Cannot reach printer');
    expect(healthCheckMessageFor('invalid_access_code')).toBe('Invalid access code');
    expect(healthCheckMessageFor('authentication_failed')).toBe('Authentication failed');
  });
});

describe('normalizeBambuConnectionError', () => {
  it('produces a PrinterAdapterError carrying the classified code', () => {
    const result = normalizeBambuConnectionError(mqttReasonError('Connection refused: Bad username or password', 4));
    expect(result.code).toBe('invalid_access_code');
    expect(result.message).toContain('Invalid access code');
  });
});
