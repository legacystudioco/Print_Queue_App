'use client';

import { clsx } from 'clsx';
import { AlertCircle, UploadCloud, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  dataTransferLooksInvalid,
  pickScreenshotFile,
  validateScreenshotFile,
} from '@/lib/client/uploadJobScreenshot';

type DragState = 'none' | 'valid' | 'invalid';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageDropZoneProps {
  /** Accessible name for the control, and the bold instruction shown in the empty/idle state. */
  label: string;
  /** Secondary line shown under the label in the empty/idle state (e.g. accepted formats). */
  hint?: string;
  /** Small note always rendered below the control, regardless of state (e.g. "Leave unchanged to keep the current screenshot."). */
  helpText?: string;
  /** Currently selected local file, if any — controlled by the parent form. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** An already-uploaded image to show when there's no new local file selected (Edit Job). */
  existingImageUrl?: string | null;
  /** Alt text for whichever image is currently shown (local preview or existing). */
  imageAlt: string;
  disabled?: boolean;
  /** True while the parent form is uploading `file` — preserves the preview, blocks further changes. */
  uploading?: boolean;
  uploadProgress?: number | null;
  /** Focuses the control on mount — used by Edit Job for a job that has no screenshot yet. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * A single reusable file-picker + native-drag-and-drop + preview control for
 * a job's screenshot, shared by AddJobForm and EditJobForm so the
 * validation/preview/replace logic lives in exactly one place.
 *
 * Deliberately does not use @dnd-kit — that library drives the board's
 * card-reordering via pointer events; this component reacts to the
 * browser's native HTML5 drag-and-drop events (dragenter/dragover/drop),
 * which fire for OS-level file drags (e.g. from Finder) and never overlap
 * with dnd-kit's pointer-based card dragging.
 */
export function ImageDropZone({
  label,
  hint,
  helpText,
  file,
  onFileChange,
  existingImageUrl,
  imageAlt,
  disabled = false,
  uploading = false,
  uploadProgress,
  autoFocus = false,
  className,
}: ImageDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const [dragState, setDragState] = useState<DragState>('none');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const interactionsDisabled = disabled || uploading;

  // Local preview URL for the selected File — created/revoked whenever the
  // file changes, and on unmount, so nothing leaks.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (autoFocus) containerRef.current?.focus();
  }, [autoFocus]);

  function acceptFile(selected: File) {
    const validationError = validateScreenshotFile(selected);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onFileChange(selected);
  }

  function openPicker() {
    if (interactionsDisabled) return;
    inputRef.current?.click();
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Reset so choosing the same file again still fires a change event.
    event.target.value = '';
    if (selected) acceptFile(selected);
  }

  function handleClick() {
    openPicker();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (interactionsDisabled) return;
    dragCounter.current += 1;
    setDragState(dataTransferLooksInvalid(event.dataTransfer) ? 'invalid' : 'valid');
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    // Required so the browser allows a drop here at all.
    event.preventDefault();
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (interactionsDisabled) return;
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragState('none');
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragState('none');
    if (interactionsDisabled) return;

    const { file: picked, error: pickError } = pickScreenshotFile(event.dataTransfer.files);
    setError(pickError);
    if (picked) onFileChange(picked);
  }

  function handleRemove(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setError(null);
    onFileChange(null);
  }

  const hasPreview = Boolean(previewUrl || existingImageUrl);
  const previewSrc = previewUrl ?? existingImageUrl ?? undefined;

  return (
    <div className={className}>
      {/* The real, always-present file input — hidden visually but reachable
          via the visible control below, per WCAG's "real control" guidance
          rather than relying on drag as the only way in. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={interactionsDisabled}
        onChange={handleInputChange}
      />
      <div
        ref={containerRef}
        role="button"
        tabIndex={interactionsDisabled ? -1 : 0}
        aria-label={label}
        aria-disabled={interactionsDisabled || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          'relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2',
          !hasPreview && 'min-h-[10rem]',
          dragState === 'valid' && 'border-accent-500 bg-accent-50',
          dragState === 'invalid' && 'border-danger-500 bg-danger-50',
          dragState === 'none' && 'border-charcoal-300 hover:border-charcoal-400',
          interactionsDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
        )}
      >
        {hasPreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or short-lived signed URL, not worth Next/Image's remote-loader machinery */}
            <img src={previewSrc} alt={imageAlt} className="max-h-48 w-full rounded-lg object-contain" />
            {file && (
              <p className="text-xs text-charcoal-500">
                {file.name} — {formatFileSize(file.size)}
              </p>
            )}
            <p className="text-xs font-semibold text-charcoal-500">
              {dragState === 'invalid'
                ? 'Unsupported file type'
                : dragState === 'valid'
                  ? 'Drop image here'
                  : uploading
                    ? `Uploading${typeof uploadProgress === 'number' ? ` — ${uploadProgress}%` : '…'}`
                    : existingImageUrl
                      ? 'Click or drop to replace'
                      : 'Click or drop to change'}
            </p>
            {uploadProgress != null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-charcoal-100">
                <div
                  className="h-full rounded-full bg-accent-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            {file && !uploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="relative z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-danger-600 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {existingImageUrl ? 'Remove selected replacement' : 'Remove image'}
              </button>
            )}
          </>
        ) : (
          <>
            {dragState === 'invalid' ? (
              <AlertCircle className="h-8 w-8 text-danger-500" aria-hidden="true" />
            ) : (
              <UploadCloud
                className={clsx('h-8 w-8', dragState === 'valid' ? 'text-accent-600' : 'text-charcoal-300')}
                aria-hidden="true"
              />
            )}
            <p className="text-sm font-bold text-charcoal-700">
              {dragState === 'invalid' ? 'Unsupported file type' : dragState === 'valid' ? 'Drop image here' : label}
            </p>
            {hint && dragState === 'none' && <p className="text-xs text-charcoal-400">{hint}</p>}
          </>
        )}
      </div>
      {helpText && <p className="mt-1 text-xs text-charcoal-500">{helpText}</p>}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
