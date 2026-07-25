import { PrinterAdapterError } from '@print-queue/shared';
import { describe, expect, it } from 'vitest';
import { classifyResponseCode, FlashforgeProtocolError, normalizeFlashforgeError } from './flashforgeErrors.js';

describe('classifyResponseCode', () => {
  it('treats 0 and 200 as success (null reason)', () => {
    expect(classifyResponseCode(0)).toBeNull();
    expect(classifyResponseCode(200)).toBeNull();
  });

  it('maps the documented HTTP API error codes', () => {
    expect(classifyResponseCode(3)).toBe('auth_failed');
    expect(classifyResponseCode(4)).toBe('file_not_found');
    expect(classifyResponseCode(5)).toBe('busy');
  });

  it('falls back to protocol_error for an unmapped code rather than guessing', () => {
    expect(classifyResponseCode(1)).toBe('protocol_error');
    expect(classifyResponseCode(2)).toBe('protocol_error');
    expect(classifyResponseCode(999)).toBe('protocol_error');
  });
});

describe('normalizeFlashforgeError', () => {
  it('maps every FlashforgeErrorReason onto a shared PrinterAdapterErrorCode', () => {
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('unreachable', 'x')).code).toBe('connection_failed');
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('timeout', 'x')).code).toBe('connection_failed');
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('auth_failed', 'x')).code).toBe(
      'authentication_failed',
    );
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('upload_failed', 'x')).code).toBe('upload_failed');
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('upload_unconfirmed', 'x')).code).toBe(
      'upload_failed',
    );
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('start_failed', 'x')).code).toBe('start_failed');
    expect(normalizeFlashforgeError(new FlashforgeProtocolError('unsupported_operation', 'x')).code).toBe(
      'unsupported_operation',
    );
  });

  it('includes the FLASHFORGE_* code in the normalized message for logs/diagnostics', () => {
    const result = normalizeFlashforgeError(new FlashforgeProtocolError('busy', 'printer is mid-print'));
    expect(result.message).toContain('FLASHFORGE_BUSY');
    expect(result.message).toContain('printer is mid-print');
  });

  it('passes an existing PrinterAdapterError through unchanged', () => {
    const original = new PrinterAdapterError('unknown', 'already normalized');
    expect(normalizeFlashforgeError(original)).toBe(original);
  });

  it('wraps a plain Error as an "unknown" adapter error', () => {
    const result = normalizeFlashforgeError(new Error('something unexpected'));
    expect(result.code).toBe('unknown');
    expect(result.message).toBe('something unexpected');
  });
});
