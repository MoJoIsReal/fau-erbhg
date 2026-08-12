import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";

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
// There is no single-post API endpoint; the public list is small (and already
// cached from the homepage under the same query key), so we find the post
// client-side. This keeps the serverless function count unchanged.
export default function NewsPost() {
  const { language } = useLanguage();
  const [, params] = useRoute("/nyheter/:id");
  const postId = Number(params?.id);

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts"],
  });

  const post = posts.find((p) => p.id === postId);

  usePageMeta({
    title: post?.title ?? (language === "no" ? "Innlegg" : "Post"),
    description:
      language === "no"
        ? "Nyheter og informasjon fra FAU Erdal Barnehage."
        : "News and information from FAU Erdal Kindergarten.",
    path: `/nyheter/${params?.id ?? ""}`,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">{language === "no" ? "Laster …" : "Loading …"}</span>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardContent className="p-12 text-center">
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-2">
              {language === "no" ? "Fant ikke innlegget" : "Post not found"}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-300 mb-6">
              {language === "no"
                ? "Innlegget kan være avpublisert eller slettet."
                : "The post may have been unpublished or deleted."}
            </p>
            <Link href="/news">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {language === "no" ? "Til nyhetene" : "Back to news"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const backHref = post.category === "tips" ? "/tips-tricks" : "/news";

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {post.category === "tips"
          ? language === "no" ? "Alle tips" : "All tips"
          : language === "no" ? "Alle nyheter" : "All news"}
      </Link>

      <article>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-3">
              {post.title}
            </h1>
            <div className="flex items-center text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              <Calendar className="h-4 w-4 mr-2" />
              <time dateTime={post.publishedDate}>
                {formatDate(post.publishedDate, language, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              {post.author && (
                <span className="ml-2">
                  &bull; {language === "no" ? "av" : "by"} {post.author}
                </span>
              )}
            </div>
            <SafeHtml
              html={post.content}
              className="prose prose-neutral max-w-none text-neutral-700 dark:text-neutral-200"
            />
          </CardContent>
        </Card>
      </article>
    </div>
  );
}
