'use client';

import {
  businessLabels,
  businesses,
  formatPrintTime,
  hoursMinutesToMinutes,
  minutesToHoursMinutes,
  sumTemplatePlateSeconds,
  type Business,
} from '@print-queue/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ImageDropZone } from '@/components/ui/ImageDropZone';
import { TemplatePickerList } from '@/components/templates/TemplatePickerList';
import type { TemplatePlate, TemplateWithPlates } from '@/components/templates/types';
import { buildScreenshotPath, uploadJobScreenshot } from '@/lib/client/uploadJobScreenshot';

type Step = 'pick' | 'details' | 'preview';

interface PlateRowState {
  templatePlateId: string;
  plateName: string;
  colors: string;
  notes: string;
  estimatedDurationSeconds: number | null | undefined;
  /** The template plate's screenshot, shown as the row's starting image. */
  existingScreenshotUrl: string | null;
  /** Set only if the user replaces the image — otherwise the template's screenshot is copied server-side. */
  replacementFile: File | null;
}

function plateToRowState(plate: TemplatePlate): PlateRowState {
  return {
    templatePlateId: plate.id,
    plateName: plate.plateName,
    colors: plate.colors ?? '',
    notes: plate.notes ?? '',
    estimatedDurationSeconds: plate.estimatedDurationSeconds,
    existingScreenshotUrl: plate.screenshotUrl,
    replacementFile: null,
  };
}

/**
 * "Create Job from Template" — the whole point of the feature. Step 1 (pick
 * a template, skipped when opened from a template card's "Use Template")
 * -> Step 2 (customer/business/notes) -> Step 3 (preview every plate,
 * editable, screenshots optionally replaceable) -> submit. The created job
 * is a full snapshot: nothing here keeps a live reference back to the
 * template (see POST /api/templates/[id]/jobs).
 */
