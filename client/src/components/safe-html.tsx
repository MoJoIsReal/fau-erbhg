import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface SafeHtmlProps {
  html?: string | null;
  className?: string;
  truncate?: number;
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

export default function SafeHtml({ html, className, truncate }: SafeHtmlProps) {
  const source = html ?? "";
  const displayHtml = truncate && source.length > truncate
    ? `${source.substring(0, truncate)}...`
    : source;

  return (
    <div
      className={cn("safe-html dark:prose-invert", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeClientHtml(displayHtml) }}
    />
  );
}
