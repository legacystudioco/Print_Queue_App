import type { BoardJob as BoardJobRecord, PlateWithScreenshotUrl } from '@/lib/server/data';

/** A customer/order with its plates, as rendered on the production board — shared by ProductionBoard, BoardColumn, and JobCard. */
export type BoardJob = BoardJobRecord;

/** One plate of a BoardJob, screenshot resolved — shared by JobCard/PlateRow. */
export type BoardPlate = PlateWithScreenshotUrl;
