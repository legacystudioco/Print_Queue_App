import { clsx } from 'clsx';
import type { HTMLAttributes, Ref } from 'react';

/**
 * Base surface for the whole app — deliberately less rounded and more
 * sharply bordered than a typical soft SaaS card, closer to an equipment
 * inventory tag: a defined edge, a little depth, no floating-glass feel.
 *
 * Accepts `ref` (React 19 function components can receive it as a plain
 * prop) so the queue board's drag-and-drop can attach dnd-kit's node ref
 * directly to a Card without a separate wrapper element.
 */
export function Card({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-xl border border-charcoal-200 bg-white p-4 shadow-panel transition-shadow',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mb-3 flex items-center justify-between gap-2', className)} {...props} />;
}

/** Small uppercase label above a CardTitle or a stat — the "eyebrow" tag used throughout the dashboard. */
export function CardEyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={clsx('text-[11px] font-bold uppercase tracking-widest text-charcoal-400', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={clsx('text-base font-bold tracking-tight text-charcoal-900', className)} {...props} />
  );
}