export function CreateJobFromTemplateWizard({
  initialTemplate,
  onDone,
}: {
  initialTemplate?: TemplateWithPlates;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(initialTemplate ? 'details' : 'pick');
  const [template, setTemplate] = useState<TemplateWithPlates | null>(initialTemplate ?? null);
  const [customerName, setCustomerName] = useState('');
  const [business, setBusiness] = useState<Business>(initialTemplate?.defaultBusiness ?? businesses[0]);
  const [notes, setNotes] = useState('');
  const [shipByDate, setShipByDate] = useState('');
  const [plateRows, setPlateRows] = useState<PlateRowState[]>(initialTemplate ? initialTemplate.plates.map(plateToRowState) : []);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const time = sumTemplatePlateSeconds(plateRows.map((r) => ({ estimatedDurationSeconds: r.estimatedDurationSeconds ?? null })));

  function handleSelectTemplate(selected: TemplateWithPlates) {
    setTemplate(selected);
    setBusiness(selected.defaultBusiness);
    setPlateRows(selected.plates.map(plateToRowState));
  }

  function updateRow(templatePlateId: string, patch: Partial<PlateRowState>) {
    setPlateRows((prev) => prev.map((row) => (row.templatePlateId === templatePlateId ? { ...row, ...patch } : row)));
  }

  async function handleConfirm() {
    if (!template) return;
    setSubmitError(null);
    setSubmitting(true);

    const jobId = crypto.randomUUID();

    try {
      const plates: {
        templatePlateId: string;
        plateName: string;
        colors: string | null;
        estimatedDurationSeconds: number | null;
        notes: string | null;
        screenshotPath?: string;
      }[] = [];

      for (const row of plateRows) {
        let screenshotPath: string | undefined;
        if (row.replacementFile) {
          screenshotPath = buildScreenshotPath(jobId, row.replacementFile.name);
          setUploadingId(row.templatePlateId);
          setUploadProgress(0);
          await uploadJobScreenshot({ file: row.replacementFile, storagePath: screenshotPath, onProgress: setUploadProgress });
        }

        plates.push({
          templatePlateId: row.templatePlateId,
          plateName: row.plateName,
          colors: row.colors || null,
          estimatedDurationSeconds: row.estimatedDurationSeconds ?? null,
          notes: row.notes || null,
          ...(screenshotPath ? { screenshotPath } : {}),
        });
      }

      const res = await fetch(`/api/templates/${template.id}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          customerName,
          business,
          notes: notes.trim() || null,
          shipByDate: shipByDate || null,
          plates,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create job');
      }

      onDone();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploadingId(null);
      setUploadProgress(null);
      setSubmitting(false);
    }
  }

  const totalSteps = initialTemplate ? 2 : 3;
  const stepNumber = step === 'pick' ? 1 : step === 'details' ? (initialTemplate ? 1 : 2) : totalSteps;

  return (
    <div className="space-y-5">
      <p className="text-xs font-bold uppercase tracking-widest text-charcoal-400">
        Step {stepNumber} of {totalSteps}
      </p>

      {step === 'pick' && (
        <div className="space-y-4">
          <TemplatePickerList selectedId={template?.id ?? null} onSelect={handleSelectTemplate} />
          <Button type="button" size="lg" className="w-full" disabled={!template} onClick={() => setStep('details')}>
            Next: Job Details
          </Button>
        </div>
      )}

      {step === 'details' && template && (
        <div className="space-y-4">
          <p className="text-sm text-charcoal-500">
            Creating a job from <span className="font-semibold">{template.name}</span>.
          </p>
          <div>
            <label htmlFor="template-job-customer" className="mb-1 block text-sm font-medium text-slate-700">
              Customer name
            </label>
            <input
              id="template-job-customer"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="template-job-business" className="mb-1 block text-sm font-medium text-slate-700">
              Business
            </label>
            <select
              id="template-job-business"
              value={business}
              onChange={(e) => setBusiness(e.target.value as Business)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              {businesses.map((b) => (
                <option key={b} value={b}>
                  {businessLabels[b]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="template-job-ship-by" className="mb-1 block text-sm font-medium text-slate-700">
              Ship By — optional
            </label>
            <input
              id="template-job-ship-by"
              type="date"
              value={shipByDate}
              onChange={(e) => setShipByDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="template-job-notes" className="mb-1 block text-sm font-medium text-slate-700">
              Order notes — optional
            </label>
            <textarea
              id="template-job-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {!initialTemplate && (
              <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setStep('pick')}>
                Back
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={customerName.trim().length === 0}
              onClick={() => setStep('preview')}
            >
              Next: Preview
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && template && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <p className="text-charcoal-500">
              {plateRows.length} plate{plateRows.length === 1 ? '' : 's'} for{' '}
              <span className="font-semibold text-charcoal-900">{customerName}</span>
            </p>
            <p className="text-xs text-charcoal-400">{time.totalMinutes > 0 ? `~${formatPrintTime(time.totalMinutes)} total` : null}</p>
          </div>

          <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {plateRows.map((row, index) => (
              <div key={row.templatePlateId} className="space-y-3 rounded-xl border border-charcoal-200 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-charcoal-400">Plate {index + 1}</p>

                <ImageDropZone
                  label="Replace screenshot"
                  hint="Leave unchanged to reuse the template's screenshot"
                  file={row.replacementFile}
                  onFileChange={(file) => updateRow(row.templatePlateId, { replacementFile: file })}
                  existingImageUrl={row.existingScreenshotUrl}
                  imageAlt={`Screenshot for ${row.plateName}`}
                  uploading={uploadingId === row.templatePlateId}
                  uploadProgress={uploadingId === row.templatePlateId ? uploadProgress : null}
                />

                <div>
                  <label htmlFor={`template-job-plate-${index}-name`} className="mb-1 block text-sm font-medium text-slate-700">
                    Plate name
                  </label>
                  <input
                    id={`template-job-plate-${index}-name`}
                    type="text"
                    value={row.plateName}
                    onChange={(e) => updateRow(row.templatePlateId, { plateName: e.target.value })}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`template-job-plate-${index}-colors`} className="mb-1 block text-sm font-medium text-slate-700">
                    Colors / materials
                  </label>
                  <input
                    id={`template-job-plate-${index}-colors`}
                    type="text"
                    value={row.colors}
                    onChange={(e) => updateRow(row.templatePlateId, { colors: e.target.value })}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Print Time — optional</label>
                  <div className="flex flex-wrap gap-4">
                    <PrintTimeFieldsInline
                      value={row.estimatedDurationSeconds ?? null}
                      onChange={(seconds) => updateRow(row.templatePlateId, { estimatedDurationSeconds: seconds })}
                      idPrefix={`template-job-plate-${index}-time`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={`template-job-plate-${index}-notes`} className="mb-1 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    id={`template-job-plate-${index}-notes`}
                    rows={2}
                    value={row.notes}
                    onChange={(e) => updateRow(row.templatePlateId, { notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {submitError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" className="flex-1" disabled={submitting} onClick={() => setStep('details')}>
              Back
            </Button>
            <Button type="button" size="lg" className="flex-1" loading={submitting} onClick={handleConfirm}>
              Create Job
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Uncontrolled-by-react-hook-form variant of PrintTimeFields' hours/minutes pair — the preview step edits a plain state array, not a form. */
function PrintTimeFieldsInline({
  value,
  onChange,
  idPrefix,
}: {
  value: number | null;
  onChange: (seconds: number | null) => void;
  idPrefix: string;
}) {
  const totalMinutes = value ? Math.round(value / 60) : 0;
  const { hours, minutes } = minutesToHoursMinutes(totalMinutes);

  function commit(nextHours: number, nextMinutes: number) {
    const clampedHours = Math.min(999, Math.max(0, Math.round(nextHours) || 0));
    const clampedMinutes = Math.min(59, Math.max(0, Math.round(nextMinutes) || 0));
    const total = hoursMinutesToMinutes(clampedHours, clampedMinutes);
    onChange(total > 0 ? total * 60 : null);
  }

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-hours`} className="mb-1 block text-xs font-medium text-slate-500">
          Hours
        </label>
        <input
          id={`${idPrefix}-hours`}
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          value={hours}
          onChange={(e) => commit(Number(e.target.value), minutes)}
          className="h-11 w-24 rounded-xl border border-slate-300 px-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-minutes`} className="mb-1 block text-xs font-medium text-slate-500">
          Minutes
        </label>
        <input
          id={`${idPrefix}-minutes`}
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          value={minutes}
          onChange={(e) => commit(hours, Number(e.target.value))}
          className="h-11 w-24 rounded-xl border border-slate-300 px-3 text-sm"
        />
      </div>
    </>
  );
}
