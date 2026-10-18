import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, maskApiKey, redactSecrets } from './crypto';

describe('Crypto Utilities', () => {
  it('encrypts and decrypts secrets with AES-256-GCM', () => {
    const rawSecret = 'sk-radox-test-api-key-1234567890';
    const encrypted = encryptSecret(rawSecret);

    expect(encrypted).not.toBe(rawSecret);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(rawSecret);
  });

  it('masks API keys securely', () => {
    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-1****cdef');
    expect(maskApiKey(null)).toBe('Not Configured');
    expect(maskApiKey('short')).toBe('****');
  });

  it('redacts sensitive auth headers and keys from logs', () => {
    const logLine = 'Error: Bearer sk-secretkey123456789012345 failed with status 401';
    const redacted = redactSecrets(logLine);

    expect(redacted).not.toContain('sk-secretkey123456789012345');
    expect(redacted).toContain('[REDACTED]');
  });
});
