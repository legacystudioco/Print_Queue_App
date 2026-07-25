import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PrinterAdapterError } from '@print-queue/shared';
import { createLogger } from '../../logger.js';
import { FlashforgePrinterAdapter } from './FlashforgePrinterAdapter.js';

type Route = (req: IncomingMessage, res: ServerResponse, body: string) => void;

/** Routes by request path so a single fake server can stand in for the whole :8898 API within one test. */
async function startRoutedServer(routes: Record<string, Route>): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const route = routes[req.url ?? ''];
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 4, message: 'Not found' }));
        return;
      }
      route(req, res, Buffer.concat(chunks).toString('utf8'));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind fake server');

  return { port: address.port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function json(status: number, body: unknown): Route {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
}

const logger = createLogger('error');

function adapterFor(port: number, requestTimeoutMs = 1000) {
  return new FlashforgePrinterAdapter(
    {
      host: '127.0.0.1',
      port,
      serialNumber: 'SNTEST0000000',
      checkCode: '12345',
      requestTimeoutMs,
      uploadTimeoutMs: 2000,
    },
    logger,
  );
}

describe('FlashforgePrinterAdapter', () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('reports full capabilities', () => {
    const adapter = adapterFor(1);
    expect(adapter.getCapabilities()).toEqual({
      canUploadFile: true,
      canStartPrint: true,
      canPause: true,
      canResume: true,
      canCancel: true,
      canReportProgress: true,
      canReportTemperatures: true,
      supportsDeliveryOnly: true,
    });
  });

  it('maps an idle printer', async () => {
    const server = await startRoutedServer({
      '/detail': json(200, { code: 0, message: 'Success', detail: { status: 'ready' } }),
    });
    close = server.close;

    const status = await adapterFor(server.port).getStatus();
    expect(status.status).toBe('idle');
  });

  it('maps a printing printer with progress and temperatures', async () => {
    const server = await startRoutedServer({
      '/detail': json(200, {
        code: 0,
        message: 'Success',
        detail: {
          status: 'printing',
          printProgress: 0.42,
          printFileName: 'benchy.gcode',
          rightTemp: 219.5,
          platTemp: 55,
        },
      }),
    });
    close = server.close;

    const status = await adapterFor(server.port).getStatus();
    expect(status.status).toBe('printing');
    expect(status.progressPercent).toBe(42);
    expect(status.currentFileName).toBe('benchy.gcode');
    expect(status.nozzleTempCelsius).toBe(219.5);
    expect(status.bedTempCelsius).toBe(55);
  });

  it('maps a paused printer', async () => {
    const server = await startRoutedServer({
      '/detail': json(200, { code: 0, message: 'Success', detail: { status: 'paused' } }),
    });
    close = server.close;

    const status = await adapterFor(server.port).getStatus();
    expect(status.status).toBe('paused');
  });

  it('reports unreachable via testConnection when nothing is listening', async () => {
    const adapter = adapterFor(1);
    const result = await adapter.testConnection();
    expect(result.connected).toBe(false);
    expect(result.code).toBe('connection_failed');
  });

  it('maps an auth failure to the authentication_failed adapter error code', async () => {
    const server = await startRoutedServer({ '/detail': json(200, { code: 3, message: 'Unauthorized' }) });
    close = server.close;

    const result = await adapterFor(server.port).testConnection();
    expect(result.connected).toBe(false);
    expect(result.code).toBe('authentication_failed');
  });

  describe('uploadPrintFile', () => {
    let tempFile: string;

    afterEach(async () => {
      await fs.rm(tempFile, { force: true });
    });

    it('uploads and confirms via gcodeList', async () => {
      tempFile = path.join(os.tmpdir(), `ff-adapter-test-${Date.now()}.gcode`);
      await fs.writeFile(tempFile, 'G28\n');

      const server = await startRoutedServer({
        '/uploadGcode': json(200, { code: 0, message: 'Success' }),
        '/gcodeList': json(200, { code: 0, message: 'Success', gcodeList: ['benchy.gcode'] }),
      });
      close = server.close;

      const result = await adapterFor(server.port).uploadPrintFile({
        localFilePath: tempFile,
        remoteFileName: 'benchy.gcode',
      });
      expect(result.remoteFileName).toBe('benchy.gcode');
    });

    it('throws upload_failed when the printer file list does not confirm the upload', async () => {
      tempFile = path.join(os.tmpdir(), `ff-adapter-test-${Date.now()}.gcode`);
      await fs.writeFile(tempFile, 'G28\n');

      const server = await startRoutedServer({
        '/uploadGcode': json(200, { code: 0, message: 'Success' }),
        '/gcodeList': json(200, { code: 0, message: 'Success', gcodeList: [] }),
      });
      close = server.close;

      await expect(
        adapterFor(server.port).uploadPrintFile({ localFilePath: tempFile, remoteFileName: 'benchy.gcode' }),
      ).rejects.toMatchObject({ code: 'upload_failed' });
    });

    it('rejects a local file that does not exist before ever contacting the printer', async () => {
      await expect(
        adapterFor(1).uploadPrintFile({ localFilePath: '/nonexistent/path.gcode', remoteFileName: 'x.gcode' }),
      ).rejects.toBeInstanceOf(PrinterAdapterError);
    });

    it('rejects a non-.gcode remote filename', async () => {
      tempFile = path.join(os.tmpdir(), `ff-adapter-test-${Date.now()}.gcode`);
      await fs.writeFile(tempFile, 'G28\n');

      await expect(
        adapterFor(1).uploadPrintFile({ localFilePath: tempFile, remoteFileName: 'benchy.3mf' }),
      ).rejects.toMatchObject({ code: 'upload_failed' });
    });
  });

  describe('startPrint', () => {
    it('reports started:true on a successful printGcode', async () => {
      const server = await startRoutedServer({ '/printGcode': json(200, { code: 0, message: 'Success' }) });
      close = server.close;

      const result = await adapterFor(server.port).startPrint({ remoteFileName: 'benchy.gcode' });
      expect(result.started).toBe(true);
    });

    it('reports started:false with a message when the printer is busy', async () => {
      const server = await startRoutedServer({ '/printGcode': json(200, { code: 5, message: 'Busy' }) });
      close = server.close;

      const result = await adapterFor(server.port).startPrint({ remoteFileName: 'benchy.gcode' });
      expect(result.started).toBe(false);
      expect(result.message).toContain('FLASHFORGE_BUSY');
    });

    it('recovers a timed-out start by confirming the exact file is already printing', async () => {
      const server = await startRoutedServer({
        '/printGcode': (_req, res) => {
          // Never respond within the client timeout — outcome unknown.
          setTimeout(() => res.end(), 5000);
        },
        '/detail': json(200, {
          code: 0,
          message: 'Success',
          detail: { status: 'printing', printFileName: 'benchy.gcode' },
        }),
      });
      close = server.close;

      const result = await adapterFor(server.port, 100).startPrint({ remoteFileName: 'benchy.gcode' });
      expect(result.started).toBe(true);
    });

    it('does not falsely recover when a different file is printing', async () => {
      const server = await startRoutedServer({
        '/printGcode': (_req, res) => {
          setTimeout(() => res.end(), 5000);
        },
        '/detail': json(200, {
          code: 0,
          message: 'Success',
          detail: { status: 'printing', printFileName: 'someone-elses-file.gcode' },
        }),
      });
      close = server.close;

      const result = await adapterFor(server.port, 100).startPrint({ remoteFileName: 'benchy.gcode' });
      expect(result.started).toBe(false);
    });

    it('rejects a non-.gcode remote filename', async () => {
      await expect(adapterFor(1).startPrint({ remoteFileName: 'benchy.3mf' })).rejects.toMatchObject({
        code: 'upload_failed',
      });
    });
  });

  describe('pause/resume/cancel', () => {
    it('pausePrint succeeds against a healthy printer', async () => {
      const server = await startRoutedServer({ '/control': json(200, { code: 0, message: 'Success' }) });
      close = server.close;
      await expect(adapterFor(server.port).pausePrint()).resolves.toBeUndefined();
    });

    it('resumePrint succeeds against a healthy printer', async () => {
      const server = await startRoutedServer({ '/control': json(200, { code: 0, message: 'Success' }) });
      close = server.close;
      await expect(adapterFor(server.port).resumePrint()).resolves.toBeUndefined();
    });

    it('cancelPrint throws a normalized error when the printer rejects it', async () => {
      const server = await startRoutedServer({ '/control': json(200, { code: 1, message: 'Error' }) });
      close = server.close;
      await expect(adapterFor(server.port).cancelPrint()).rejects.toBeInstanceOf(PrinterAdapterError);
    });
  });
});
