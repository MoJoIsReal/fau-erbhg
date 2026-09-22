import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRight, Lightbulb, Loader2, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { usePageMeta } from "@/hooks/usePageMeta";
import { apiRequest } from "@/lib/queryClient";
import PageHero from "@/components/site/page-hero";
import { EmptyState } from "@/components/site/section";
import { FilterChip, StatusPill } from "@/components/site/controls";
import { ILLUSTRATION_NEWS } from "@/components/site/illustrations";

const PAGE_SIZE = 10;

interface BlogPost {
  id: number;
  title: string;
  content: string;
  category: "news" | "tips";
  publishedDate: string;
  author?: string;
}

/** One chronological stream, with shareable category filters. */
export default function News() {
  const { language, t } = useLanguage();
  const [location] = useLocation();
  const search = useSearch();
  const requestedCategory = new URLSearchParams(search).get("category");
  // Keep existing tips links working; /news is the combined landing page.
  const category = location === "/tips-tricks" ? "tips"
    : requestedCategory === "news" || requestedCategory === "tips" ? requestedCategory
    : "all";
  const pageText = category === "tips"
    ? {
        title: t.newsPage.tipsTricks,
        description: t.newsPage.tipsDescription,
        emptyTitle: t.newsPage.noTipsYet,
        loading: t.newsPage.loadingTips,
        errorTitle: t.newsPage.couldNotLoadTips,
      }
    : category === "news"
      ? {
          title: t.newsPage.news,
          description: t.newsPage.newsDescription,
          emptyTitle: t.newsPage.noNewsYet,
          loading: t.newsPage.loadingNews,
          errorTitle: t.newsPage.couldNotLoadNews,
        }
      : {
          title: t.navigation.updates,
          description: t.newsPage.heroLead,
          emptyTitle: t.newsPage.noPostsYet,
          loading: t.newsPage.loadingPosts,
          errorTitle: t.newsPage.couldNotLoadPosts,
        };
  const EmptyIcon = category === "tips" ? Lightbulb : Newspaper;

  usePageMeta({
    title: pageText.title,
    description: pageText.description,
    path: category === "tips" ? "/tips-tricks" : category === "news" ? "/news?category=news" : "/news",
  });

  // The API already filters and sorts before pagination. Omitting category
  // returns news and tips together, including posts beyond the first page.
  const postsUrl = `/api/secure-settings?resource=blog-posts${category === "all" ? "" : `&category=${category}`}`;
  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage,
    isFetchingNextPage, isFetchNextPageError,
  } = useInfiniteQuery<BlogPost[]>({
    queryKey: [postsUrl, "paginated"],
    queryFn: async ({ pageParam }) => {
      const res = await apiRequest("GET", `${postsUrl}&limit=${PAGE_SIZE}&offset=${pageParam}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
  });
  const blogPosts = data?.pages.flat() ?? [];

  return (
    <div className="section-rhythm">
      <PageHero
        layout="editorial"
        tone="sand"
        priority
        title={t.navigation.updates}
        lead={t.newsPage.heroLead}
        illustration={{ art: ILLUSTRATION_NEWS, alt: "" }}
      />

      <section aria-label={pageText.title}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <nav className="flex flex-wrap gap-2" aria-label={t.newsPage.category}>
            <FilterChip href="/news" label={t.newsPage.allCategories} pressed={category === "all"} />
            <FilterChip href="/news?category=news" label={t.newsPage.categoryNews} pressed={category === "news"} />
            <FilterChip href="/tips-tricks" label={t.newsPage.categoryTips} pressed={category === "tips"} />
          </nav>
          <p className="text-small text-subtle">{t.newsPage.newestFirst}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">{pageText.loading}</span>
          </div>
        ) : isError && blogPosts.length === 0 ? (
          <EmptyState
            isError
            icon={<EmptyIcon className="h-5 w-5" aria-hidden="true" />}
            title={pageText.errorTitle}
            action={<Button variant="outline" onClick={() => refetch()}>{t.newsPage.retry}</Button>}
          />
        ) : blogPosts.length === 0 ? (
          <EmptyState
            icon={<EmptyIcon className="h-5 w-5" aria-hidden="true" />}
            title={pageText.emptyTitle}
          />
        ) : (
          <>
            {/* Open rows follow the calendar's rhythm. Excerpts stay short;
                full text and media belong on the existing article pages. */}
            <div className="divide-y divide-hairline">
              {blogPosts.map((post) => (
                <article key={post.id} className="group py-6 sm:py-8">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <StatusPill className="text-small">
                      {post.category === "tips"
                        ? <Lightbulb className="h-4 w-4" aria-hidden="true" />
                        : <Newspaper className="h-4 w-4" aria-hidden="true" />}
                      {post.category === "tips" ? t.newsPage.categoryTips : t.newsPage.categoryNews}
                    </StatusPill>
                    <time dateTime={post.publishedDate} className="text-small tabular-nums text-subtle">
                      {formatDate(post.publishedDate, language, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  </div>

                  <h2 className="measure mt-3 break-words text-h3 font-bold tracking-tight text-ink">
                    <Link href={`/nyheter/${post.id}`} className="inline-flex min-h-11 items-center hover:text-brand hover:underline">
                      {post.title}
                    </Link>
                  </h2>
                  <SafeHtml html={post.content} truncate={240} className="measure mt-2 line-clamp-3 break-words text-body text-copy" />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                    {post.author && (
                      <span className="min-w-0 break-words text-small text-subtle">
                        {t.newsPage.by} {post.author}
                      </span>
                    )}
                    <Link
                      href={`/nyheter/${post.id}`}
                      className="inline-flex min-h-11 items-center gap-2 text-small font-semibold text-brand hover:underline"
                    >
                      {t.home.readMore}<span className="sr-only">: {post.title}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            {hasNextPage && (
              <div className="flex flex-col items-center gap-4 border-t border-hairline pt-8">
                {isFetchNextPageError && (
                  <p role="alert" className="text-small text-copy">{t.newsPage.loadMoreFailed}</p>
                )}
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isFetchingNextPage ? pageText.loading : isFetchNextPageError ? t.newsPage.retry : t.newsPage.loadMore}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
