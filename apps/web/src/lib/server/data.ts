import 'server-only';
import {
  deriveJobStatus,
  type Business,
  type JobStatus,
  type JobTemplatePlateRecord,
  type PlateRecord,
} from '@print-queue/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { JOB_SCREENSHOTS_BUCKET } from '../client/uploadJobScreenshot';
import type { Database } from '../supabase/database.types';
import { mapJob, mapJobTemplate, mapJobTemplatePlate, mapNotificationPreferences, mapPlate, mapPushSubscription } from './mappers';

type Client = SupabaseClient<Database>;
type JobRow = Database['public']['Tables']['jobs']['Row'];
type PlateRow = Database['public']['Tables']['plates']['Row'];
type JobWithPlateRows = JobRow & { plates: PlateRow[] };
type JobTemplateRow = Database['public']['Tables']['job_templates']['Row'];
type JobTemplatePlateRow = Database['public']['Tables']['job_template_plates']['Row'];
type JobTemplateWithPlateRows = JobTemplateRow & { plates: JobTemplatePlateRow[] };

/** A plate with its screenshot resolved to a viewable (signed, time-limited) URL. */
export type PlateWithScreenshotUrl = PlateRecord & { screenshotUrl: string | null };

/** A template plate with its screenshot resolved to a viewable (signed, time-limited) URL. */
export type TemplatePlateWithScreenshotUrl = JobTemplatePlateRecord & { screenshotUrl: string | null };

/** A job (customer/order) with all of its plates, each screenshot resolved. The Board/History card's shape. */
export type BoardJob = ReturnType<typeof mapJob> & { plates: PlateWithScreenshotUrl[] };

/** A template with all of its plates, each screenshot resolved. The Template Library/detail page's shape. */
export type TemplateWithPlates = ReturnType<typeof mapJobTemplate> & { plates: TemplatePlateWithScreenshotUrl[] };

/** Plenty for one open board session — regenerated fresh on every page load/refresh. */
const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Resolves each item's `screenshotPath` (a private-bucket object path) to a
 * signed URL the browser can load directly — the job-screenshots bucket is
 * private + RLS-gated (see migration 0017), so there's no public URL to
 * just construct. Generic over plates and template plates since both are
 * just `{ screenshotPath }`-shaped records signed against the same bucket.
 */
async function attachScreenshotUrls<T extends { screenshotPath: string | null }>(
  supabase: Client,
  items: T[],
): Promise<(T & { screenshotUrl: string | null })[]> {
  const paths = items.map((item) => item.screenshotPath).filter((p): p is string => p !== null);
  if (paths.length === 0) return items.map((item) => ({ ...item, screenshotUrl: null }));

  const { data, error } = await supabase.storage
    .from(JOB_SCREENSHOTS_BUCKET)
    .createSignedUrls(paths, SCREENSHOT_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('attachScreenshotUrls: failed to sign screenshot URLs', { error: error.message });
    return items.map((item) => ({ ...item, screenshotUrl: null }));
  }

  const urlByPath = new Map(data.filter((d) => !d.error).map((d) => [d.path, d.signedUrl]));
  return items.map((item) => ({
    ...item,
    screenshotUrl: item.screenshotPath ? (urlByPath.get(item.screenshotPath) ?? null) : null,
  }));
}

/** Maps jobs (each already joined with its raw plate rows) into the Board's shape, sorting plates by sort_order and resolving every screenshot in one batched signing call. */
async function mapJobsWithScreenshots(supabase: Client, rows: JobWithPlateRows[]): Promise<BoardJob[]> {
  const allPlates = rows.flatMap((row) => row.plates).map(mapPlate);
  const platesWithUrls = await attachScreenshotUrls(supabase, allPlates);
  const plateById = new Map(platesWithUrls.map((p) => [p.id, p]));

  return rows.map((row) => {
    const plates = row.plates
      .map((p) => plateById.get(p.id))
      .filter((p): p is PlateWithScreenshotUrl => p !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...mapJob(row), plates };
  });
}

/**
 * The production board's active jobs (completed_at is null) across both
 * business columns, in queue order — see components/board/ProductionBoard.tsx.
 * Grouping into columns is a client-side concern, not a second server query.
 */
