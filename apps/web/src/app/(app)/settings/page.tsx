import { DEFAULT_NOTIFICATION_PREFERENCES } from '@print-queue/shared';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getNotificationPreferences, getPushSubscriptions } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentAppUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const [preferences, subscriptions] = await Promise.all([
    getNotificationPreferences(supabase, user.id),
    getPushSubscriptions(supabase, user.id),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-charcoal-900">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <NotificationSettings
          userId={user.id}
          initialPreferences={preferences ?? DEFAULT_NOTIFICATION_PREFERENCES}
          activeDeviceCount={subscriptions.filter((s) => !s.disabledAt).length}
        />
      </Card>
    </div>
  );
}
