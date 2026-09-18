const DEFAULT_TIMEOUT_MS = 10_000;

/** fetch con timeout obligatorio, señal externa y reintentos solo para operaciones idempotentes. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, signal, ...requestInit } = init;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('HTTP request timeout')), timeoutMs);
    try {
      const response = await fetch(input, { ...requestInit, signal: controller.signal });
      if (response.status < 500 || attempt === retries) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
  }
  throw lastError;
}
