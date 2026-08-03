// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageDropZone, type ImageDropZoneProps } from './ImageDropZone';

let blobUrlCounter = 0;

beforeEach(() => {
  blobUrlCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${blobUrlCounter++}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pngFile(name = 'plate.png', size = 1000) {
  const file = new File([new Uint8Array(size)], name, { type: 'image/png' });
  return file;
}

/** Drives the controlled `file`/`onFileChange` pair like a real parent form would, so re-renders (preview swaps) are observable. */
function ControlledDropZone({
  onFileChangeSpy,
  ...props
}: Partial<ImageDropZoneProps> & { onFileChangeSpy?: (file: File | null) => void }) {
  const [file, setFile] = useState<File | null>(props.file ?? null);
  return (
    <ImageDropZone
      label="Add screenshot"
      imageAlt="preview"
      {...props}
      file={file}
      onFileChange={(next) => {
        setFile(next);
        onFileChangeSpy?.(next);
      }}
    />
  );
}

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

describe('ImageDropZone — picker', () => {
  it('clicking the drop zone opens the file picker', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<ImageDropZone label="Add screenshot" file={null} onFileChange={vi.fn()} imageAlt="preview" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add screenshot' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('Enter and Space on the focused drop zone also open the picker', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<ImageDropZone label="Add screenshot" file={null} onFileChange={vi.fn()} imageAlt="preview" />);
    const zone = screen.getByRole('button', { name: 'Add screenshot' });

    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyDown(zone, { key: ' ' });

    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe('ImageDropZone — selection and preview', () => {
  it('selecting a valid image via the file input calls onFileChange and shows a preview', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    const file = pngFile();

    fireEvent.change(getInput(container), { target: { files: [file] } });

    expect(onFileChangeSpy).toHaveBeenCalledWith(file);
    const preview = screen.getByAltText('preview') as HTMLImageElement;
    expect(preview.src).toContain('blob:mock-');
  });

  it('dropping a valid image shows a preview', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    const file = pngFile();
    const zone = container.querySelector('[role="button"]')!;

    fireEvent.drop(zone, { dataTransfer: { files: [file], items: [{ kind: 'file', type: 'image/png' }] } });

    expect(onFileChangeSpy).toHaveBeenCalledWith(file);
    expect((screen.getByAltText('preview') as HTMLImageElement).src).toContain('blob:mock-');
  });
});

describe('ImageDropZone — validation', () => {
  it('rejects a file with an unsupported extension', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(getInput(container), { target: { files: [file] } });

    expect(onFileChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/must be an image/i);
    expect(screen.queryByAltText('preview')).toBeNull();
  });

  it('rejects a file whose MIME type does not match its extension', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    // Extension looks fine, but the browser-reported type is a definite mismatch.
    const file = new File(['x'], 'plate.png', { type: 'application/pdf' });

    fireEvent.change(getInput(container), { target: { files: [file] } });

    expect(onFileChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/must be an image/i);
  });

  it('rejects a file larger than the size limit', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    const file = pngFile('huge.png', 21 * 1024 * 1024);

    fireEvent.change(getInput(container), { target: { files: [file] } });

    expect(onFileChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/larger than the 20 MB limit/i);
  });

  it('dropping multiple files uses only the first valid image and reports the one-image rule', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(<ControlledDropZone onFileChangeSpy={onFileChangeSpy} />);
    const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const good = pngFile('plate.png');
    const zone = container.querySelector('[role="button"]')!;

    fireEvent.drop(zone, { dataTransfer: { files: [bad, good] } });

    expect(onFileChangeSpy).toHaveBeenCalledWith(good);
    expect(screen.getByRole('alert').textContent).toMatch(/only one screenshot is used per job/i);
  });
});

describe('ImageDropZone — replace/remove', () => {
  it('removing a selected replacement restores the existing image preview', () => {
    const onFileChangeSpy = vi.fn();
    const { container } = render(
      <ControlledDropZone
        onFileChangeSpy={onFileChangeSpy}
        label="Replace screenshot"
        existingImageUrl="https://example.com/current.png"
      />,
    );

    fireEvent.change(getInput(container), { target: { files: [pngFile()] } });
    expect((screen.getByAltText('preview') as HTMLImageElement).src).toContain('blob:mock-');

    fireEvent.click(screen.getByRole('button', { name: /remove selected replacement/i }));

    expect(onFileChangeSpy).toHaveBeenLastCalledWith(null);
    expect((screen.getByAltText('preview') as HTMLImageElement).src).toBe('https://example.com/current.png');
  });
});

describe('ImageDropZone — object URL cleanup', () => {
  it('revokes the previous preview URL when the file changes, and on unmount', () => {
    const { container, unmount } = render(<ControlledDropZone />);

    fireEvent.change(getInput(container), { target: { files: [pngFile('a.png')] } });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.change(getInput(container), { target: { files: [pngFile('b.png')] } });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });
});
