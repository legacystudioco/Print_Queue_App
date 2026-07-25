import {
  PrinterAdapterError,
  type PrinterAdapter,
  type PrinterCapabilities,
  type PrinterConnectionResult,
  type PrinterStatusReport,
  type StartPrintResult,
  type UploadedPrintFile,
} from '@print-queue/shared';

/**
 * Stub PrinterAdapter for a brand whose network protocol (auth, file
 * upload, start-print) isn't integrated yet. Keeps the adapter factory's
 * switch exhaustive and typed against PrinterAdapter without inventing real
 * device-control behavior. testConnection/getStatus report a clear
 * not-implemented result (rather than throwing) so the bridge's startup
 * health check fails loudly and predictably instead of crashing; every
 * other operation throws PrinterAdapterError('unsupported_operation', ...).
 * Swap in a real per-brand implementation (see printers/bambu/) once
 * protocol details exist — nothing above the adapter layer needs to change.
 */
export class UnimplementedPrinterAdapter implements PrinterAdapter {
  constructor(private readonly brandName: string) {}

  async testConnection(): Promise<PrinterConnectionResult> {
    return {
      connected: false,
      message: `${this.brandName} support is not yet implemented`,
      code: 'unsupported_operation',
    };
  }

  async getStatus(): Promise<PrinterStatusReport> {
    return { status: 'unknown', raw: { reason: 'adapter_not_implemented', brand: this.brandName } };
  }

  async uploadPrintFile(): Promise<UploadedPrintFile> {
    throw this.notImplemented();
  }

  async startPrint(): Promise<StartPrintResult> {
    throw this.notImplemented();
  }

  async pausePrint(): Promise<void> {
    throw this.notImplemented();
  }

  async resumePrint(): Promise<void> {
    throw this.notImplemented();
  }

  async cancelPrint(): Promise<void> {
    throw this.notImplemented();
  }

  getCapabilities(): PrinterCapabilities {
    return {
      canUploadFile: false,
      canStartPrint: false,
      canPause: false,
      canResume: false,
      canCancel: false,
      canReportProgress: false,
      canReportTemperatures: false,
      supportsDeliveryOnly: false,
    };
  }

  private notImplemented(): PrinterAdapterError {
    return new PrinterAdapterError('unsupported_operation', `${this.brandName} support is not yet implemented`);
  }
}
