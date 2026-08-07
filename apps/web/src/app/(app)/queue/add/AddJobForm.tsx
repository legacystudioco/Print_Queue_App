'use client';

import { businessLabels, businesses, createJobSchema, MAX_PLATES_PER_JOB, type Business } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { Copy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface PlateFormValues {
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

interface CreateJobFormValues {
  customerName: string;
  business: Business;
  notes: string;
  plates: PlateFormValues[];
}

/** A screenshot dropped directly onto a board column — see ProductionBoard/BoardColumn. Prefills the first plate row. */
export interface AddJobPresetFile {
  business: Business;
  file: File;
  /** e.g. "only one screenshot is used per job" when the drop carried extra files. */
  notice?: string;
}

/** Strips a filename's extension, e.g. "plate-5.png" -> "plate-5". */
function stripExtension(filename: string) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? filename : filename.slice(0, lastDot);
}

const EMPTY_PLATE: PlateFormValues = { plateName: '', colors: '', notes: '', estimatedDurationSeconds: undefined };

/**
 * Creates a customer/order together with all of its plates (1–20) in one
 * save (see the product spec's two-step flow: Step 1 the customer, Step 2
 * the plate list). Each plate row owns its own screenshot File — tracked
 * in a parallel `screenshots` map keyed by react-hook-form's stable
 * `field.id` (not array index, which shifts on remove) rather than inside
 * the form's own serializable state, same pattern AddJobForm/EditJobForm
 * used for a single screenshot before this refactor.
 */
export function AddJobForm({
  onSuccess,
  presetFile,
}: {
  onSuccess?: () => void;
  /** Pre-selects a business and pre-fills the first plate's screenshot — set when a file was dropped directly onto a board column. */
  presetFile?: AddJobPresetFile;
}) {
  const router = useRouter();
  const [screenshots, setScreenshots] = useState<Record<string, File | null>>({});
  const [presetNotice, setPresetNotice] = useState<string | null>(presetFile?.notice ?? null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pendingDuplicateFile = useRef<File | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateJobFormValues>({
    defaultValues: {
      customerName: '',
      business: presetFile?.business ?? businesses[0],
      notes: '',
      plates: [EMPTY_PLATE],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'plates' });

  // A file dropped directly on a board column arrives here already
  // validated (see BoardColumn's native drop handling) — feed it through
  // the same path a manual pick/drop inside the dialog would take,
  // including the filename -> plate name autofill. Mount-only: this
  // dialog is remounted fresh each time it opens (see AddJobDialog/Modal).
  useEffect(() => {
    const firstFieldId = fields[0]?.id;
    if (presetFile && firstFieldId) {
      setScreenshots((prev) => ({ ...prev, [firstFieldId]: presetFile.file }));
      setValue('plates.0.plateName', stripExtension(presetFile.file.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duplicate Plate carries the source row's screenshot File over to the
  // new row (same object — submit dedupes identical Files to a single
  // upload, same object reuse `duplicate_plate` does post-creation). The
  // new row's field.id doesn't exist until after this render, so the file
  // is staged in a ref and picked up once `fields` grows.
  useEffect(() => {
    if (pendingDuplicateFile.current && fields.length > 0) {
      const lastFieldId = fields[fields.length - 1]!.id;
      const file = pendingDuplicateFile.current;
      pendingDuplicateFile.current = null;
      setScreenshots((prev) => ({ ...prev, [lastFieldId]: file }));
    }
  }, [fields]);

  function handlePlateScreenshotChange(fieldId: string, index: number, selected: File | null) {
    setScreenshots((prev) => ({ ...prev, [fieldId]: selected }));
    if (selected && !watch(`plates.${index}.plateName`)) {
      setValue(`plates.${index}.plateName`, stripExtension(selected.name));
    }
  }

  function handleAddPlate() {
    if (fields.length >= MAX_PLATES_PER_JOB) return;
    append({ ...EMPTY_PLATE });
  }

  function handleDuplicatePlate(index: number) {
    if (fields.length >= MAX_PLATES_PER_JOB) return;
    const source = watch(`plates.${index}`);
    const sourceFieldId = fields[index]?.id;
    pendingDuplicateFile.current = sourceFieldId ? (screenshots[sourceFieldId] ?? null) : null;
    append({ ...source });
  }

  function handleRemovePlate(fieldId: string, index: number) {
    if (fields.length <= 1) return;
    setScreenshots((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    remove(index);
  }

  async function onSubmit(values: CreateJobFormValues) {
    setSubmitError(null);

    const jobId = crypto.randomUUID();
    const uploadedPathByFile = new Map<File, string>();
    const platesPayload: {
      id: string;
      plateName: string;
      screenshotPath: string;
      colors: string | null;
      estimatedDurationSeconds: number | null;
      notes: string | null;
    }[] = [];

    try {
      for (let i = 0; i < fields.length; i++) {
        const fieldId = fields[i]!.id;
        const file = screenshots[fieldId];
        const plateValues = values.plates[i]!;

        if (!file) {
          setSubmitError(`Add a screenshot for plate ${i + 1}${plateValues.plateName ? ` (${plateValues.plateName})` : ''}`);
          return;
        }

        let storagePath = uploadedPathByFile.get(file);
        if (!storagePath) {
          storagePath = buildScreenshotPath(crypto.randomUUID(), file.name);
          setUploadingIndex(i);
          setUploadProgress(0);
          await uploadJobScreenshot({ file, storagePath, onProgress: setUploadProgress });
          uploadedPathByFile.set(file, storagePath);
        }

        platesPayload.push({
          id: crypto.randomUUID(),
          plateName: plateValues.plateName,
          screenshotPath: storagePath,
          colors: plateValues.colors || null,
          estimatedDurationSeconds: plateValues.estimatedDurationSeconds ?? null,
          notes: plateValues.notes || null,
        });
      }

      const parsed = createJobSchema.safeParse({
        customerName: values.customerName,
        business: values.business,
        notes: values.notes,
        plates: platesPayload,
      });

      if (!parsed.success) {
        setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
        return;
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, jobId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create job');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/queue');
      }
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploadingIndex(null);
      setUploadProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-widest text-charcoal-400">
          Step 1 — Customer / Order
        </legend>

        <div>
          <label htmlFor="customerName" className="mb-1 block text-sm font-medium text-slate-700">
            Customer name
          </label>
          <input
            id="customerName"
            type="text"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('customerName')}
          />
          {errors.customerName && <p className="mt-1 text-sm text-danger-600">{errors.customerName.message}</p>}
        </div>

        <div>
          <label htmlFor="business" className="mb-1 block text-sm font-medium text-slate-700">
            Business
          </label>
          <select
            id="business"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('business')}
          >
            {businesses.map((business) => (
              <option key={business} value={business}>
                {businessLabels[business]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="job-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Order notes — optional
          </label>
          <textarea
            id="job-notes"
            rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            {...register('notes')}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-widest text-charcoal-400">Step 2 — Plates</legend>

        <div className="space-y-5">
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-xl border border-charcoal-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-charcoal-400">Plate {index + 1}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDuplicatePlate(index)}
                    disabled={fields.length >= MAX_PLATES_PER_JOB}
                    title="Duplicate plate"
                    aria-label={`Duplicate plate ${index + 1}`}
                    className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-lg border border-charcoal-300 text-charcoal-700 hover:border-charcoal-500 hover:bg-charcoal-50 disabled:opacity-30"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemovePlate(field.id, index)}
                    disabled={fields.length <= 1}
                    title="Remove plate"
                    aria-label={`Remove plate ${index + 1}`}
                    className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger-500/60 text-danger-600 hover:bg-danger-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <ImageDropZone
                label="Add a screenshot of the build plate"
                hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
                file={screenshots[field.id] ?? null}
                onFileChange={(selected) => {
                  if (index === 0) setPresetNotice(null);
                  handlePlateScreenshotChange(field.id, index, selected);
                }}
                imageAlt="Selected build plate screenshot"
                uploading={uploadingIndex === index}
                uploadProgress={uploadingIndex === index ? uploadProgress : null}
              />
              {index === 0 && presetNotice && <p className="text-xs font-medium text-charcoal-500">{presetNotice}</p>}

              <div>
                <label htmlFor={`plate-${index}-name`} className="mb-1 block text-sm font-medium text-slate-700">
                  Plate name
                </label>
                <input
                  id={`plate-${index}-name`}
                  type="text"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  {...register(`plates.${index}.plateName` as const)}
                />
                {errors.plates?.[index]?.plateName && (
                  <p className="mt-1 text-sm text-danger-600">{errors.plates[index]?.plateName?.message}</p>
                )}
              </div>

              <div>
                <label htmlFor={`plate-${index}-colors`} className="mb-1 block text-sm font-medium text-slate-700">
                  Colors / materials — optional
                </label>
                <input
                  id={`plate-${index}-colors`}
                  type="text"
                  placeholder="e.g. Black PLA, Gold PETG"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  {...register(`plates.${index}.colors` as const)}
                />
              </div>

              <PrintTimeFields
                control={control}
                name={`plates.${index}.estimatedDurationSeconds` as const}
                idPrefix={`plate-${index}-time`}
              />

              <div>
                <label htmlFor={`plate-${index}-notes`} className="mb-1 block text-sm font-medium text-slate-700">
                  Notes — optional
                </label>
                <textarea
                  id={`plate-${index}-notes`}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  {...register(`plates.${index}.notes` as const)}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddPlate}
          disabled={fields.length >= MAX_PLATES_PER_JOB}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-charcoal-300 py-3 text-sm font-bold text-charcoal-500 transition-colors hover:border-accent-400 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add Plate
        </button>
        {fields.length >= MAX_PLATES_PER_JOB && (
          <p className="text-xs text-charcoal-400">Maximum of {MAX_PLATES_PER_JOB} plates per order.</p>
        )}
      </fieldset>

      {submitError && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Create Job
      </Button>
    </form>
  );
}
