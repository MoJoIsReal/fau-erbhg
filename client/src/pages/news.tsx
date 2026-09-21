import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowRight, Calendar, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { usePageMeta } from "@/hooks/usePageMeta";
import { apiRequest } from "@/lib/queryClient";
import PageHero from "@/components/site/page-hero";
import { Surface, EmptyState } from "@/components/site/section";
import { StatusPill } from "@/components/site/controls";
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

/**
 * Aktuelt — news and tips as one page with a category switch.
 *
 * The old page stacked full-width cards, each carrying the whole post body,
 * so nothing was scannable and the second item was already below the fold.
 * This is the guide's §13 shape instead: category chips at the top, a
 * three-column grid on desktop falling to one on a phone, the date always
 * visible, and two or three lines of the post as a teaser — the rest is what
 * the permalink is for.
 *
 * The two chips are links rather than buttons because each category is its
 * own URL, which is what makes "Tips & triks" shareable and the browser's
 * back button behave.
 */
export default function News() {
  const { language, t } = useLanguage();
  const [location] = useLocation();
  const category = location.includes("tips") ? "tips" : "news";
  const isTips = category === "tips";

  const pageText = isTips
    ? {
        title: t.newsPage.tipsTricks,
        description:
          language === "no"
            ? "Praktiske tips og råd for foreldre i Erdal Barnehage."
            : "Practical tips and advice for parents at Erdal Kindergarten.",
        emptyTitle: t.newsPage.noTipsYet,
        loading: t.newsPage.loadingTips,
        errorTitle: t.newsPage.couldNotLoadTips,
      }
    : {
        title: t.newsPage.news,
        description:
          language === "no"
            ? "Siste nyheter og informasjon fra FAU Erdal Barnehage."
            : "Latest news and information from FAU Erdal Kindergarten.",
        emptyTitle: t.newsPage.noNewsYet,
        loading: t.newsPage.loadingNews,
        errorTitle: t.newsPage.couldNotLoadNews,
      };
  const EmptyIcon = isTips ? Lightbulb : Calendar;

  usePageMeta({
    title: pageText.title,
    description: pageText.description,
    path: isTips ? "/tips-tricks" : "/news",
  });

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<BlogPost[]>({
      queryKey: [`/api/secure-settings?resource=blog-posts&category=${category}`, "paginated"],
      queryFn: async ({ pageParam }) => {
        const offset = pageParam as number;
        const res = await apiRequest(
          "GET",
          `/api/secure-settings?resource=blog-posts&category=${category}&limit=${PAGE_SIZE}&offset=${offset}`,
        );
        return res.json();
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) =>
        lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    });
  const blogPosts = data?.pages.flat() ?? [];

  const categoryChip = (href: string, label: string, selected: boolean) => (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-[40px] items-center rounded-pill border px-4 text-small transition-colors duration-micro ease-guide ${
        selected
          ? "border-brand/35 bg-green-50 font-semibold text-brand"
          : "border-hairline bg-surface text-subtle hover:border-brand/30 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="section-rhythm">
      <PageHero
        layout="strip"
        tone="sand"
        priority
        title={t.navigation.updates}
        lead={t.newsPage.heroLead}
        illustration={{ art: ILLUSTRATION_NEWS, alt: "" }}
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.newsPage.category}>
          {categoryChip("/news", t.newsPage.categoryNews, !isTips)}
          {categoryChip("/tips-tricks", t.newsPage.categoryTips, isTips)}
        </div>
      </PageHero>

      <section aria-label={pageText.title}>
        {isLoading ? (
          <div className="flex justify-center py-16" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <span className="sr-only">{pageText.loading}</span>
          </div>
        ) : isError ? (
          <EmptyState
            isError
            icon={<EmptyIcon className="h-5 w-5" aria-hidden="true" />}
            title={pageText.errorTitle}
          />
        ) : blogPosts.length === 0 ? (
          <EmptyState
            icon={<EmptyIcon className="h-5 w-5" aria-hidden="true" />}
            title={pageText.emptyTitle}
          />
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {blogPosts.map((post) => (
                <Surface
                  key={post.id}
                  as="article"
                  className="group flex flex-col p-5 transition-colors duration-micro ease-guide hover:border-brand/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill>
                      {post.category === "tips" ? t.newsPage.categoryTips : t.newsPage.categoryNews}
                    </StatusPill>
                    <time dateTime={post.publishedDate} className="text-micro text-subtle">
                      {formatDate(post.publishedDate, language, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  </div>

                  <h2 className="mt-3 text-h4 font-bold text-ink">
                    {/* Title links to the permalink so a specific post can be
                        shared, e.g. in the parents' Facebook group. */}
                    <Link href={`/nyheter/${post.id}`} className="hover:text-brand hover:underline">
                      {post.title}
                    </Link>
                  </h2>

                  <SafeHtml
                    html={post.content}
                    truncate={180}
                    className="mt-2 text-small text-copy"
                  />

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                    {post.author ? (
                      <span className="text-micro text-subtle">
                        {t.newsPage.by} {post.author}
                      </span>
                    ) : (
                      <span />
                    )}
                    <Link
                      href={`/nyheter/${post.id}`}
                      className="inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline"
                    >
                      {t.home.readMore}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-micro ease-guide group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </Surface>
              ))}
            </div>

            {hasNextPage && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t.newsPage.loadMore
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
