/**
 * Hyunk AI Hub - Cryptographic and Secret Masking Utilities
 * Uses AES-256-GCM for authenticated encryption at rest.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte Buffer key from the APP_ENCRYPTION_KEY environment variable.
 * If not set or invalid length, creates a deterministic fallback key based on process info for dev.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.APP_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    }
    // If provided as raw string, hash it with SHA-256 to ensure exact 32 bytes
    return crypto.createHash('sha256').update(envKey).digest();
  }
  // Fallback for initial development mode (logged as warning in server console)
  const defaultSalt = 'hyunk-ai-hub-fallback-salt-2026';
  return crypto.createHash('sha256').update(defaultSalt).digest();
}

/**
 * Encrypts a plaintext secret string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  // Check if string is formatted as iv:authTag:ciphertext
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    // Might be unencrypted plaintext (legacy/dev)
    return encryptedPayload;
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks an API key for safe display in UI or logs.
 * Example: 'sk-1234567890abcdef' -> 'sk-****cdef'
 */
export function maskApiKey(key?: string | null): string {
  if (!key) return 'Not Configured';
  if (key.length <= 8) return '****';
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}****${suffix}`;
}

/**
 * Redacts known sensitive patterns (API keys, Authorization headers) from strings or logs.
 */
export function redactSecrets(input: string): string {
  if (!input) return '';
  return input
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/(sk-[A-Za-z0-9]{20,})/gi, '[REDACTED_KEY]')
    .replace(/(cc_[A-Za-z0-9]{20,})/gi, '[REDACTED_KEY]');
}
