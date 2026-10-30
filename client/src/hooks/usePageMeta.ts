import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { SITE_NAME, type JsonLd } from "@shared/structured-data";

export const BASE_URL = "https://www.erdal-bhg.no";

function upsertMeta(key: "name" | "property", keyValue: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${keyValue}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(key, keyValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

interface PageMeta {
  /**
   * Page-specific title; the site name is appended automatically unless the
   * title already carries it (the homepage's does).
   */
  title: string;
  description: string;
  /** Canonical path (e.g. "/events"). Defaults to the current pathname. */
  path?: string;
  /**
   * Keep the page out of search results: a 404, a page that only works from
   * a link in an email, or a post that does not exist.
   */
  noindex?: boolean;
  /** schema.org data describing the page (shared/structured-data.js). */
  jsonLd?: JsonLd | JsonLd[] | null;
  /**
   * Set false when the component renders inside a parent that owns the
   * document metadata, so nested pages don't fight over <title>. Defaults
   * to true.
   */
  enabled?: boolean;
}

/**
 * Keep per-route <title>, meta description, Open Graph/Twitter tags, the
 * canonical link, robots and the page's JSON-LD in sync. index.html is served
 * for every route, so it carries no canonical or og:url of its own; this sets
 * them client-side as the user navigates and switches language. Google reads
 * the result after rendering the page.
 */
export function usePageMeta({ title, description, path, noindex = false, jsonLd, enabled = true }: PageMeta) {
  const { language } = useLanguage();
  // Serialised here so a fresh object each render does not rerun the effect.
  const structuredData = jsonLd && (!Array.isArray(jsonLd) || jsonLd.length > 0) ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    if (!enabled) return;

    const fullTitle = title.includes(SITE_NAME) ? title : `${title} – ${SITE_NAME}`;
    document.title = fullTitle;

    const canonicalPath = path ?? window.location.pathname;
    const canonicalUrl = `${BASE_URL}${canonicalPath === "/" ? "" : canonicalPath}`;

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:locale", language === "no" ? "no_NO" : "en_US");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertCanonical(canonicalUrl);
  }, [title, description, path, language, enabled]);

  // Owned by the page that set them, and removed when it unmounts, so a 404
  // or the next page never inherits a noindex or another page's events.
  useEffect(() => {
    if (!enabled || !noindex) return;
    const el = document.createElement("meta");
    el.setAttribute("name", "robots");
    el.setAttribute("content", "noindex");
    document.head.appendChild(el);
    return () => el.remove();
  }, [noindex, enabled]);

  useEffect(() => {
    if (!enabled || !structuredData) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    // A data block, not script: CSP does not apply, and `<` is escaped so a
    // title can never close the element if this is ever serialised to HTML.
    el.textContent = structuredData.replace(/</g, "\\u003c");
    document.head.appendChild(el);
    return () => el.remove();
  }, [structuredData, enabled]);
}
