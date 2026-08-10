import type { TemplatePlateWithScreenshotUrl, TemplateWithPlates as TemplateWithPlatesRecord } from '@/lib/server/data';

/** A template with its plates, as rendered by the Template Library/detail page — shared across components/templates. */
export type TemplateWithPlates = TemplateWithPlatesRecord;

/** One plate of a TemplateWithPlates, screenshot resolved. */
export type TemplatePlate = TemplatePlateWithScreenshotUrl;
