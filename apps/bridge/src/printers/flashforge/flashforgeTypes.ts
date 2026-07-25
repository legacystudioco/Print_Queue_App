/**
 * Wire types for the Flashforge Adventurer 5M / 5M Pro HTTP REST API
 * (port 8898). Flashforge has no official LAN control API — these shapes
 * are compiled from community reverse-engineering:
 *
 *  - https://github.com/Parallel-7/flashforge-api-docs — wiki pages
 *    "Adventurer 5M Series", "Authentication", "Error-Codes",
 *    "State-Machines", and the machine-readable spec
 *    endpoints/endpoints_5m_3.2.7.yaml.
 *  - https://github.com/GhostTypes/ff-5mp-api-py — reference client
 *    implementation, cross-checked for exact header names, payload shapes,
 *    and the firmware-version gate for the "modern" (>=3.1.3) upload/print
 *    payload format used below.
 *
 * Firmware compatibility note: the sources above are primary-validated
 * against firmware 3.2.7. This deployment's confirmed printer firmware is
 * 5.1.8-2.2.3. The reference client determines "modern vs legacy" payload
 * format by splitting the firmware string on "-" and comparing the dotted
 * segments against 3.1.3 — exactly the shape "5.1.8-2.2.3" takes, so
 * "5.1.8" unambiguously resolves to "modern" and this client always uses
 * the modern payload shapes below. Firmware 5.1.8-2.2.3 itself has not been
 * independently verified against these docs — verify with
 * `pnpm --filter bridge diagnose:printers` and
 * `diagnose:flashforge-upload` before relying on this in production.
 */

export interface FlashforgeCredentials {
  serialNumber: string;
  checkCode: string;
}

/** POST /detail response envelope. */
export interface FlashforgeDetailResponse {
  code: number;
  message: string;
  detail: FlashforgeDetail;
}

/** Subset of the documented `/detail` fields this integration actually reads. */
export interface FlashforgeDetail {
  status: string;
  printProgress?: number;
  printLayer?: number;
  targetPrintLayer?: number;
  printFileName?: string;
  platTemp?: number;
  platTargetTemp?: number;
  rightTemp?: number;
  rightTargetTemp?: number;
  errorCode?: string;
  firmwareVersion?: string;
  remainingDiskSpace?: number;
}

export interface FlashforgeGcodeListResponse {
  code: number;
  message: string;
  gcodeList?: string[];
}

export type FlashforgeJobControlAction = 'pause' | 'continue' | 'cancel';
