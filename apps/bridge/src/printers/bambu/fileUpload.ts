import { stat } from 'node:fs/promises';
import { Client as FtpClient } from 'basic-ftp';
import type { UploadedPrintFile, UploadPrintFileInput } from '@print-queue/shared';
import type { Logger } from '../../logger.js';
import { BAMBU_FTPS_PORT, BAMBU_FTPS_USERNAME, type BambuPrinterConfig } from './config.js';
import { normalizeBambuError } from './errors.js';
import { withRetry } from './retryPolicies.js';

/**
 * UNVERIFIED AGAINST PHYSICAL HARDWARE — see docs/bambu-integration.md.
 *
 * Community Bambu Lab integrations upload sliced files over implicit FTPS
 * (port 990) using the same access code as the MQTT password, placing the
 * file in the printer's root SD card directory. The exact accepted
 * destination path/directory convention (root vs. a `/cache` or `/model`
 * subfolder) is the biggest open question here — confirm against a real
 * printer before shipping this path to production.
 */
export async function uploadPrintFileViaFtps(
  config: BambuPrinterConfig,
  input: UploadPrintFileInput,
  logger: Logger,
): Promise<UploadedPrintFile> {
  return withRetry(
    async () => {
      const client = new FtpClient(30_000);
      client.ftp.verbose = false;

      try {
        await client.access({
          host: config.ip,
          port: BAMBU_FTPS_PORT,
          user: BAMBU_FTPS_USERNAME,
          password: config.accessCode,
          secure: 'implicit',
          secureOptions: { rejectUnauthorized: false },
        });

        const { size: totalBytes } = await stat(input.localFilePath);
        let lastReported = -1;
        client.trackProgress((info) => {
          const percent = totalBytes > 0 ? Math.min(100, Math.round((info.bytes / totalBytes) * 100)) : 0;
          if (percent !== lastReported) {
            lastReported = percent;
            input.onProgress?.(percent);
          }
        });

        await client.uploadFrom(input.localFilePath, `/${input.remoteFileName}`);

        logger.info('Uploaded print file to printer via FTPS', {
          remoteFileName: input.remoteFileName,
        });

        return { remoteFileName: input.remoteFileName };
      } catch (err) {
        throw normalizeBambuError('upload_failed', err);
      } finally {
        client.trackProgress();
        client.close();
      }
    },
    { attempts: 3, initialDelayMs: 2000 },
  );
}
