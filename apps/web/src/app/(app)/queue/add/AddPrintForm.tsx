'use client';

import {
  createPrintJobSchema,
  getPrinterDefinition,
  MAX_UPLOAD_SIZE_BYTES,
  isAcceptedFileName,
  type AmsSlotSetInput,
  type PrinterBrand,
  type PrinterRecord,
} from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AmsSlotEditor } from '@/components/ams/AmsSlotEditor';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildStoragePath, uploadPrintFile } from '@/lib/client/uploadPrintFile';

const EMPTY_SLOT = { isUsed: false, colorName: '', materialName: '', notes: '' };

interface AddPrintFormValues {
  name: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
  amsSlots: AmsSlotSetInput;
  externalSpoolConfirmed: boolean;
}

/** Strips whichever of the brand's accepted extensions the filename ends with. */
function stripExtension(brand: PrinterBrand, filename: string) {
  const definition = getPrinterDefinition(brand);
  const match = definition.acceptedExtensions.find((ext) => filename.toLowerCase().endsWith(ext));
  return match ? filename.slice(0, filename.length - match.length) : filename;
}

export function AddPrintForm({ printers }: { printers: PrinterRecord[] }) {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<PrinterBrand, File>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<PrinterBrand, string>>>({});
  const [assignedBrandChoice, setAssignedBrandChoice] = useState<PrinterBrand | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<PrinterBrand, number>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddPrintFormValues>({
    defaultValues: {
      name: '',
      notes: '',
      estimatedDurationSeconds: undefined,
      externalSpoolConfirmed: false,
      amsSlots: [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT] as AmsSlotSetInput,
    },
  });

  const selectedBrands = (Object.keys(selectedFiles) as PrinterBrand[]).filter((brand) => selectedFiles[brand]);
  const hasBambuFile = selectedBrands.includes('bambu');
  const assignedBrand =
    selectedBrands.length === 1
      ? selectedBrands[0]
      : assignedBrandChoice && selectedBrands.includes(assignedBrandChoice)
        ? assignedBrandChoice
        : null;
  const noSlotsUsed = watch('amsSlots')?.every((s) => !s.isUsed);

  function handleFileChange(brand: PrinterBrand, selected: File | null) {
    setFileErrors((prev) => ({ ...prev, [brand]: undefined }));
    if (!selected) {
      setSelectedFiles((prev) => {
        const next = { ...prev };
        delete next[brand];
        return next;
      });
      return;
    }
    if (!isAcceptedFileName(brand, selected.name)) {
      const accepted = getPrinterDefinition(brand).acceptedExtensions.join(', ');
      setFileErrors((prev) => ({ ...prev, [brand]: `File must have one of these extensions: ${accepted}` }));
      return;
    }
    if (selected.size > MAX_UPLOAD_SIZE_BYTES) {
      setFileErrors((prev) => ({ ...prev, [brand]: 'File is larger than the 500 MB limit' }));
      return;
    }
    setSelectedFiles((prev) => ({ ...prev, [brand]: selected }));
    if (!watch('name')) {
      setValue('name', stripExtension(brand, selected.name));
    }
  }

  async function onSubmit(values: AddPrintFormValues) {
    setSubmitError(null);

    if (selectedBrands.length === 0) {
      setSubmitError('Select at least one printer file to upload');
      return;
    }
    if (!assignedBrand) {
      setSubmitError('Choose which printer this job is initially assigned to');
      return;
    }
    const printer = printers.find((p) => p.brand === assignedBrand);
    if (!printer) {
      setSubmitError('No printer configured for the selected brand');
      return;
    }

    const jobId = crypto.randomUUID();
    const filesInput = selectedBrands.map((brand) => {
      const file = selectedFiles[brand]!;
      return {
        printerBrand: brand,
        filename: file.name,
        fileSizeBytes: file.size,
        storagePath: buildStoragePath(brand, jobId, file.name),
      };
    });

    const parsed = createPrintJobSchema.safeParse({
      name: values.name,
      printerId: printer.id,
      files: filesInput,
      estimatedDurationSeconds: values.estimatedDurationSeconds,
      notes: values.notes,
      amsSlots: hasBambuFile ? values.amsSlots : undefined,
      externalSpoolConfirmed: values.externalSpoolConfirmed,
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    try {
      for (const brand of selectedBrands) {
        const file = selectedFiles[brand]!;
        const fileInput = filesInput.find((f) => f.printerBrand === brand)!;
        setUploadProgress((prev) => ({ ...prev, [brand]: 0 }));
        await uploadPrintFile({
          file,
          storagePath: fileInput.storagePath,
          onProgress: (percent) => setUploadProgress((prev) => ({ ...prev, [brand]: percent })),
        });
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, jobId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create print job');
      }

      router.push('/queue');
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
      setUploadProgress({});
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="space-y-4">
        {printers.map((printer) => {
          const definition = getPrinterDefinition(printer.brand);
          const file = selectedFiles[printer.brand];
          const error = fileErrors[printer.brand];
          const progress = uploadProgress[printer.brand];
          return (
            <div key={printer.brand} className="rounded-xl border border-slate-200 p-4">
              <label
                htmlFor={`file-${printer.brand}`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {definition.name} ({definition.acceptedExtensions.join(', ')})
              </label>
              <input
                id={`file-${printer.brand}`}
                type="file"
                accept={definition.acceptedExtensions.join(',')}
                onChange={(e) => handleFileChange(printer.brand, e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
              {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
              {file && !error && (
                <p className="mt-1 text-xs text-slate-500">
                  {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
              {progress != null && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedBrands.length > 1 && (
        <div>
          <label htmlFor="assigned-printer" className="mb-1 block text-sm font-medium text-slate-700">
            Assign to printer
          </label>
          <select
            id="assigned-printer"
            value={assignedBrand ?? ''}
            onChange={(e) => setAssignedBrandChoice(e.target.value as PrinterBrand)}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="" disabled>
              Choose a printer
            </option>
            {selectedBrands.map((brand) => (
              <option key={brand} value={brand}>
                {getPrinterDefinition(brand).name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            You can move this job to another uploaded printer later from the queue.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
          Job name
        </label>
        <input
          id="name"
          type="text"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
          {...register('name')}
        />
        {errors.name && <p className="mt-1 text-sm text-danger-600">{errors.name.message}</p>}
      </div>

      <PrintTimeFields control={control} error={errors.estimatedDurationSeconds?.message} />

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-slate-700">
          Notes — optional
        </label>
        <textarea
          id="notes"
          rows={2}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          {...register('notes')}
        />
      </div>

      {hasBambuFile && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">AMS slots</h2>
          <AmsSlotEditor control={control} errors={errors} />
          {noSlotsUsed && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" {...register('externalSpoolConfirmed')} className="h-5 w-5" />
              This print uses an external spool, not the AMS
            </label>
          )}
          {errors.amsSlots?.root?.message && (
            <p className="mt-1 text-sm text-danger-600">{errors.amsSlots.root.message}</p>
          )}
        </div>
      )}

      {submitError && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Add to Queue
      </Button>
    </form>
  );
}
