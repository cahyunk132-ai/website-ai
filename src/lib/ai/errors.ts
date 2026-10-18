/**
 * Hyunk AI Hub - Normalized Error Classes
 */

import { ProviderId } from './types';

export class AIProviderError extends Error {
  readonly provider: ProviderId;
  readonly statusCode?: number;
  readonly isRetryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly code: string;

  constructor(
    message: string,
    options: {
      provider: ProviderId;
      statusCode?: number;
      isRetryable?: boolean;
      retryAfterSeconds?: number;
      code?: string;
    }
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.code = options.code ?? 'UNKNOWN_PROVIDER_ERROR';
  }
}

export class QuotaExceededError extends AIProviderError {
  constructor(provider: ProviderId, message = 'Provider quota has been exceeded or exhausted') {
    super(message, {
      provider,
      statusCode: 429,
      isRetryable: false,
      code: 'QUOTA_EXCEEDED',
    });
    this.name = 'QuotaExceededError';
  }
}

export class RateLimitError extends AIProviderError {
  constructor(
    provider: ProviderId,
    retryAfterSeconds = 10,
    message = 'Provider rate limit reached'
  ) {
    super(message, {
      provider,
      statusCode: 429,
      isRetryable: true,
      retryAfterSeconds,
      code: 'RATE_LIMIT_EXCEEDED',
    });
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends AIProviderError {
  constructor(provider: ProviderId, message = 'Invalid or missing API key') {
    super(message, {
      provider,
      statusCode: 401,
      isRetryable: false,
      code: 'AUTHENTICATION_FAILED',
    });
    this.name = 'AuthenticationError';
  }
}

export class ProviderTimeoutError extends AIProviderError {
  constructor(provider: ProviderId, message = 'Request to provider timed out') {
    super(message, {
      provider,
      statusCode: 408,
      isRetryable: true,
      retryAfterSeconds: 5,
      code: 'TIMEOUT',
    });
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderServerError extends AIProviderError {
  constructor(
    provider: ProviderId,
    statusCode = 500,
    message = 'Upstream provider internal server error'
  ) {
    super(message, {
      provider,
      statusCode,
      isRetryable: true,
      retryAfterSeconds: 5,
      code: 'SERVER_ERROR',
    });
    this.name = 'ProviderServerError';
  }
}

export class ModelNotFoundError extends AIProviderError {
  constructor(provider: ProviderId, model: string) {
    super(`Model '${model}' is not supported or not found on provider ${provider}`, {
      provider,
      statusCode: 404,
      isRetryable: false,
      code: 'MODEL_NOT_FOUND',
    });
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Normalizes HTTP status codes and API error payloads into classified AIProviderErrors.
 */
export function normalizeProviderError(
  err: unknown,
  provider: ProviderId,
  statusCode?: number,
  responseHeaders?: Headers
): AIProviderError {
  if (err instanceof AIProviderError) {
    return err;
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lowerMsg = rawMsg.toLowerCase();

  // Parse Retry-After header if provided
  let retryAfterSeconds: number | undefined;
  if (responseHeaders?.has('retry-after')) {
    const parsed = parseInt(responseHeaders.get('retry-after') || '', 10);
    if (!isNaN(parsed) && parsed > 0) {
      retryAfterSeconds = parsed;
    }
  }

  // Quota / Credit exhaustion patterns
  if (
    lowerMsg.includes('quota') ||
    lowerMsg.includes('insufficient_quota') ||
    lowerMsg.includes('balance') ||
    lowerMsg.includes('credit') ||
    lowerMsg.includes('exhausted') ||
    lowerMsg.includes('billing')
  ) {
    return new QuotaExceededError(provider, rawMsg);
  }

  // Rate limit
  if (statusCode === 429 || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    return new RateLimitError(provider, retryAfterSeconds ?? 10, rawMsg);
  }

  // Authentication & Permission
  if (statusCode === 401 || statusCode === 403 || lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid_api_key')) {
    return new AuthenticationError(provider, rawMsg);
  }

  // Timeout
  if (statusCode === 408 || statusCode === 504 || lowerMsg.includes('timeout') || lowerMsg.includes('aborted')) {
    return new ProviderTimeoutError(provider, rawMsg);
  }

  // Server error
  if (statusCode && statusCode >= 500) {
    return new ProviderServerError(provider, statusCode, rawMsg);
  }

  return new AIProviderError(rawMsg, {
    provider,
    statusCode,
    code: 'GENERIC_PROVIDER_ERROR',
  });
}
