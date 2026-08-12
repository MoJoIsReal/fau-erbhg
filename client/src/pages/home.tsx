import { Card, CardContent } from "@/components/ui/card";
import { Users, Heart, Star, School, Handshake, Calendar, Clock, MapPin } from "lucide-react";
import kindergartenImage768 from "@/assets/kindergarten-playground-768.jpg";
import kindergartenImage1280 from "@/assets/kindergarten-playground-1280.jpg";
import kindergartenImage768Webp from "@/assets/kindergarten-playground-768.webp";
import kindergartenImage1280Webp from "@/assets/kindergarten-playground-1280.webp";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { FAU_EMAIL } from "@shared/constants";
import SafeHtml from "@/components/safe-html";
import { formatDate } from "@/lib/i18n";
import { useUpcomingItems } from "@/hooks/useUpcomingItems";
import { usePageMeta } from "@/hooks/usePageMeta";

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

  const features = [
    { icon: Heart, text: t.home.safety },
    { icon: Users, text: t.home.cooperation },
    { icon: Star, text: t.home.engagement },
  ];

  // Merged upcoming events + yearly-calendar entries, shared with the footer.
  const upcomingEvents = useUpcomingItems().slice(0, 3);

  // Fetch FAU board members
  const { data: boardMembers = [] } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

  // Fetch blog posts (only published)
  const { data: allBlogPosts = [] } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts"],
  });

  // Filter blog posts to show only those marked for homepage
  const blogPosts = allBlogPosts.filter(post => post.showOnHomepage !== false);

  // Fetch kindergarten info
  const { data: kindergartenInfo } = useQuery<KindergartenInfo>({
    queryKey: ["/api/secure-settings?resource=kindergarten-info"],
  });

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-neutral-900 dark:via-neutral-900 dark:to-[#173629] rounded-2xl p-8 border border-transparent dark:border-neutral-800">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="font-heading font-bold text-3xl md:text-4xl text-neutral-900 dark:text-neutral-50 mb-4">
              {t.home.title}
            </h1>
            <p className="text-lg text-neutral-700 dark:text-neutral-200 mb-6">
              {t.home.welcomeDescription}
            </p>
            <div className="flex flex-wrap gap-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div key={index} className="flex items-center text-accent">
                    <Icon className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">{feature.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hidden md:block">
            <picture>
              <source
                type="image/webp"
                srcSet={`${kindergartenImage768Webp} 768w, ${kindergartenImage1280Webp} 1280w`}
                sizes="(min-width: 768px) 50vw, 100vw"
              />
              <source
                type="image/jpeg"
                srcSet={`${kindergartenImage768} 768w, ${kindergartenImage1280} 1280w`}
                sizes="(min-width: 768px) 50vw, 100vw"
              />
              <img
                src={kindergartenImage1280}
                alt={t.home.childrenPlayingPlayground}
                className="rounded-xl shadow-lg w-full h-auto"
                width="1280"
                height="853"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* Upcoming events — first section after the hero, because "is anything
          happening soon?" is the question most visitors come to answer. */}
      <section>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
              <h3 className="font-heading font-semibold text-xl text-neutral-900 dark:text-neutral-50">{t.home.upcomingEvents}</h3>
              <Link href="/kalender" className="text-sm font-medium text-primary hover:text-primary/80">
                {t.home.seeAllEvents}
              </Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <p className="text-neutral-600 dark:text-neutral-300">{t.home.noEvents}</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {upcomingEvents.map((item) => {
                  if (item.kind === "event") {
                    const event = item.event;
                    return (
                      <div key={`event-${event.id}`} className="border border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/50 rounded-lg p-4">
                        <div className="flex items-center mb-3">
                          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center mr-3">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <h4 className="font-medium text-neutral-900 dark:text-neutral-50">{event.title}</h4>
                        </div>
                        <SafeHtml
                          html={event.description}
                          className="prose prose-sm prose-neutral max-w-none text-sm text-neutral-600 dark:text-neutral-300 mb-3"
                        />
                        <div className="space-y-1 text-xs text-accent">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>{formatDate(event.date, language)} {t.home.at} {event.time}</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center">
                              <MapPin className="h-3 w-3 mr-1" />
                              <span>{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const entry = item.entry;
                  const isClosed = entry.entryType === "closed";
                  return (
                    <div
                      key={`yearly-${entry.id}`}
                      className={`border rounded-lg p-4 ${
                        isClosed
                          ? "border-red-200 bg-red-50/40 dark:border-red-900/70 dark:bg-red-950/30"
                          : "border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/50"
                      }`}
                    >
                      <div className="flex items-center mb-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${
                            isClosed ? "bg-red-500/15" : "bg-secondary/20"
                          }`}
                        >
                          <Calendar
                            className={`h-4 w-4 ${isClosed ? "text-red-600" : "text-secondary"}`}
                          />
                        </div>
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-50">{entry.title}</h4>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {isClosed && (
                          <span className="inline-flex items-center rounded-full bg-red-500/15 text-red-700 text-[11px] font-medium px-2 py-0.5">
                            {t.yearlyCalendar.closedBadge}
                          </span>
                        )}
                        {!isClosed && entry.showOnHomepage && (
                          <span className="inline-flex items-center rounded-full bg-secondary/15 text-secondary text-[11px] font-medium px-2 py-0.5">
                            {t.yearlyCalendar.inKindergartenBadge}
                          </span>
                        )}
                        {!isClosed && entry.showForParents && (
                          <span className="inline-flex items-center rounded-full bg-primary/15 text-primary text-[11px] font-medium px-2 py-0.5">
                            {t.yearlyCalendar.forParentsBadge}
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">{entry.description}</p>
                      )}
                      <div className="space-y-1 text-xs text-accent">
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>{formatDate(entry.date as string, language)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>


      {/* Blog Posts / News Section */}
      {blogPosts.length > 0 && (
        <section>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-heading font-semibold text-xl text-neutral-900 dark:text-neutral-50 mb-6">
                {t.home.updates}
              </h3>
              <div className="space-y-6">
                {blogPosts.slice(0, 3).map((post) => (
                  <div key={post.id} className="border-b border-neutral-200 dark:border-neutral-800 last:border-0 pb-6 last:pb-0">
                    <h4 className="font-semibold text-lg text-neutral-900 dark:text-neutral-50 mb-2">
                      {post.title}
                    </h4>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                      <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                        {post.category === "tips"
                          ? t.home.tipsTricks
                          : t.home.news}
                      </span>
                      {formatDate(post.publishedDate, language, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                      {post.author && (
                        <span className="ml-2">
                          • {t.home.by} {post.author}
                        </span>
                      )}
                    </p>
                    <SafeHtml
                      html={post.content}
                      truncate={200}
                      className="prose prose-sm prose-neutral max-w-none mb-2 text-neutral-700 dark:text-neutral-300"
                    />
                    <Link href={`/nyheter/${post.id}`}>
                      <span className="text-sm text-primary hover:text-primary/80 font-medium cursor-pointer">
                        {t.home.readMore}
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* About Section */}
      <section className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mr-4">
                <School className="h-6 w-6 text-secondary" />
              </div>
              <h3 className="font-heading font-semibold text-xl text-neutral-900 dark:text-neutral-50">{t.home.aboutKindergarten}</h3>
            </div>
            <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
              {kindergartenInfo ? (
                <>
                  <p><strong>{t.home.contact}</strong> <a
                    href={`mailto:${kindergartenInfo.contactEmail}`}
                    className="text-blue-600 dark:text-blue-300 hover:text-blue-500 transition-colors"
                  >
                    {kindergartenInfo.contactEmail}
                  </a></p>
                  <p><strong>{t.home.municipality}</strong> {kindergartenInfo.address}</p>
                  <p><strong>{t.home.openingHours}</strong> {kindergartenInfo.openingHours}</p>
                  <p><strong>{t.home.numberOfChildren}</strong> {kindergartenInfo.numberOfChildren} {t.home.children}</p>
                  <p><strong>{t.home.owner}</strong> {kindergartenInfo.owner}</p>
                  {kindergartenInfo.styrerName && kindergartenInfo.styrerEmail && (
                    <p><strong>{t.home.director}</strong> <a
                      href={`mailto:${kindergartenInfo.styrerEmail}`}
                      className="text-blue-600 dark:text-blue-300 hover:text-blue-500 transition-colors"
                    >
                      {kindergartenInfo.styrerName}
                    </a></p>
                  )}
                  <p className="mt-4">
                    {kindergartenInfo.description}
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
                  {t.home.loadingInformation}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mr-4">
                <Handshake className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-heading font-semibold text-xl text-neutral-900 dark:text-neutral-50">{t.home.fauTitle}</h3>
            </div>
            <div className="space-y-3 text-neutral-700 dark:text-neutral-300">
              <p><strong>{t.home.contact}</strong> <a
                href={`mailto:${FAU_EMAIL}`}
                className="text-blue-600 dark:text-blue-300 hover:text-blue-500 transition-colors"
              >
                {FAU_EMAIL}
              </a></p>
              
              <div className="mt-4">
                <p><strong>{t.home.fauBoard}</strong></p>
                <div className="ml-4 mt-2 space-y-1 text-sm">
                  {boardMembers.map((member) => (
                    <p key={member.id}>
                      <strong>
                        {member.role === "Leder" ? t.home.leader :
                         member.role === "Vara" ? t.home.vara :
                         t.home.member}
                      </strong> {member.name}
                    </p>
                  ))}
                </div>
              </div>
              
              <p className="mt-4">
                {t.home.fauDescription}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
