import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { getCurrentAppUser } from '@/lib/server/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect('/login');
  }

  return <AppShell user={user}>{children}</AppShell>;
}
