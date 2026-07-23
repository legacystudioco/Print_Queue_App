import { DEFAULT_NOTIFICATION_PREFERENCES } from '@print-queue/shared';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { getCurrentAppUser } from '@/lib/server/auth';
import { getNotificationPreferences, getPushSubscriptions } from '@/lib/server/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is read directly (not through
 * lib/server/notificationEnv.ts's `requireEnv`, which throws) specifically
 * so a missing key degrades to a UI message instead of a Server Components
 * render crash — see docs/push-notifications.md. It's safe to read
 * `NEXT_PUBLIC_*` vars server-side too; only the client bundle needs the
 * literal `process.env.NEXT_PUBLIC_X` form for build-time inlining.
 */
function isVapidConfigured(): boolean {
  const configured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  if (!configured) {
    console.warn(
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — Settings will show notifications as unconfigured. See docs/push-notifications.md.',
    );
  }
  return configured;
}

export default async function SettingsPage() {
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <EmptyState
        title="Signed out"
        description="Your session isn't available right now. Sign in again to manage settings."
      />
    );
  }

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
          vapidConfigured={isVapidConfigured()}
          initialPreferences={preferences ?? DEFAULT_NOTIFICATION_PREFERENCES}
          activeDeviceCount={subscriptions.filter((s) => !s.disabledAt).length}
        />
      </Card>
    </div>
  );
}
