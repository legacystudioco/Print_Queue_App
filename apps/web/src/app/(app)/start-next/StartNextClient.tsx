'use client';

import { formatPrintTime, type PrintJobWithSlots } from '@print-queue/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AmsSlotCards } from '@/components/ams/AmsSlotCards';
import { JobFileList } from '@/components/job/JobFileList';
import { Button } from '@/components/ui/Button';
import { CheckboxRow } from '@/components/ui/Checkbox';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Phase = 'idle' | 'submitting' | 'watching' | 'error';

export function StartNextClient({
  job,
  printerId,
}: {
  job: PrintJobWithSlots;
  printerId: string;
}) {
  const router = useRouter();
  const [previousPrintRemoved, setPreviousPrintRemoved] = useState(false);
  const [buildPlateClear, setBuildPlateClear] = useState(false);
  const [amsVerified, setAmsVerified] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const submittedRef = useRef(false);
  const hasBambuFile = job.files.some((f) => f.printerBrand === 'bambu');

  const allChecked = previousPrintRemoved && buildPlateClear && amsVerified;

  async function handleStart() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('submitting');
    setError(null);

    try {
      const res = await fetch('/api/start-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          idempotencyKey: idempotencyKeyRef.current,
          checklist: { previousPrintRemoved, buildPlateClear, amsVerified },
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? 'Could not start the print.');
        setPhase('error');
        submittedRef.current = false;
        return;
      }

      setCommandStatus(body.command?.status ?? 'pending');
      setPhase('watching');
    } catch {
      setError('Network error — please try again.');
      setPhase('error');
      submittedRef.current = false;
    }
  }

  // Watch the printer_commands row via Realtime once a command has been created,
  // so the operator sees the pipeline progress without leaving this screen.
  useEffect(() => {
    if (phase !== 'watching') return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`printer-commands-${printerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'printer_commands',
          filter: `printer_id=eq.${printerId}`,
        },
        (payload) => {
          const status = (payload.new as { status?: string; idempotency_key?: string }).status;
          const key = (payload.new as { idempotency_key?: string }).idempotency_key;
          if (key !== idempotencyKeyRef.current) return;
          if (status) setCommandStatus(status);
          if (status === 'completed') {
            router.push('/dashboard');
            router.refresh();
          }
          if (status === 'failed' || status === 'cancelled') {
            setPhase('error');
            setError('The bridge could not start the print. Check printer events for details.');
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [phase, printerId, router]);

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-display-lg text-slate-900">Ready to Start Next Print</h1>

      <div>
        <p className="text-sm font-medium text-slate-500">Next print</p>
        <p className="text-2xl font-bold text-slate-900">{job.name}</p>
        <JobFileList files={job.files} className="mt-1" />
        {job.estimatedDurationSeconds && (
          <p className="mt-1 text-sm text-slate-500">
            Estimated: {formatPrintTime(Math.round(job.estimatedDurationSeconds / 60))}
          </p>
        )}
      </div>

      {hasBambuFile && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">AMS Setup</p>
          <AmsSlotCards slots={job.amsSlots} />
        </div>
      )}

      <div className="space-y-2">
        <CheckboxRow
          id="previous-removed"
          label="Previous print has been removed"
          checked={previousPrintRemoved}
          onChange={(e) => setPreviousPrintRemoved(e.target.checked)}
          disabled={phase !== 'idle' && phase !== 'error'}
        />
        <CheckboxRow
          id="plate-clear"
          label="Build plate is installed and clear"
          checked={buildPlateClear}
          onChange={(e) => setBuildPlateClear(e.target.checked)}
          disabled={phase !== 'idle' && phase !== 'error'}
        />
        <CheckboxRow
          id="ams-verified"
          label={hasBambuFile ? 'AMS slots match the setup shown above' : 'Printer setup matches this job'}
          checked={amsVerified}
          onChange={(e) => setAmsVerified(e.target.checked)}
          disabled={phase !== 'idle' && phase !== 'error'}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {error}
        </p>
      )}

      {phase === 'watching' && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Command status: {commandStatus} — waiting for the bridge…
        </p>
      )}

      <Button
        size="xl"
        className="w-full"
        disabled={!allChecked || phase === 'submitting' || phase === 'watching'}
        loading={phase === 'submitting'}
        onClick={handleStart}
      >
        Start {job.name}
      </Button>
    </div>
  );
}
