'use client';

import {
  getPrinterDefinition,
  isAcceptedFileName,
  MAX_UPLOAD_SIZE_BYTES,
  PRINTERS,
  type JobFileRecord,
  type PrinterBrand,
} from '@print-queue/shared';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { buildStoragePath, uploadPrintFile } from '@/lib/client/uploadPrintFile';

/**
 * "Add Printer File": attach a file for a brand this job doesn't have yet,
 * without creating a new job. See add_job_file in supabase/migrations.
 */
export function AddJobFileForm({ jobId, existingFiles }: { jobId: string; existingFiles: JobFileRecord[] }) {
  const router = useRouter();
  const missingBrands = PRINTERS.filter((p) => !existingFiles.some((f) => f.printerBrand === p.id));
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState<PrinterBrand | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (missingBrands.length === 0) return null;

  function handleFileChange(selected: File | null) {
    setError(null);
    setFile(null);
    if (!selected || !brand) return;
    if (!isAcceptedFileName(brand, selected.name)) {
      setError(`File must have one of these extensions: ${getPrinterDefinition(brand).acceptedExtensions.join(', ')}`);
      return;
    }
    if (selected.size > MAX_UPLOAD_SIZE_BYTES) {
      setError('File is larger than the 500 MB limit');
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand || !file) {
      setError('Choose a printer and a file');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const storagePath = buildStoragePath(brand, jobId, file.name);
      await uploadPrintFile({ file, storagePath });

      const res = await fetch(`/api/jobs/${jobId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerBrand: brand,
          filename: file.name,
          fileSizeBytes: file.size,
          storagePath,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to add file');
      }

      setOpen(false);
      setBrand('');
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-charcoal-300 px-3 text-sm font-semibold text-charcoal-700 transition-colors hover:border-charcoal-500 hover:bg-charcoal-50"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Add Printer File
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-charcoal-200 p-4">
      <select
        value={brand}
        onChange={(e) => {
          setBrand(e.target.value as PrinterBrand);
          setFile(null);
          setError(null);
        }}
        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
      >
        <option value="" disabled>
          Choose a printer
        </option>
        {missingBrands.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {brand && (
        <input
          type="file"
          accept={getPrinterDefinition(brand).acceptedExtensions.join(',')}
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
        />
      )}

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="md" loading={isSubmitting} disabled={!brand || !file}>
          Upload
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="touch-target rounded-lg px-3 text-sm font-semibold text-charcoal-600 hover:text-charcoal-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
