import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight text-charcoal-900">Page not found</h1>
      <p className="text-sm text-charcoal-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/dashboard" className="text-sm font-bold text-accent-600 hover:text-accent-700">
        Back to dashboard
      </Link>
    </main>
  );
}
