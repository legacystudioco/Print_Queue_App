import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Logger } from '../../logger.js';
import { classifyResponseCode, FlashforgeProtocolError, type FlashforgeErrorReason } from './flashforgeErrors.js';
import type {
  FlashforgeDetail,
  FlashforgeDetailResponse,
  FlashforgeGcodeListResponse,
  FlashforgeJobControlAction,
} from './flashforgeTypes.js';

export interface FlashforgeLanClientConfig {
  host: string;
  port: number;
  serialNumber: string;
  checkCode: string;
  requestTimeoutMs: number;
  uploadTimeoutMs: number;
}

/**
 * Extra fields required by firmware >= 3.1.3's "modern" /printGcode and
 * /uploadGcode payloads (see flashforgeTypes.ts firmware-compatibility
 * note) for a plain single-color, non-material-station print — sent
 * disabled/empty exactly as documented for that case.
 */
const MODERN_PRINT_EXTRAS = {
  flowCalibration: false,
  useMatlStation: false,
  gcodeToolCnt: 0,
  materialMappings: [] as string[],
};

/** base64("[]") — the modern /uploadGcode header equivalent of MODERN_PRINT_EXTRAS.materialMappings. */
const EMPTY_MATERIAL_MAPPINGS_HEADER = 'W10=';

/**
 * Hard cap on how many response bytes this client will read before parsing
 * as JSON. Every documented response from this printer (status, control
 * ack, file list) is small JSON; this exists purely as a safety bound
 * against a malfunctioning device (or a MITM on the LAN) sending an
 * unbounded body, not because any real response is expected to be large.
 */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Response `message` fields are printer-supplied text that ends up in error messages/logs — bounded so a malformed one can't bloat logs. */
const MAX_MESSAGE_LENGTH = 500;

/** True if `value` contains a C0 control character (codepoint 0-31) or DEL (127). Written via charCodeAt rather than a regex to avoid embedding raw control bytes in source. */
function containsControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/** Rejects anything that isn't a plain filename — no path separators, no traversal, no control characters. Defense in depth; the adapter layer also sanitizes before calling here. */
function assertSafeRemoteFileName(remoteFileName: string): void {
  if (
    !remoteFileName ||
    remoteFileName.includes('/') ||
    remoteFileName.includes('\\') ||
    remoteFileName.includes('..') ||
    containsControlCharacter(remoteFileName)
  ) {
    throw new FlashforgeProtocolError('protocol_error', `Unsafe remote file name: ${JSON.stringify(remoteFileName)}`);
  }
}

/**
 * Low-level HTTP client for the Flashforge Adventurer 5M / 5M Pro LAN REST
 * API (port 8898 only — TCP port 8899 is not used; see docs/flashforge-integration.md
 * for why the documented HTTP surface is sufficient for every operation this
 * bridge needs). Owns connection details, auth, request/response shapes,
 * timeouts, retries-at-the-transport-error level, upload streaming, and
 * protocol error translation. Never contains Print Queue lifecycle logic —
 * that belongs in FlashforgePrinterAdapter.
 *
 * Protocol source: see the header comment in flashforgeTypes.ts.
 */
export class FlashforgeLanClient {
  constructor(
    private readonly config: FlashforgeLanClientConfig,
    private readonly logger: Logger,
  ) {}

  private baseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  private credentials(): Record<string, unknown> {
    return { serialNumber: this.config.serialNumber, checkCode: this.config.checkCode };
  }

  /** Never let a checkCode reach a log line — this is the only place request bodies get logged. */
  private redactedForLog(body: Record<string, unknown>): Record<string, unknown> {
    const { checkCode: _checkCode, ...rest } = body;
    return rest;
  }

  async detail(): Promise<FlashforgeDetail> {
    const response = await this.postJson<FlashforgeDetailResponse>('/detail', this.credentials());
    return response.detail;
  }

  async gcodeList(): Promise<string[]> {
    const response = await this.postJson<FlashforgeGcodeListResponse>('/gcodeList', this.credentials());
    return response.gcodeList ?? [];
  }

  /** Starts an already-uploaded file by exact name. Never uploads. */
  async printGcode(fileName: string, levelingBeforePrint: boolean): Promise<void> {
    assertSafeRemoteFileName(fileName);
    await this.postJson(
      '/printGcode',
      { ...this.credentials(), fileName, levelingBeforePrint, ...MODERN_PRINT_EXTRAS },
      { fallbackReason: 'start_failed' },
    );
  }

  async pauseJob(): Promise<void> {
    await this.jobControl('pause');
  }

  async resumeJob(): Promise<void> {
    await this.jobControl('continue');
  }

  async cancelJob(): Promise<void> {
    await this.jobControl('cancel');
  }

  private async jobControl(action: FlashforgeJobControlAction): Promise<void> {
    await this.postJson('/control', {
      ...this.credentials(),
      payload: { cmd: 'jobCtl_cmd', args: { jobID: '', action } },
    });
  }

