import 'server-only';
import type { BoardJobRecord } from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JOB_SCREENSHOTS_BUCKET } from '../client/uploadJobScreenshot';
import type { Database } from '../supabase/database.types';
import { mapBoardJob, mapNotificationPreferences, mapPushSubscription } from './mappers';

type Client = SupabaseClient<Database>;

/** A board job with its screenshot resolved to a viewable (signed, time-limited) URL. */
export type BoardJobWithScreenshotUrl = BoardJobRecord & { screenshotUrl: string | null };

const ACTIVE_BOARD_STATUSES = ['queued', 'printing'] as const;
const TERMINAL_BOARD_STATUSES = ['partial', 'completed'] as const;

/** Plenty for one open board session — regenerated fresh on every page load/refresh. */
const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Resolves each job's `screenshotPath` (a private-bucket object path) to a
 * signed URL the browser can load directly — the job-screenshots bucket
 * mirrors print-files' private + RLS-gated model (see migration 0017), so
 * there's no public URL to just construct.
 */
async function attachScreenshotUrls(
  supabase: Client,
  jobs: BoardJobRecord[],
): Promise<BoardJobWithScreenshotUrl[]> {
  const paths = jobs.map((j) => j.screenshotPath).filter((p): p is string => p !== null);
  if (paths.length === 0) return jobs.map((job) => ({ ...job, screenshotUrl: null }));

  const { data, error } = await supabase.storage
    .from(JOB_SCREENSHOTS_BUCKET)
    .createSignedUrls(paths, SCREENSHOT_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('attachScreenshotUrls: failed to sign screenshot URLs', { error: error.message });
    return jobs.map((job) => ({ ...job, screenshotUrl: null }));
  }

  const urlByPath = new Map(data.filter((d) => !d.error).map((d) => [d.path, d.signedUrl]));
  return jobs.map((job) => ({
    ...job,
    screenshotUrl: job.screenshotPath ? (urlByPath.get(job.screenshotPath) ?? null) : null,
  }));
}

/**
 * The production board's active (non-terminal) jobs across both business
 * columns, in queue order — QueueBoard-equivalent for the new board
 * (see components/board/ProductionBoard.tsx). Grouping into columns is a
 * client-side concern, not a second server query.
 */
export async function getBoardJobs(supabase: Client): Promise<BoardJobWithScreenshotUrl[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .in('board_status', ACTIVE_BOARD_STATUSES)
    .order('queue_position', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return attachScreenshotUrls(supabase, data.map(mapBoardJob));
}

export async function getBoardJob(supabase: Client, jobId: string): Promise<BoardJobWithScreenshotUrl | null> {
  const { data, error } = await supabase.from('print_jobs').select('*').eq('id', jobId).maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (await attachScreenshotUrls(supabase, [mapBoardJob(data)]))[0] ?? null;
}

/**
 * A job plus its reprint lineage: the parent it was reprinted from (if any)
 * and any reprint(s) created from it (if any) — see parent_job_id and
 * create_partial_reprint in supabase/migrations/0017_production_board.sql.
 */
export async function getBoardJobWithLineage(
  supabase: Client,
  jobId: string,
): Promise<{
  job: BoardJobWithScreenshotUrl;
  parent: BoardJobWithScreenshotUrl | null;
  children: BoardJobWithScreenshotUrl[];
} | null> {
  const job = await getBoardJob(supabase, jobId);
  if (!job) return null;

  const [parent, childRows] = await Promise.all([
    job.parentJobId ? getBoardJob(supabase, job.parentJobId) : Promise.resolve(null),
    supabase
      .from('print_jobs')
      .select('*')
      .eq('parent_job_id', jobId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return data.map(mapBoardJob);
      }),
  ]);
  const children = await attachScreenshotUrls(supabase, childRows);

  return { job, parent, children };
}

/** Terminal-status jobs (History): partial and completed. */
export async function getBoardHistory(supabase: Client, limit = 50): Promise<BoardJobWithScreenshotUrl[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .in('board_status', TERMINAL_BOARD_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return attachScreenshotUrls(supabase, data.map(mapBoardJob));
}

export async function getAppUsersByIds(supabase: Client, ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('app_users')
    .select('id, display_name, email')
    .in('id', ids);

  if (error) throw error;
  return data;
}

/** 1-based position of a job within its business's active queue, or null. */
export async function getQueuePosition(supabase: Client, jobId: string): Promise<number | null> {
  const jobs = await getBoardJobs(supabase);
  const index = jobs.findIndex((j) => j.id === jobId);
  return index === -1 ? null : index + 1;
}

/**
 * This user's push subscriptions across every browser/device they've
 * enabled notifications on, active ones first.
 *
 * Unlike every other function in this file, this deliberately does NOT
 * `throw error` — push notifications are an optional, independently
 * migrated feature (see supabase/migrations/0008_notifications.sql), and
 * the Settings page must still render (as "notifications unavailable",
 * not a 500) if that migration hasn't been applied yet to a given
 * environment, or the query fails for any other reason. This is exactly
 * what caused the Settings page's Server Components render crash — see
 * docs/push-notifications.md.
 */
export async function getPushSubscriptions(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('disabled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('getPushSubscriptions failed — treating as "no subscriptions" so Settings can still render', {
      userId,
      error: error.message,
    });
    return [];
  }
  return data.map(mapPushSubscription);
}

/**
 * This user's notification preferences, or null if they've never visited
 * Settings yet, OR if the query failed for any reason (missing table,
 * transient DB error, ...) — callers should treat both the same way:
 * fall back to `DEFAULT_NOTIFICATION_PREFERENCES`. See getPushSubscriptions
 * above for why this doesn't `throw error` like the rest of this file.
 */
export async function getNotificationPreferences(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('getNotificationPreferences failed — falling back to defaults so Settings can still render', {
      userId,
      error: error.message,
    });
    return null;
  }
  return data ? mapNotificationPreferences(data) : null;
}
