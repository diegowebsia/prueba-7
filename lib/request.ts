export class PayloadTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`El cuerpo supera ${limitBytes} bytes.`);
    this.name = 'PayloadTooLargeError';
  }
}

/** Lee el stream con un límite real; no confía únicamente en Content-Length. */
export async function readTextLimited(req: Request, limitBytes = 64 * 1024): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > limitBytes) throw new PayloadTooLargeError(limitBytes);
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limitBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readJsonLimited(req: Request, limitBytes = 64 * 1024): Promise<unknown> {
  const raw = await readTextLimited(req, limitBytes);
  return JSON.parse(raw || '{}');
}

export function payloadErrorResponse(error: unknown): Response | null {
  if (error instanceof PayloadTooLargeError) {
    return Response.json({ error: 'Cuerpo de petición demasiado grande.' }, { status: 413 });
  }
  return null;
}
