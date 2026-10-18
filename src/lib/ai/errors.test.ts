import { describe, it, expect } from 'vitest';
import {
  normalizeProviderError,
  QuotaExceededError,
  RateLimitError,
  AuthenticationError,
  ProviderTimeoutError,
  ProviderServerError,
} from './errors';

describe('Error Normalization', () => {
  it('normalizes 429 quota exhaustion', () => {
    const error = normalizeProviderError('You exceeded your current quota, please check your plan and billing details.', 'radox', 429);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error.code).toBe('QUOTA_EXCEEDED');
    expect(error.provider).toBe('radox');
  });

  it('normalizes 429 rate limit with retry-after header', () => {
    const headers = new Headers();
    headers.set('retry-after', '15');
    const error = normalizeProviderError('Too many requests', 'inkstone', 429, headers);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(15);
    expect(error.isRetryable).toBe(true);
  });

  it('normalizes 401 authentication errors', () => {
    const error = normalizeProviderError('Invalid API key provided', 'inkstone', 401);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.code).toBe('AUTHENTICATION_FAILED');
  });

  it('normalizes timeout errors', () => {
    const error = normalizeProviderError('Request timed out', 'radox', 408);
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(error.isRetryable).toBe(true);
  });

  it('normalizes 500 server errors', () => {
    const error = normalizeProviderError('Internal Server Error', 'inkstone', 500);
    expect(error).toBeInstanceOf(ProviderServerError);
    expect(error.isRetryable).toBe(true);
  });
});