  /**
   * Streams a local file to /uploadGcode with `printNow: "false"` — this
   * client never starts a print as part of uploading; that is always a
   * separate printGcode() call, matching how uploadPrintFile/startPrint are
   * kept as distinct steps on the shared PrinterAdapter interface.
   *
   * Uses `fs.openAsBlob` so the file is streamed by undici's fetch/FormData
   * implementation rather than read fully into memory — important for
   * large sliced-plate .gcode files.
   */
  async uploadGcode(localFilePath: string, remoteFileName: string, levelingBeforePrint: boolean): Promise<void> {
    assertSafeRemoteFileName(remoteFileName);
    const stats = await stat(localFilePath);
    const blob = await openAsBlob(localFilePath, { type: 'application/octet-stream' });

    const form = new FormData();
    form.append('gcodeFile', blob, remoteFileName);

    // `fileSize` here is the protocol-documented metadata header the printer
    // reads from the request (distinct from the HTTP `Content-Length`
    // header itself). We never set Content-Length manually — undici's
    // fetch computes it correctly from the FormData body since the Blob's
    // `.size` (from openAsBlob, backed by the real file size on disk) is
    // known upfront, so it doesn't need to fall back to chunked encoding.
    const headers: Record<string, string> = {
      serialNumber: this.config.serialNumber,
      checkCode: this.config.checkCode,
      fileSize: String(stats.size),
      printNow: 'false',
      levelingBeforePrint: String(levelingBeforePrint),
      flowCalibration: 'false',
      useMatlStation: 'false',
      gcodeToolCnt: '0',
      materialMappings: EMPTY_MATERIAL_MAPPINGS_HEADER,
    };

    await this.request('/uploadGcode', {
      method: 'POST',
      headers,
      body: form,
      timeoutMs: this.config.uploadTimeoutMs,
      fallbackReason: 'upload_failed',
    });
  }

  private async postJson<T>(
    endpoint: string,
    body: Record<string, unknown>,
    options: { timeoutMs?: number; fallbackReason?: FlashforgeErrorReason } = {},
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: options.timeoutMs,
      fallbackReason: options.fallbackReason,
      logBody: body,
    });
  }

  private async request<T>(
    endpoint: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body: FormData | string;
      timeoutMs?: number;
      fallbackReason?: FlashforgeErrorReason;
      logBody?: Record<string, unknown>;
    },
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    this.logger.debug('Flashforge request', {
      endpoint,
      ...(options.logBody ? { body: this.redactedForLog(options.logBody) } : {}),
    });

    try {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl()}${endpoint}`, {
          method: options.method,
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
          // This client only ever talks to a fixed local IP:port it was
          // configured with — a redirect response is never legitimate here
          // (could otherwise be used to exfiltrate credentials to a
          // different host). Reject rather than follow.
          redirect: 'error',
        });
      } catch (err) {
        throw this.toTransportError(err, endpoint);
      }

      const bodyText = await this.readBodyWithLimit(response, endpoint, options.fallbackReason);

      let json: unknown;
      try {
        json = JSON.parse(bodyText);
      } catch (err) {
        throw new FlashforgeProtocolError(
          options.fallbackReason ?? 'protocol_error',
          `Malformed (non-JSON) response from ${endpoint}`,
          err,
        );
      }

      this.checkEnvelope(json, endpoint, options.fallbackReason);
      return json as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Reads the response body up to MAX_RESPONSE_BYTES, rejecting (without
   * buffering further) if it's exceeded — a bound against a malfunctioning
   * or malicious device on the LAN sending an unbounded body, since every
   * real response from this printer is small JSON.
   */
  private async readBodyWithLimit(
    response: Response,
    endpoint: string,
    fallbackReason: FlashforgeErrorReason | undefined,
  ): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new FlashforgeProtocolError(
        fallbackReason ?? 'protocol_error',
        `Response from ${endpoint} declared ${declaredLength} bytes, exceeding the ${MAX_RESPONSE_BYTES}-byte limit`,
      );
    }

    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          throw new FlashforgeProtocolError(
            fallbackReason ?? 'protocol_error',
            `Response from ${endpoint} exceeded the ${MAX_RESPONSE_BYTES}-byte limit`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  private checkEnvelope(json: unknown, endpoint: string, fallbackReason: FlashforgeErrorReason = 'protocol_error'): void {
    if (!json || typeof json !== 'object' || !('code' in json)) {
      throw new FlashforgeProtocolError(fallbackReason, `Unexpected response shape from ${endpoint}`);
    }

    const envelope = json as unknown as { code: unknown; message?: unknown };
    const code = Number(envelope.code);
    const rawMessage = typeof envelope.message === 'string' ? envelope.message : '';
    const message = rawMessage.length > MAX_MESSAGE_LENGTH ? `${rawMessage.slice(0, MAX_MESSAGE_LENGTH)}…` : rawMessage;
    const reason = classifyResponseCode(code);
    if (!reason) return;

    // Auth/not-found/busy are always meaningful regardless of endpoint; a
    // bare "protocol_error" gets replaced by the caller's more specific
    // fallback (e.g. upload_failed for /uploadGcode, start_failed for
    // /printGcode) so the surfaced error names the operation that failed.
    const finalReason = reason === 'protocol_error' ? fallbackReason : reason;
    throw new FlashforgeProtocolError(finalReason, `${endpoint} rejected: ${message || `code ${code}`}`);
  }

  private toTransportError(err: unknown, endpoint: string): FlashforgeProtocolError {
    if (err instanceof FlashforgeProtocolError) return err;
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: unknown }).name === 'AbortError') {
      return new FlashforgeProtocolError('timeout', `Timed out contacting ${endpoint}`, err);
    }
    return new FlashforgeProtocolError('unreachable', `Could not reach printer for ${endpoint}`, err);
  }
}
