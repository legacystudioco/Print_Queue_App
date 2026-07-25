import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger, type Logger } from '../../logger.js';
import { FlashforgeLanClient, type FlashforgeLanClientConfig } from './FlashforgeLanClient.js';
import { FlashforgeProtocolError } from './flashforgeErrors.js';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

/** Minimal local HTTP fixture standing in for the Adventurer 5M's :8898 API — never calls a real printer. */
async function startFakeServer(handler: Handler): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind fake server');

  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function jsonHandler(status: number, body: unknown): Handler {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
}

let logged: { fields?: Record<string, unknown> }[] = [];
function makeLogger(): Logger {
  const base = createLogger('debug');
  logged = [];
  return {
    ...base,
    debug: (message, fields) => {
      logged.push({ fields });
    },
  };
}

function clientFor(port: number, overrides: Partial<FlashforgeLanClientConfig> = {}) {
  return new FlashforgeLanClient(
    {
      host: '127.0.0.1',
      port,
      serialNumber: 'SNTEST0000000',
      checkCode: 'super-secret-check-code',
      requestTimeoutMs: 1000,
      uploadTimeoutMs: 2000,
      ...overrides,
    },
    makeLogger(),
  );
}

describe('FlashforgeLanClient', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('parses a successful /detail response', async () => {
    const server = await startFakeServer(
      jsonHandler(200, { code: 0, message: 'Success', detail: { status: 'ready', printProgress: 0 } }),
    );
    close = server.close;

    const client = clientFor(server.port);
    const detail = await client.detail();
    expect(detail.status).toBe('ready');
  });

  it('throws auth_failed on code 3 (unauthorized)', async () => {
    const server = await startFakeServer(jsonHandler(200, { code: 3, message: 'Unauthorized' }));
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toMatchObject({ reason: 'auth_failed' });
  });

  it('throws busy on code 5', async () => {
    const server = await startFakeServer(jsonHandler(200, { code: 5, message: 'Busy' }));
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.pauseJob()).rejects.toMatchObject({ reason: 'busy' });
  });

  it('throws file_not_found on code 4', async () => {
    const server = await startFakeServer(jsonHandler(200, { code: 4, message: 'Not found' }));
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.gcodeList()).rejects.toMatchObject({ reason: 'file_not_found' });
  });

  it('times out and reports the timeout reason, not unreachable', async () => {
    const server = await startFakeServer((_req, res) => {
      // Never respond within the client's timeout.
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, message: 'Success', detail: { status: 'ready' } }));
      }, 5000);
    });
    close = server.close;

    const client = clientFor(server.port, { requestTimeoutMs: 100 });
    await expect(client.detail()).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('reports unreachable when nothing is listening on the port', async () => {
    const client = clientFor(1); // port 1 — nothing listens here
    await expect(client.detail()).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('throws a protocol_error (via the endpoint fallback) on a malformed (non-JSON) response', async () => {
    const server = await startFakeServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json{{{');
    });
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toBeInstanceOf(FlashforgeProtocolError);
  });

  it('a failed call can be retried and can succeed on the next attempt (no corrupted client state)', async () => {
    let calls = 0;
    const server = await startFakeServer((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 5, message: 'Busy' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 0, message: 'Success', detail: { status: 'ready' } }));
    });
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toMatchObject({ reason: 'busy' });
    const detail = await client.detail();
    expect(detail.status).toBe('ready');
    expect(calls).toBe(2);
  });

  it('never logs the checkCode', async () => {
    const server = await startFakeServer(jsonHandler(200, { code: 0, message: 'Success', detail: { status: 'ready' } }));
    close = server.close;

    const client = clientFor(server.port);
    await client.detail();

    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('super-secret-check-code');
  });

  it('rejects a redirect response instead of following it to another host', async () => {
    const server = await startFakeServer((_req, res) => {
      res.writeHead(302, { location: 'http://evil.example.com/steal' });
      res.end();
    });
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toBeInstanceOf(FlashforgeProtocolError);
  });

  it('rejects a response body larger than the configured limit', async () => {
    const server = await startFakeServer((_req, res) => {
      const huge = JSON.stringify({ code: 0, message: 'x'.repeat(3 * 1024 * 1024), detail: { status: 'ready' } });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(huge);
    });
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toThrow(/exceed/i);
  });

  it('rejects a response whose declared Content-Length exceeds the limit, without reading the body', async () => {
    const server = await startFakeServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) });
      // Deliberately never actually sends 10MB — if the client tried to
      // read up to the declared length it would hang; it must reject based
      // on the header alone.
      res.end('{}');
    });
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.detail()).rejects.toThrow(/exceed/i);
  });

  it('truncates an oversized "message" field before it reaches an error/log', async () => {
    const hugeMessage = 'x'.repeat(10_000);
    const server = await startFakeServer(jsonHandler(200, { code: 5, message: hugeMessage }));
    close = server.close;

    const client = clientFor(server.port);
    await expect(client.pauseJob()).rejects.toMatchObject({
      message: expect.stringMatching(/^.{0,600}$/),
    });
  });

  it.each(['../../etc/passwd', '../escaped.gcode', 'nested/traversal.gcode'])(
    'rejects an unsafe remote file name for printGcode: %s',
    async (unsafeName) => {
      const client = clientFor(1);
      await expect(client.printGcode(unsafeName, true)).rejects.toBeInstanceOf(FlashforgeProtocolError);
    },
  );

  describe('uploadGcode', () => {
    let tempFile: string;

    beforeEach(async () => {
      tempFile = path.join(os.tmpdir(), `flashforge-test-${Date.now()}.gcode`);
      await fs.writeFile(tempFile, 'G28\nG1 X10\n');
    });

    afterEach(async () => {
      await fs.rm(tempFile, { force: true });
    });

    it('streams the file with printNow=false and confirms success', async () => {
      let receivedHeaders: Record<string, string | string[] | undefined> = {};
      let receivedBodyLength = 0;
      // Note: startFakeServer's own wrapper already drains the request body
      // (to build the `body` string param) before invoking this handler, so
      // this reads the already-collected body rather than re-attaching
      // 'data'/'end' listeners to an already-ended request stream.
      const server = await startFakeServer((req, res, body) => {
        receivedHeaders = req.headers;
        receivedBodyLength = Buffer.byteLength(body, 'utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, message: 'Success' }));
      });
      close = server.close;

      const client = clientFor(server.port);
      await client.uploadGcode(tempFile, 'safe_name.gcode', true);

      expect(receivedHeaders.printnow).toBe('false');
      expect(receivedBodyLength).toBeGreaterThan(0);
    });

    it('rejects an upload the printer refuses', async () => {
      const server = await startFakeServer(jsonHandler(200, { code: 1, message: 'Rejected' }));
      close = server.close;

      const client = clientFor(server.port);
      await expect(client.uploadGcode(tempFile, 'safe_name.gcode', true)).rejects.toMatchObject({
        reason: 'upload_failed',
      });
    });
  });
});
