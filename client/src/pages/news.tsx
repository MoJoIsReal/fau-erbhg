import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRight, Lightbulb, Loader2, Newspaper, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [location, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const requestedCategory = searchParams.get("category");
  const searchTerm = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const [searchInput, setSearchInput] = useState(searchTerm);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm, location]);

  // Keep typing responsive and avoid a request on every keystroke. Replacing
  // the URL also keeps the back button from stepping through typed letters.
  useEffect(() => {
    const term = searchInput.trim();
    if (term === searchTerm) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(search);
      if (term) params.set("q", term);
      else params.delete("q");
      navigate(`${location}${params.size ? `?${params}` : ""}`, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchTerm, search, location, navigate]);

  function filterHref(href: string) {
    const term = searchInput.trim();
    return term ? `${href}${href.includes("?") ? "&" : "?"}q=${encodeURIComponent(term)}` : href;
  }

  function clearSearch() {
    setSearchInput("");
    const params = new URLSearchParams(search);
    params.delete("q");
    navigate(`${location}${params.size ? `?${params}` : ""}`, { replace: true });
    searchRef.current?.focus();
  }
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
  const postsUrl = `/api/secure-settings?resource=blog-posts${category === "all" ? "" : `&category=${category}`}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`;
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
        <div role="search" aria-label={t.newsPage.searchLabel} className="mb-6 max-w-xl">
          <label htmlFor="news-search" className="mb-2 block text-small font-semibold text-ink">
            {t.newsPage.searchLabel}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <Input
              ref={searchRef}
              id="news-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t.newsPage.searchPlaceholder}
              maxLength={200}
              aria-controls="news-results"
              className="pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t.newsPage.clearSearch}
                className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-token text-subtle hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <nav className="flex flex-wrap gap-2" aria-label={t.newsPage.category}>
            <FilterChip href={filterHref("/news")} label={t.newsPage.allCategories} pressed={category === "all"} />
            <FilterChip href={filterHref("/news?category=news")} label={t.newsPage.categoryNews} pressed={category === "news"} />
            <FilterChip href={filterHref("/tips-tricks")} label={t.newsPage.categoryTips} pressed={category === "tips"} />
          </nav>
          <p className="text-small text-subtle">{t.newsPage.newestFirst}</p>
        </div>

        <p role="status" className="sr-only">
          {searchTerm && !isLoading && !isError
            ? t.newsPage.searchResults.replace("{count}", String(blogPosts.length))
            : ""}
        </p>
        <div id="news-results" aria-busy={isLoading || searchInput.trim() !== searchTerm}>
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
              title={searchTerm ? t.newsPage.noSearchResults : pageText.emptyTitle}
              action={searchTerm ? <Button variant="outline" onClick={clearSearch}>{t.newsPage.clearSearch}</Button> : undefined}
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
        </div>
      </section>
    </div>
  );
}