export async function getBoardJobs(supabase: Client): Promise<BoardJob[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, plates(*)')
    .is('completed_at', null)
    .order('queue_position', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return mapJobsWithScreenshots(supabase, data as JobWithPlateRows[]);
}

/** History: every job whose completed_at has been stamped (see recompute_job_completed_at, migration 0018). */
export async function getBoardHistory(supabase: Client, limit = 50): Promise<BoardJob[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, plates(*)')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return mapJobsWithScreenshots(supabase, data as JobWithPlateRows[]);
}

/**
 * One job with all of its plates — used by the job detail page. Reprint
 * lineage (parent_plate_id) is resolvable directly from `plates` here since
 * a reprint always stays under the same job — no separate query needed.
 */
export async function getJobWithPlates(supabase: Client, jobId: string): Promise<BoardJob | null> {
  const { data, error } = await supabase.from('jobs').select('*, plates(*)').eq('id', jobId).maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (await mapJobsWithScreenshots(supabase, [data as JobWithPlateRows]))[0] ?? null;
}

export interface SearchJobsParams {
  /** Case-insensitive substring match against customer_name. */
  q?: string;
  business?: Business;
  /** Derived status (see deriveJobStatus) — not a DB column, so this filters in memory after fetch. */
  status?: JobStatus;
  /** Only jobs with exactly one plate — the "Group Existing Jobs" wizard's candidate list. */
  standaloneOnly?: boolean;
  /** Excludes one job — used by "Move into Job" so a job can't be offered as its own target. */
  excludeJobId?: string;
}

/**
 * Jobs matching the given filters, most recently created first — powers the
 * "Group Existing Jobs" wizard's candidate list and "Move into Job"'s target
 * list (see apps/web/src/components/board/JobPickerList.tsx). Unlike
 * getBoardJobs/getBoardHistory, this deliberately does not filter on
 * completed_at — either flow may reasonably want to reach an already
 * completed job.
 */
export async function searchJobs(supabase: Client, params: SearchJobsParams = {}): Promise<BoardJob[]> {
  let query = supabase.from('jobs').select('*, plates(*)').order('created_at', { ascending: false });

  if (params.q) query = query.ilike('customer_name', `%${params.q}%`);
  if (params.business) query = query.eq('business', params.business);
  if (params.excludeJobId) query = query.neq('id', params.excludeJobId);

  const { data, error } = await query;
  if (error) throw error;

  let jobs = await mapJobsWithScreenshots(supabase, data as JobWithPlateRows[]);

  if (params.standaloneOnly) jobs = jobs.filter((job) => job.plates.length === 1);
  if (params.status) {
    jobs = jobs.filter((job) => deriveJobStatus(job.plates.map((p) => p.status)) === params.status);
  }

  return jobs;
}

/** Maps templates (each already joined with its raw plate rows) into the Library/detail page's shape, sorting plates by sort_order and resolving every screenshot in one batched signing call — mirrors mapJobsWithScreenshots. */
async function mapTemplatesWithScreenshots(
  supabase: Client,
  rows: JobTemplateWithPlateRows[],
): Promise<TemplateWithPlates[]> {
  const allPlates = rows.flatMap((row) => row.plates).map(mapJobTemplatePlate);
  const platesWithUrls = await attachScreenshotUrls(supabase, allPlates);
  const plateById = new Map(platesWithUrls.map((p) => [p.id, p]));

  return rows.map((row) => {
    const plates = row.plates
      .map((p) => plateById.get(p.id))
      .filter((p): p is TemplatePlateWithScreenshotUrl => p !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...mapJobTemplate(row), plates };
  });
}

export interface SearchJobTemplatesParams {
  /** Case-insensitive substring match against name. */
  q?: string;
  /** Archived templates are hidden from the library by default. */
  includeArchived?: boolean;
}

/** Templates matching the given filters, most recently updated first — powers the Template Library page and the "Create Job from Template" picker. */
export async function getJobTemplates(
  supabase: Client,
  params: SearchJobTemplatesParams = {},
): Promise<TemplateWithPlates[]> {
  let query = supabase
    .from('job_templates')
    .select('*, plates:job_template_plates(*)')
    .order('updated_at', { ascending: false });

  if (params.q) query = query.ilike('name', `%${params.q}%`);
  if (!params.includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;
  return mapTemplatesWithScreenshots(supabase, data as JobTemplateWithPlateRows[]);
}

/** One template with all of its plates — used by the template detail/edit page and "Create Job from Template". */
export async function getJobTemplateWithPlates(supabase: Client, templateId: string): Promise<TemplateWithPlates | null> {
  const { data, error } = await supabase
    .from('job_templates')
    .select('*, plates:job_template_plates(*)')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (await mapTemplatesWithScreenshots(supabase, [data as JobTemplateWithPlateRows]))[0] ?? null;
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
