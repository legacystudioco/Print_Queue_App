import type { BoardJobWithScreenshotUrl } from '@/lib/server/data';

/** A job as rendered on the production board — shared by ProductionBoard, BoardColumn, and JobCard. */
export type BoardJob = BoardJobWithScreenshotUrl;
