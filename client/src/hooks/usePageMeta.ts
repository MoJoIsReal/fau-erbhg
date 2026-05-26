import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const SITE_NAME = "FAU Erdal Barnehage";
const BASE_URL = "https://www.erdal-bhg.no";

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
  /** Page-specific title; the site name is appended automatically. */
  title: string;
  description: string;
  /** Canonical path (e.g. "/events"). Defaults to the current pathname. */
  path?: string;
}

/**
 * Keep per-route <title>, meta description, Open Graph/Twitter tags and the
 * canonical link in sync. The static tags in index.html only cover the
 * Norwegian homepage; this updates them client-side as the user navigates and
 * switches language.
 */
export function usePageMeta({ title, description, path }: PageMeta) {
  const { language } = useLanguage();

  useEffect(() => {
    const fullTitle = `${title} – ${SITE_NAME}`;
    document.title = fullTitle;

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:locale", language === "no" ? "no_NO" : "en_US");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);

    const canonicalPath = path ?? window.location.pathname;
    upsertCanonical(`${BASE_URL}${canonicalPath === "/" ? "" : canonicalPath}`);
  }, [title, description, path, language]);
}
