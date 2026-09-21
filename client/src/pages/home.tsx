import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CalendarDays, Clock, Heart, MapPin, Sparkles, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FAU_EMAIL } from "@shared/constants";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { useUpcomingItems, type UpcomingItem } from "@/hooks/useUpcomingItems";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import PageHero from "@/components/site/page-hero";
import { SectionHeader, Surface, EmptyState } from "@/components/site/section";
import { StatusPill } from "@/components/site/controls";
import { IllustrationBanner } from "@/components/site/banners";
import { ILLUSTRATION_HOME, ILLUSTRATION_SIGNPOST } from "@/components/site/illustrations";

interface FauBoardMember {
  id: number;
  name: string;
  role: string;
  sortOrder: number;
}

interface BlogPost {
  id: number;
  title: string;
  content: string;
  category: "news" | "tips";
  publishedDate: string;
  author?: string;
  showOnHomepage?: boolean;
}

interface KindergartenInfo {
  id: number;
  contactEmail: string;
  address: string;
  openingHours: string;
  numberOfChildren: number;
  owner: string;
  description: string;
  styrerName?: string;
  styrerEmail?: string;
}

/** Title, date and any state an upcoming item carries, whatever its source. */
function upcomingParts(item: UpcomingItem) {
  if (item.kind === "event") {
    return {
      title: item.event.title,
      date: item.event.date,
      time: item.event.time ?? "",
      location: item.event.location ?? "",
      description: item.event.description ?? "",
      closed: false,
    };
  }
  return {
    title: item.entry.title,
    date: item.entry.date as string,
    time: "",
    location: "",
    description: item.entry.description ?? "",
    closed: item.entry.entryType === "closed",
  };
}

/**
 * The home page.
 *
 * Ordered around the three questions a parent opens this site with — what is
 * happening, what is new, and where do I find the rest — so the next event is
 * above the fold's fold rather than below three cards about what FAU is
 * (guide §12). The standing explanation of the council and the kindergarten
 * has not been deleted, only moved to where someone goes looking for it.
 */
