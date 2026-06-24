import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Lightbulb, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useLocation } from "wouter";

interface BlogPost {
  id: number;
  title: string;
  content: string;
  category: "news" | "tips";
  publishedDate: string;
  author?: string;
}

export default function News() {
  const { language } = useLanguage();
  const [location] = useLocation();
  const category = location.includes("tips") ? "tips" : "news";
  const isTips = category === "tips";

  const pageText = isTips
    ? {
        title: language === "no" ? "Tips & triks" : "Tips & Tricks",
        description:
          language === "no"
            ? "Praktiske tips og råd for foreldre i Erdal Barnehage."
            : "Practical tips and advice for parents at Erdal Kindergarten.",
        intro:
          language === "no"
            ? "Praktiske tips, råd og erfaringer for barnehagehverdagen"
            : "Practical tips, advice and experience for kindergarten life",
        emptyTitle: language === "no" ? "Ingen tips ennå" : "No tips yet",
        emptyDescription:
          language === "no"
            ? "Sjekk tilbake senere for tips og nyttige råd."
            : "Check back later for tips and useful advice.",
        loading: language === "no" ? "Laster tips..." : "Loading tips...",
        errorTitle: language === "no" ? "Kunne ikke laste tips" : "Could not load tips",
      }
    : {
        title: language === "no" ? "Nyheter" : "News",
        description:
          language === "no"
            ? "Siste nyheter og informasjon fra FAU Erdal Barnehage."
            : "Latest news and information from FAU Erdal Kindergarten.",
        intro:
          language === "no"
            ? "Siste nyheter og informasjon fra FAU Erdal Barnehage"
            : "Latest news and information from FAU Erdal Kindergarten",
        emptyTitle: language === "no" ? "Ingen nyheter ennå" : "No news yet",
        emptyDescription:
          language === "no"
            ? "Sjekk tilbake senere for oppdateringer og informasjon."
            : "Check back later for updates and information.",
        loading: language === "no" ? "Laster nyheter..." : "Loading news...",
        errorTitle: language === "no" ? "Kunne ikke laste nyheter" : "Could not load news",
      };
  const EmptyIcon = isTips ? Lightbulb : Calendar;

  usePageMeta({
    title: pageText.title,
    description: pageText.description,
    path: isTips ? "/tips-tricks" : "/news",
  });

  const { data: blogPosts = [], isLoading, isError } = useQuery<BlogPost[]>({
    queryKey: [`/api/secure-settings?resource=blog-posts&category=${category}`],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">{pageText.loading}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="p-12 text-center" role="alert">
            <EmptyIcon className="h-12 w-12 text-neutral-400 dark:text-neutral-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-50 mb-2">
              {pageText.errorTitle}
            </h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              {language === "no"
                ? "Noe gikk galt. Prøv å laste siden på nytt."
                : "Something went wrong. Please try reloading the page."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-50">
          {pageText.title}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-300 mt-2">
          {pageText.intro}
        </p>
      </div>

      {blogPosts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <EmptyIcon className="h-12 w-12 text-neutral-400 dark:text-neutral-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-50 mb-2">
              {pageText.emptyTitle}
            </h3>
            <p className="text-neutral-600 dark:text-neutral-300">
              {pageText.emptyDescription}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {blogPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
                  {post.title}
                </h2>
                <div className="flex items-center text-sm text-neutral-500 dark:text-neutral-400 mb-4">
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
          ))}
        </div>
      )}
    </div>
  );
}
