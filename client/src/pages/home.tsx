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
import { ILLUSTRATION_HOME, ILLUSTRATION_VALUES } from "@/components/site/illustrations";

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

  const { data: allBlogPosts = [] } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts"],
  });
  const blogPosts = allBlogPosts.filter((post) => post.showOnHomepage !== false).slice(0, 3);

  const { data: kindergartenInfo } = useQuery<KindergartenInfo>({
    queryKey: ["/api/secure-settings?resource=kindergarten-info"],
  });


  return (
    <div className="section-rhythm">
      {/* Split, not a band: the welcome artwork writes "Velkommen til FAU
          Erdal Barnehage" across its own sky, and the page says that in HTML,
          so the only rectangle that clears the lettering is the right-hand
          block — children, signpost, fjord (see illustrations.ts). Given the
          larger of the two columns it opens the page at roughly 1288×510,
          which is the presence the drawing was composed for; cut into a band
          it would be a strip. */}
      <PageHero
        layout="split"
        tone="sand"
        titleSize="display"
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

      {/* The three official FAU values. They carry the identity, so they get
          a band of their own directly under the hero rather than three
          floating columns — and the wording is exactly the official set
          (guide v1.1 §24, "Verdier og skilt"). */}
      <section aria-label={t.home.valuesTitle}>
        <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-3">
          {values.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-surface px-6 py-7 sm:px-7 sm:py-8">
              <span className="grid h-12 w-12 place-items-center rounded-token bg-green-50 text-brand">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-h3 font-bold tracking-tight text-ink">{title}</h2>
              <p className="mt-2 text-copy">{body}</p>
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

      {/* Practical information, compressed to what a parent needs on the
          spot. The board roster and the longer explanation of what FAU is
          moved to Kontakt, where someone goes looking for them — they used to
          take up a quarter of the home page (guide v1.1 §24, "Forside"). */}
      <section aria-labelledby="home-about">
        <SectionHeader
          id="home-about"
          title={t.home.practicalInfo}
          action={
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline"
            >
              {t.home.boardOnContact}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
        {kindergartenInfo ? (
          // min-w-0 on each cell: a grid track is floored at its items'
          // min-content width, and the unbroken contact address is wider than
          // a 375px column, so without it the whole grid grows past the page.
          <dl className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
            <div className="min-w-0 bg-surface px-5 py-5">
              <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-subtle">
                {t.home.municipality}
              </dt>
              <dd className="mt-1.5 font-semibold text-ink">{kindergartenInfo.address}</dd>
            </div>
            <div className="min-w-0 bg-surface px-5 py-5">
              <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-subtle">
                {t.home.openingHours}
              </dt>
              <dd className="mt-1.5 font-semibold tabular-nums text-ink">
                {kindergartenInfo.openingHours}
              </dd>
            </div>
            <div className="min-w-0 bg-surface px-5 py-5">
              <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-subtle">
                {t.home.aboutKindergarten}
              </dt>
              <dd className="mt-1.5">
                <a
                  href={`mailto:${kindergartenInfo.contactEmail}`}
                  className="break-words font-semibold text-brand hover:underline"
                >
                  {kindergartenInfo.contactEmail}
                </a>
              </dd>
            </div>
            <div className="min-w-0 bg-surface px-5 py-5">
              <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-subtle">
                {t.home.fauTitle}
              </dt>
              <dd className="mt-1.5">
                <a
                  href={`mailto:${FAU_EMAIL}`}
                  className="break-words font-semibold text-brand hover:underline"
                >
                  {FAU_EMAIL}
                </a>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-copy italic">{t.home.loadingInformation}</p>
        )}
      </section>

      <IllustrationBanner
        art={ILLUSTRATION_VALUES}
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
