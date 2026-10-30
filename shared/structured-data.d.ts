export type JsonLd = Record<string, unknown>;

export const SITE_NAME: string;

export function organizationJsonLd(baseUrl: string): JsonLd;

export function plainDescription(html: string | null | undefined, maxLength?: number): string;

export function eventStartDate(date: string | null | undefined, time: string | null | undefined): string | null;

export interface StructuredDataEvent {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  time?: string | null;
  location?: string | null;
  customLocation?: string | null;
  status?: string | null;
}

export function eventJsonLd(event: StructuredDataEvent, baseUrl: string): JsonLd | null;

export function upcomingEventsJsonLd(
  events: StructuredDataEvent[] | null | undefined,
  baseUrl: string,
  options?: { now?: Date; limit?: number },
): JsonLd[];

export function newsPostPath(id: number | string): string;

export function articleJsonLd(
  post: { id: number; title: string; content: string; publishedDate: string; author?: string | null },
  baseUrl: string,
): JsonLd;

export function newsSitemapXml(
  posts: Array<{ id: number; publishedDate?: string | null; updatedAt?: string | null }> | null | undefined,
  baseUrl: string,
): string;
