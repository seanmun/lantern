export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reset?: Date;
}

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public rateLimitInfo?: RateLimitInfo
  ) {
    super(message);
    this.name = 'APIError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: any, retryableStatuses: number[]): boolean {
  if (!error.status) return true;

  if (error.status === 429) return true;

  if (error.status >= 500) return true;

  return retryableStatuses.includes(error.status);
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const rateLimitInfo: RateLimitInfo = {
    isRateLimited: false
  };

  const retryAfter = headers.get('Retry-After');
  if (retryAfter) {
    rateLimitInfo.isRateLimited = true;
    rateLimitInfo.retryAfter = isNaN(Number(retryAfter))
      ? new Date(retryAfter).getTime() - Date.now()
      : Number(retryAfter) * 1000;
  }

  const limit = headers.get('X-RateLimit-Limit');
  if (limit) rateLimitInfo.limit = Number(limit);

  const remaining = headers.get('X-RateLimit-Remaining');
  if (remaining) rateLimitInfo.remaining = Number(remaining);

  const reset = headers.get('X-RateLimit-Reset');
  if (reset) rateLimitInfo.reset = new Date(Number(reset) * 1000);

  if (rateLimitInfo.remaining === 0) {
    rateLimitInfo.isRateLimited = true;
  }

  return rateLimitInfo;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    retryableStatuses = [408, 425, 429, 500, 502, 503, 504],
    onRetry
  } = retryOptions;

  let lastError: Error | null = null;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const rateLimitInfo = parseRateLimitHeaders(response.headers);

      if (response.ok) {
        return response;
      }

      if (response.status === 429 || rateLimitInfo.isRateLimited) {
        const waitTime = rateLimitInfo.retryAfter || currentDelay;

        if (attempt < maxRetries) {
          if (onRetry) {
            onRetry(attempt + 1, new Error(`Rate limited: ${response.statusText}`), waitTime);
          }
          await delay(Math.min(waitTime, maxDelay));
          currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
          continue;
        }

        throw new APIError(
          'Rate limit exceeded',
          429,
          'RATE_LIMITED',
          rateLimitInfo
        );
      }

      if (!isRetryableError({ status: response.status }, retryableStatuses) || attempt === maxRetries) {
        throw new APIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR'
        );
      }

      lastError = new APIError(`HTTP ${response.status}: ${response.statusText}`, response.status);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        lastError = new APIError('Request timeout', undefined, 'TIMEOUT');
      } else {
        lastError = error;
      }

      if (attempt === maxRetries) {
        throw lastError;
      }
    }

    if (onRetry && lastError) {
      onRetry(attempt + 1, lastError, currentDelay);
    }

    await delay(currentDelay);
    currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
  }

  throw lastError || new Error('Failed after retries');
}

export function createAPIClient(baseURL: string, defaultHeaders: Record<string, string> = {}) {
  return {
    async get(endpoint: string, retryOptions?: RetryOptions): Promise<any> {
      const response = await fetchWithRetry(
        `${baseURL}${endpoint}`,
        {
          method: 'GET',
          headers: defaultHeaders
        },
        retryOptions
      );
      return response.json();
    },

    async post(endpoint: string, body: any, retryOptions?: RetryOptions): Promise<any> {
      const response = await fetchWithRetry(
        `${baseURL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            ...defaultHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        },
        retryOptions
      );
      return response.json();
    }
  };
}