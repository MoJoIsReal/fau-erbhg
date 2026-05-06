import { cn } from "@/lib/utils";

interface SafeHtmlProps {
  html?: string | null;
  className?: string;
  truncate?: number;
}

function sanitizeClientHtml(html: string) {
  if (typeof window === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content
    .querySelectorAll("script, iframe, object, embed, svg, math, style, link, meta")
    .forEach((node) => node.remove());

  template.content.querySelectorAll<HTMLElement>("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
      }

      if ((name === "href" || name === "src") && /^(javascript|data):/i.test(value)) {
        node.removeAttribute(attr.name);
      }
    }
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
      className={cn("safe-html", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeClientHtml(displayHtml) }}
    />
  );
}
