'use client';

import { businessLabels, businesses, createJobTemplateSchema, MAX_PLATES_PER_JOB, type Business } from '@print-queue/shared';
import { Copy, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { PrintTimeFields } from '@/components/job/PrintTimeFields';
import { Button } from '@/components/ui/Button';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

interface TemplatePlateFormValues {
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
}

interface CreateTemplateFormValues {
  name: string;
  description: string;
  defaultBusiness: Business;
  plates: TemplatePlateFormValues[];
}

const EMPTY_PLATE: TemplatePlateFormValues = { plateName: '', colors: '', notes: '', estimatedDurationSeconds: undefined };

/**
 * Manual "Create Template" — a close mirror of AddJobForm's Step 1/Step 2
 * shape, but plates are optional (0+, unlike a job's required 1+): a
 * template can be created with just a name and built up plate-by-plate
 * afterward on its detail page. Screenshots upload directly to
 * `templates/{newId}/...` — a fresh upload, so no server-side copy is
 * needed (that's only for screenshots crossing an existing template/job
 * boundary — see lib/server/templateStorage.ts).
 */
export function CreateTemplateForm({ onSuccess }: { onSuccess: (templateId: string) => void }) {
  const [screenshots, setScreenshots] = useState<Record<string, File | null>>({});
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
  } = useForm<CreateTemplateFormValues>({
    defaultValues: { name: '', description: '', defaultBusiness: businesses[0], plates: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'plates' });

  function stripExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? filename : filename.slice(0, lastDot);
  }

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
    setScreenshots((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    remove(index);
  }

  async function onSubmit(values: CreateTemplateFormValues) {
    setSubmitError(null);

    const templateId = crypto.randomUUID();
    const uploadedPathByFile = new Map<File, string>();
    const platesPayload: {
      id: string;
      plateName: string;
      screenshotPath: string | null;
      colors: string | null;
      estimatedDurationSeconds: number | null;
      notes: string | null;
    }[] = [];

    try {
      for (let i = 0; i < fields.length; i++) {
        const fieldId = fields[i]!.id;
        const file = screenshots[fieldId];
        const plateValues = values.plates[i]!;

        let storagePath: string | null = null;
        if (file) {
          storagePath = uploadedPathByFile.get(file) ?? null;
          if (!storagePath) {
            storagePath = buildScreenshotPath(`templates/${templateId}`, file.name);
            setUploadingIndex(i);
            setUploadProgress(0);
            await uploadJobScreenshot({ file, storagePath, onProgress: setUploadProgress });
            uploadedPathByFile.set(file, storagePath);
          }
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

      const parsed = createJobTemplateSchema.safeParse({
        name: values.name,
        description: values.description,
        defaultBusiness: values.defaultBusiness,
        plates: platesPayload,
      });

      if (!parsed.success) {
        setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input');
        return;
      }

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, templateId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create template');
      }

      onSuccess(templateId);
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
        <div>
          <label htmlFor="template-name" className="mb-1 block text-sm font-medium text-slate-700">
            Template name
          </label>
          <input
            id="template-name"
            type="text"
            placeholder="e.g. Football Display"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('name')}
          />
          {errors.name && <p className="mt-1 text-sm text-danger-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="template-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description — optional
          </label>
          <textarea
            id="template-description"
            rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            {...register('description')}
          />
        </div>

        <div>
          <label htmlFor="template-business" className="mb-1 block text-sm font-medium text-slate-700">
            Default business
          </label>
          <select
            id="template-business"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            {...register('defaultBusiness')}
          >
            {businesses.map((business) => (
              <option key={business} value={business}>
                {businessLabels[business]}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-widest text-charcoal-400">
          Plates — optional, add more any time
        </legend>

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
                    title="Remove plate"
                    aria-label={`Remove plate ${index + 1}`}
                    className="touch-target inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger-500/60 text-danger-600 hover:bg-danger-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <ImageDropZone
                label="Add a screenshot of the build plate"
                hint="Drag and drop, or click to browse — PNG, JPG, WEBP, or HEIC, up to 20 MB"
                file={screenshots[field.id] ?? null}
                onFileChange={(selected) => handlePlateScreenshotChange(field.id, index, selected)}
                imageAlt="Selected build plate screenshot"
                uploading={uploadingIndex === index}
                uploadProgress={uploadingIndex === index ? uploadProgress : null}
              />

              <div>
                <label htmlFor={`template-plate-${index}-name`} className="mb-1 block text-sm font-medium text-slate-700">
                  Plate name
                </label>
                <input
                  id={`template-plate-${index}-name`}
                  type="text"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  {...register(`plates.${index}.plateName` as const)}
                />
                {errors.plates?.[index]?.plateName && (
                  <p className="mt-1 text-sm text-danger-600">{errors.plates[index]?.plateName?.message}</p>
                )}
              </div>

              <div>
                <label htmlFor={`template-plate-${index}-colors`} className="mb-1 block text-sm font-medium text-slate-700">
                  Colors / materials — optional
                </label>
                <input
                  id={`template-plate-${index}-colors`}
                  type="text"
                  placeholder="e.g. Black, White, TEAM COLOR"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  {...register(`plates.${index}.colors` as const)}
                />
              </div>

              <PrintTimeFields
                control={control}
                name={`plates.${index}.estimatedDurationSeconds` as const}
                idPrefix={`template-plate-${index}-time`}
              />

              <div>
                <label htmlFor={`template-plate-${index}-notes`} className="mb-1 block text-sm font-medium text-slate-700">
                  Notes — optional
                </label>
                <textarea
                  id={`template-plate-${index}-notes`}
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
      </fieldset>

      {submitError && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Create Template
      </Button>
    </form>
  );
}
