// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
});

function renderModal(onClose = vi.fn()) {
  render(
    <div>
      <button type="button">Outside trigger</button>
      <Modal open onClose={onClose} title="Add Print">
        <button type="button">First field</button>
        <button type="button">Last field</button>
      </Modal>
    </div>,
  );
  return onClose;
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Add Print">
        <p>content</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders as an accessible dialog with the given title when open', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Add Print')).toBeTruthy();
    expect(screen.getByText('First field')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = renderModal();
    const dialog = screen.getByRole('dialog');
    // The backdrop is the sibling element rendered alongside the dialog panel.
    const backdrop = dialog.previousSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the panel', () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByText('First field'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
