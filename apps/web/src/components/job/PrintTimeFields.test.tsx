// @vitest-environment jsdom
import type { CreatePrintJobInput } from '@print-queue/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useForm } from 'react-hook-form';
import { PrintTimeFields } from './PrintTimeFields';

afterEach(() => cleanup());

/** Wraps PrintTimeFields in a real react-hook-form instance and exposes the live estimatedDurationSeconds value for assertions. */
function Harness({ initialSeconds = null }: { initialSeconds?: number | null }) {
  const { control, watch } = useForm<CreatePrintJobInput>({
    defaultValues: { estimatedDurationSeconds: initialSeconds },
  });
  const seconds = watch('estimatedDurationSeconds');

  return (
    <div>
      <PrintTimeFields control={control} />
      <output data-testid="seconds">{seconds === null || seconds === undefined ? 'null' : seconds}</output>
    </div>
  );
}

function hoursInput() {
  return screen.getByLabelText(/hours/i) as HTMLInputElement;
}
function minutesInput() {
  return screen.getByLabelText(/minutes/i) as HTMLInputElement;
}

describe('PrintTimeFields — converting stored seconds back into hours/minutes', () => {
  it('shows 0h 0m when no duration is set', () => {
    render(<Harness />);
    expect(hoursInput().value).toBe('0');
    expect(minutesInput().value).toBe('0');
  });

  it('splits 225 minutes (13500s) into 3h 45m', () => {
    render(<Harness initialSeconds={225 * 60} />);
    expect(hoursInput().value).toBe('3');
    expect(minutesInput().value).toBe('45');
  });

  it('splits 62 minutes into 1h 2m', () => {
    render(<Harness initialSeconds={62 * 60} />);
    expect(hoursInput().value).toBe('1');
    expect(minutesInput().value).toBe('2');
  });

  it('splits 480 minutes into 8h 0m', () => {
    render(<Harness initialSeconds={480 * 60} />);
    expect(hoursInput().value).toBe('8');
    expect(minutesInput().value).toBe('0');
  });
});

describe('PrintTimeFields — editing recomputes total seconds', () => {
  it('combines 3h + 45m into 225 minutes worth of seconds (13500)', () => {
    render(<Harness />);
    fireEvent.change(hoursInput(), { target: { value: '3' } });
    fireEvent.change(minutesInput(), { target: { value: '45' } });
    expect(screen.getByTestId('seconds').textContent).toBe(String(225 * 60));
  });

  it('combines 10h + 15m into 615 minutes worth of seconds', () => {
    render(<Harness />);
    fireEvent.change(hoursInput(), { target: { value: '10' } });
    fireEvent.change(minutesInput(), { target: { value: '15' } });
    expect(screen.getByTestId('seconds').textContent).toBe(String(615 * 60));
  });

  it('treats 0h 0m as "no estimate" (null), not zero seconds', () => {
    render(<Harness initialSeconds={60 * 60} />);
    fireEvent.change(hoursInput(), { target: { value: '0' } });
    expect(screen.getByTestId('seconds').textContent).toBe('null');
  });

  it('clamps minutes entered above 59 down to 59', () => {
    render(<Harness />);
    fireEvent.change(minutesInput(), { target: { value: '90' } });
    expect(minutesInput().value).toBe('59');
    expect(screen.getByTestId('seconds').textContent).toBe(String(59 * 60));
  });

  it('clamps hours entered above 999 down to 999', () => {
    render(<Harness />);
    fireEvent.change(hoursInput(), { target: { value: '5000' } });
    expect(hoursInput().value).toBe('999');
  });

  it('clamps a negative value to zero rather than going negative', () => {
    render(<Harness />);
    fireEvent.change(minutesInput(), { target: { value: '-5' } });
    expect(minutesInput().value).toBe('0');
  });
});

function HarnessWithError({ error }: { error: string }) {
  const { control } = useForm<CreatePrintJobInput>();
  return <PrintTimeFields control={control} error={error} />;
}

describe('PrintTimeFields — error display', () => {
  it('renders a validation error message when passed one', () => {
    render(<HarnessWithError error="Duration is too long" />);
    expect(screen.getByText('Duration is too long')).toBeTruthy();
  });
});
