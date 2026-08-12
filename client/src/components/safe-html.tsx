import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface SafeHtmlProps {
  html?: string | null;
  className?: string;
  truncate?: number;
}

// Defense-in-depth: drop the src of any image not hosted in our Cloudinary
// account so legacy content can't load third-party images (e.g. tracking
// pixels) in the visitor's browser. The server sanitizer enforces the same on
// write; this covers content stored before that was in place.
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || "";
      try {
        const url = new URL(src, window.location.origin);
        if (!(url.protocol === "https:" && url.hostname === "res.cloudinary.com")) {
          node.removeAttribute("src");
        }
      } catch {
        node.removeAttribute("src");
      }
    }
  });
}

function sanitizeClientHtml(html: string) {
  if (typeof window === "undefined") return "";

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li", "blockquote", "code", "pre",
      "h1", "h2", "h3", "a", "img"
    ],
    ALLOWED_ATTR: ["href", "src", "alt"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;

  template.content.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((node) => {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });

  return template.innerHTML;
}

// Build a plain-text excerpt from already-sanitized HTML. Counting characters
// on the raw markup (which is what this used to do) meant a post starting with
// an image spent its whole budget on the <img src="https://res.cloudinary.com/…">
// URL, so the teaser rendered a full-width poster and barely any words. Excerpts
// are text only: markup and images belong on the full post, not in a preview.
function excerptFromHtml(sanitizedHtml: string, limit: number): string {
  if (typeof window === "undefined") return "";

  const template = document.createElement("template");
  template.innerHTML = sanitizedHtml;
  const text = (template.content.textContent ?? "").replace(/\s+/g, " ").trim();

  if (text.length <= limit) return text;

  // Cut on a word boundary when one is close enough to the limit, so the
  // excerpt doesn't end mid-word.
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s.,;:!?-]+$/, "")}…`;
}

export default function SafeHtml({ html, className, truncate }: SafeHtmlProps) {
  const sanitized = sanitizeClientHtml(html ?? "");

  if (truncate) {
    return (
      <div className={cn("safe-html dark:prose-invert", className)}>
        {excerptFromHtml(sanitized, truncate)}
      </div>
    );
  }

  return (
    <div
      className={cn("safe-html dark:prose-invert", className)}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