export default function Home() {
  const { language, t } = useLanguage();

  usePageMeta({
    title: t.home.home,
    description:
      language === "no"
        ? "FAU Erdal Barnehage – foreldrenes arbeidsutvalg. Arrangementer, nyheter, dokumenter og kontakt."
        : "FAU Erdal Kindergarten – the parents' committee. Events, news, documents and contact.",
    path: "/",
  });

  const values = [
    { icon: Heart, title: t.home.valueChildrenTitle, body: t.home.valueChildrenBody },
    { icon: Users, title: t.home.valueTogetherTitle, body: t.home.valueTogetherBody },
    { icon: Sparkles, title: t.home.valueEngagementTitle, body: t.home.valueEngagementBody },
  ];

  // Merged upcoming events + yearly-calendar entries, shared with the footer.
  const upcoming = useUpcomingItems();
  const [next, ...rest] = upcoming;
  const soon = rest.slice(0, 4);

  const { data: boardMembers = [] } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

  const { data: allBlogPosts = [] } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts"],
  });
  const blogPosts = allBlogPosts.filter((post) => post.showOnHomepage !== false).slice(0, 3);

  const { data: kindergartenInfo } = useQuery<KindergartenInfo>({
    queryKey: ["/api/secure-settings?resource=kindergarten-info"],
  });


  return (
    <div className="section-rhythm">
      <PageHero
        layout="split"
        tone="sand"
        priority
        title={t.home.title}
        lead={t.home.welcomeDescription}
        illustration={{ art: ILLUSTRATION_HOME, alt: t.home.heroImageAlt }}
        actions={
          <>
            <Button asChild>
              <Link href="/kalender">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {t.home.heroCalendarCta}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">{t.home.heroContactCta}</Link>
            </Button>
          </>
        }
      />

      {/* Three values on one row at every width. Stacked, they cost three
          screens of scrolling on a phone for three short statements — and
          they only mean anything as a set, so they are gathered into one
          surface with a rule between them rather than left floating. */}
      <section aria-label={t.home.valuesTitle}>
        {/* No card on a phone: the surface's own padding was eating a third of
            each column, and "Engasjement" needs the width more than the row
            needs a border. From 640px up it becomes the divided surface. */}
        <div className="grid grid-cols-3 rounded-card sm:divide-x sm:divide-hairline sm:border sm:border-hairline sm:bg-surface">
          {values.map(({ icon: Icon, title, body }) => (
            <div key={title} className="px-1 py-2 sm:px-6 sm:py-6">
              <span className="grid h-9 w-9 place-items-center rounded-token bg-green-50 text-brand sm:h-11 sm:w-11">
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-small font-bold text-ink sm:mt-4 sm:text-h4">{title}</h2>
              {/* A third of a 375px screen is four words to a line, which is
                  below what the guide calls readable — so the sentence is
                  visually held back until there is a column to put it in.
                  sr-only rather than hidden: a screen reader still reads it at
                  every width, so nothing is actually lost on a phone. */}
              <p className="sr-only sm:not-sr-only sm:mt-1.5 sm:text-small sm:text-copy">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What is happening. One item gets the space, the next four get a line
          each — enough to plan a fortnight without opening the calendar. */}
      <section aria-labelledby="home-upcoming">
        <SectionHeader
          id="home-upcoming"
          title={t.home.upcomingEvents}
          action={
            <Link
              href="/kalender"
              className="inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline"
            >
              {t.home.seeAllEvents}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />

        {!next ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
            title={t.home.noEvents}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {(() => {
              const parts = upcomingParts(next);
              const date = new Date(parts.date);
              return (
                <Surface tone="raised" as="article" className="flex flex-col gap-4 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="now">{t.home.nextUpLabel}</StatusPill>
                    {parts.closed && (
                      <StatusPill tone="warn">{t.yearlyCalendar.closedBadge}</StatusPill>
                    )}
                  </div>

                  <div className="flex items-start gap-5">
                    {/* The date block: the one number a parent scans for. */}
                    <div className="shrink-0 rounded-card bg-green-50 px-4 py-3 text-center">
                      <div className="text-micro font-semibold uppercase tracking-[0.12em] text-brand">
                        {formatDate(date, language, { month: "short" })}
                      </div>
                      <div className="text-h2 font-bold leading-none tabular-nums text-ink">
                        {date.getDate()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-h3 font-bold tracking-tight text-ink">{parts.title}</h3>
                      <p className="mt-1 text-small capitalize text-subtle">
                        {formatDate(date, language, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-small text-subtle">
                        {parts.time && (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            {parts.time}
                          </span>
                        )}
                        {parts.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                            {parts.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {parts.description && (
                    <SafeHtml
                      html={parts.description}
                      truncate={220}
                      className="measure text-copy"
                    />
                  )}

                  <div className="mt-auto pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/kalender">{t.home.moreInfo}</Link>
                    </Button>
                  </div>
                </Surface>
              );
            })()}

            <Surface className="p-6">
              <h3 className="text-h4 font-bold text-ink">{t.home.comingDates}</h3>
              {soon.length === 0 ? (
                <p className="mt-3 text-small text-subtle">{t.calendar.noEventsThisWeek}</p>
              ) : (
                <ul className="mt-4 divide-y divide-hairline">
                  {soon.map((item) => {
                    const parts = upcomingParts(item);
                    const date = new Date(parts.date);
                    return (
                      <li
                        key={item.kind === "event" ? `event-${item.event.id}` : `yearly-${item.entry.id}`}
                        className="flex items-baseline gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="w-16 shrink-0 text-small font-semibold tabular-nums text-brand">
                          {date.getDate()}. {formatDate(date, language, { month: "short" })}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-semibold text-ink">
                            {parts.title}
                          </span>
                          {(parts.time || parts.closed) && (
                            <span className="block text-micro text-subtle">
                              {parts.closed ? t.yearlyCalendar.closedBadge : parts.time}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                href="/kalender"
                className="mt-5 inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline"
              >
                {t.home.openCalendar}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Surface>
          </div>
        )}
      </section>

      {blogPosts.length > 0 && (
        <section aria-labelledby="home-updates">
          <SectionHeader
            id="home-updates"
            title={t.home.updates}
            action={
              <Link
                href="/news"
                className="inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline"
              >
                {t.home.readMore}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-6 md:grid-cols-3">
            {blogPosts.map((post) => (
              <Surface key={post.id} as="article" className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-2 text-micro">
                  <StatusPill>
                    {post.category === "tips" ? t.home.tipsTricks : t.home.news}
                  </StatusPill>
                  <time dateTime={post.publishedDate} className="text-subtle">
                    {formatDate(post.publishedDate, language, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <h3 className="mt-3 text-h4 font-bold text-ink">
                  <Link href={`/nyheter/${post.id}`} className="hover:text-brand hover:underline">
                    {post.title}
                  </Link>
                </h3>
                <SafeHtml
                  html={post.content}
                  truncate={140}
                  className="mt-2 text-small text-copy"
                />
                {post.author && (
                  <p className="mt-3 text-micro text-subtle">
                    {t.home.by} {post.author}
                  </p>
                )}
              </Surface>
            ))}
          </div>
        </section>
      )}

      {/* The standing explanation of who we are and where the kindergarten is.
          Open sections with a rule between them rather than two more cards. */}
      <section aria-labelledby="home-about">
        <SectionHeader id="home-about" title={t.home.practicalInfo} />
        <div className="grid gap-10 md:grid-cols-2 md:gap-12">
          <div>
            <h3 className="text-h4 font-bold text-ink">{t.home.aboutKindergarten}</h3>
            {kindergartenInfo ? (
              <>
                <dl className="mt-4 divide-y divide-hairline text-small">
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-subtle">{t.home.contact}</dt>
                    <dd>
                      <a
                        href={`mailto:${kindergartenInfo.contactEmail}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {kindergartenInfo.contactEmail}
                      </a>
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-subtle">{t.home.municipality}</dt>
                    <dd className="text-ink">{kindergartenInfo.address}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-subtle">{t.home.openingHours}</dt>
                    <dd className="text-ink">{kindergartenInfo.openingHours}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-subtle">{t.home.numberOfChildren}</dt>
                    <dd className="text-ink">
                      {kindergartenInfo.numberOfChildren} {t.home.children}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                    <dt className="text-subtle">{t.home.owner}</dt>
                    <dd className="text-ink">{kindergartenInfo.owner}</dd>
                  </div>
                  {kindergartenInfo.styrerName && kindergartenInfo.styrerEmail && (
                    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                      <dt className="text-subtle">{t.home.director}</dt>
                      <dd>
                        <a
                          href={`mailto:${kindergartenInfo.styrerEmail}`}
                          className="font-semibold text-brand hover:underline"
                        >
                          {kindergartenInfo.styrerName}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="measure mt-4 text-small text-copy">
                  {kindergartenInfo.description}
                </p>
              </>
            ) : (
              <p className="mt-4 text-small italic text-subtle">{t.home.loadingInformation}</p>
            )}
          </div>

          <div>
            <h3 className="text-h4 font-bold text-ink">{t.home.fauTitle}</h3>
            <p className="mt-4 text-small">
              <span className="text-subtle">{t.home.contact} </span>
              <a href={`mailto:${FAU_EMAIL}`} className="font-semibold text-brand hover:underline">
                {FAU_EMAIL}
              </a>
            </p>
            {boardMembers.length > 0 && (
              <>
                <p className="mt-5 text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
                  {t.home.fauBoard}
                </p>
                <ul className="mt-3 divide-y divide-hairline text-small">
                  {boardMembers.map((member) => (
                    <li key={member.id} className="flex justify-between gap-6 py-2.5">
                      <span className="text-subtle">
                        {member.role === "Leder"
                          ? t.home.leader
                          : member.role === "Vara"
                            ? t.home.vara
                            : t.home.member}
                      </span>
                      <span className="font-semibold text-ink">{member.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="measure mt-5 text-small text-copy">{t.home.fauDescription}</p>
          </div>
        </div>
      </section>

      <IllustrationBanner
        art={ILLUSTRATION_SIGNPOST}
        eyebrow={t.ui.aboutFau}
        title={t.home.closingTitle}
        hand={t.home.closingHand}
        action={
          <Button asChild>
            <Link href="/contact">{t.home.closingCta}</Link>
          </Button>
        }
      >
        {t.home.closingBody}
      </IllustrationBanner>
    </div>
  );
}
