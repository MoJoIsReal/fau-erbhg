import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { EmptyState } from "@/components/site/section";
import { StatusPill } from "@/components/site/controls";

interface BlogPost {
  id: number;
  title: string;
  content: string;
  category: "news" | "tips";
  publishedDate: string;
  author?: string;
}

// Permalink for a single post, so a specific article can be shared (e.g. in
// the parents' Facebook group) instead of pointing people at the whole list.
// The read is narrowed with `&id=`, which the blog-posts resource handles
// directly — no extra serverless function, so the Vercel Hobby budget is
// unchanged.
export default function NewsPost() {
  const { language, t } = useLanguage();
  const [, params] = useRoute("/nyheter/:id");
  const postId = Number(params?.id);

  // Fetch just this post. This used to request the whole published archive —
  // up to 500 posts with their full bodies — to render one article, which is
  // paid by exactly the traffic a permalink exists for: someone opening a link
  // shared to the parents' group.
  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: [`/api/secure-settings?resource=blog-posts&id=${postId}`],
    enabled: Number.isFinite(postId),
  });

  const post = posts.find((p) => p.id === postId);

  usePageMeta({
    title: post?.title ?? t.newsPage.post,
    description:
      language === "no"
        ? "Nyheter og informasjon fra FAU Erdal Barnehage."
        : "News and information from FAU Erdal Kindergarten.",
    path: `/nyheter/${params?.id ?? ""}`,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="sr-only">{t.newsPage.loading}</span>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title={t.newsPage.postNotFound}
          action={
            <Button asChild variant="outline">
              <Link href="/news">
                <ArrowLeft className="h-4 w-4" />
                {t.newsPage.backToList}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const backHref = post.category === "tips" ? "/tips-tricks" : "/news";

  // An article page is the one place on this site that is genuinely one
  // column of prose, so it gets a measure of its own rather than the 1200px
  // container, and no card around it — the text is the page.
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backHref}
        className="mb-8 inline-flex items-center gap-2 text-small font-semibold text-brand hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {post.category === "tips" ? t.newsPage.allTips : t.newsPage.allNews}
      </Link>

      <article>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>
            {post.category === "tips" ? t.newsPage.categoryTips : t.newsPage.categoryNews}
          </StatusPill>
          <span className="inline-flex items-center gap-1.5 text-small text-subtle">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <time dateTime={post.publishedDate}>
              {formatDate(post.publishedDate, language, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </span>
          {post.author && (
            <span className="text-small text-subtle">
              · {t.newsPage.by} {post.author}
            </span>
          )}
        </div>

        <h1 className="mt-4 text-h1 font-bold tracking-tight text-ink">{post.title}</h1>

        <SafeHtml
          html={post.content}
          className="prose prose-neutral mt-8 max-w-none text-copy prose-headings:text-ink prose-strong:text-ink"
        />
      </article>

      <div className="mt-12 border-t border-hairline pt-8">
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t.newsPage.backToList}
          </Link>
        </Button>
      </div>
    </div>
  );
}
