import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Calendar,
  FileText,
  MessageSquare,
  Newspaper,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useUpcomingItems } from "@/hooks/useUpcomingItems";
import { formatDate } from "@/lib/i18n";
import type { Document } from "@shared/schema";

interface ContactMessage {
  id: number;
  status: "new" | "responded" | "archived";
  createdAt: string;
}

interface BlogPost {
  id: number;
  status: "published" | "archived";
  showOnHomepage?: boolean;
}

// One place that answers "is anything waiting for me?" for council members.
// Every number here comes from queries the underlying pages already run —
// no new API endpoints, so the serverless function count is unchanged.
export default function Admin() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  usePageMeta({
    title: "Admin",
    description:
      language === "no"
        ? "Oversikt for FAU-medlemmer: meldinger, innhold og innstillinger."
        : "Overview for FAU members: messages, content and settings.",
    path: "/admin",
  });

  // Messages are admin-only server-side; don't fire the query for members.
  const { data: messages = [] } = useQuery<ContactMessage[]>({
    queryKey: ["/api/secure-settings?resource=contact-messages"],
    enabled: isAdmin,
  });
  const newMessages = messages.filter((m) => m.status === "new");

  const { data: posts = [] } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"],
  });
  const publishedPosts = posts.filter((p) => p.status === "published");
  const postsOnHomepage = publishedPosts.filter((p) => p.showOnHomepage !== false);

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentDocuments = documents.filter(
    (d) => new Date(d.uploadedAt).getTime() >= thirtyDaysAgo
  );

  const upcoming = useUpcomingItems();
  const nextEvent = upcoming.find((item) => item.kind === "event");

  const cards = [
    ...(isAdmin
      ? [
          {
            href: "/messages",
            icon: MessageSquare,
            title: t.adminPage.messages,
            value: String(newMessages.length),
            valueLabel:
              newMessages.length === 1
                ? t.adminPage.newInquiry
                : t.adminPage.newInquiries,
            attention: newMessages.length > 0,
            detail:
              newMessages.length > 0
                ? language === "no"
                  ? `eldste fra ${formatDate(
                      [...newMessages].sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                      )[0].createdAt,
                      language
                    )}`
                  : `oldest from ${formatDate(
                      [...newMessages].sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                      )[0].createdAt,
                      language
                    )}`
                : t.adminPage.allHandled,
          },
        ]
      : []),
    {
      href: "/content",
      icon: Newspaper,
      title: t.adminPage.content,
      value: String(publishedPosts.length),
      valueLabel:
        publishedPosts.length === 1
          ? t.adminPage.publishedPost
          : t.adminPage.publishedPosts,
      attention: false,
      detail:
        language === "no"
          ? `${postsOnHomepage.length} vises på forsiden`
          : `${postsOnHomepage.length} shown on the homepage`,
    },
    {
      href: "/files",
      icon: FileText,
      title: t.adminPage.documents,
      value: String(recentDocuments.length),
      valueLabel:
        t.adminPage.uploadedLast30Days,
      attention: false,
      detail:
        language === "no"
          ? `${documents.length} totalt i arkivet`
          : `${documents.length} total in the archive`,
    },
    ...(isAdmin
      ? [
          {
            href: "/settings",
            icon: SettingsIcon,
            title: t.adminPage.settings,
            value: "",
            valueLabel: t.adminPage.boardKindergartenUsers,
            attention: false,
            detail: t.adminPage.newsletterSubscribers,
          },
        ]
      : []),
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-50">
          {language === "no" ? `Hei, ${user?.name?.split(" ")[0] ?? ""}` : `Hi, ${user?.name?.split(" ")[0] ?? ""}`}
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">
          {language === "no"
            ? "Her ser du hva som venter, og hvor du administrerer siden."
            : "See what is waiting, and where to manage the site."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <Card
                className={`h-full transition-colors group-hover:border-primary/60 ${
                  card.attention ? "border-primary/50" : ""
                }`}
              >
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          card.attention
                            ? "bg-primary/15 text-primary"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <h2 className="font-heading text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        {card.title}
                      </h2>
                    </div>
                    {card.attention && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                        {t.adminPage.waiting}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-200">
                    {card.value && (
                      <span className="mr-1.5 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                        {card.value}
                      </span>
                    )}
                    {card.valueLabel}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{card.detail}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Registration status for the next real event, so a missing signup
          list gets noticed before the event, not at it. */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-50">
                {nextEvent
                  ? nextEvent.event.title
                  : t.adminPage.noUpcomingEvents}
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {nextEvent
                  ? `${formatDate(nextEvent.date, language)}${
                      nextEvent.event.noSignup || nextEvent.event.vigiloSignup
                        ? ""
                        : ` · ${nextEvent.event.currentAttendees || 0} ${
                            t.adminPage.registered
                          }`
                    }`
                  : language === "no"
                  ? "Opprett et arrangement fra arrangementsiden."
                  : "Create one from the events page."}
              </p>
            </div>
          </div>
          <Link
            href="/kalender"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
          >
            <Users className="h-4 w-4" />
            {t.adminPage.goEvents}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
