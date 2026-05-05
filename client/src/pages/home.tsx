import { Card, CardContent } from "@/components/ui/card";
import { Users, Heart, Star, School, Handshake, Calendar, Clock, MapPin } from "lucide-react";
import kindergartenImage from "@/assets/kindergarten-playground.png";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import type { Event, YearlyCalendarEntry } from "@shared/schema";

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

  const features = [
    { icon: Heart, text: t.home.safety },
    { icon: Users, text: t.home.cooperation },
    { icon: Star, text: t.home.engagement },
  ];

  // Fetch upcoming events
  const { data: allEvents = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Fetch yearly calendar day-events for the current and next school year so
  // the homepage stays correct around the August transition. The kindergarten
  // year starts in August (month index 7), so before August we're still in
  // last year's school year.
  const now = new Date();
  const currentSchoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const { data: currentYearEntries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: ["/api/yearly-calendar", currentSchoolYear],
    queryFn: async () => {
      const res = await fetch(`/api/yearly-calendar?schoolYear=${currentSchoolYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load yearly calendar");
      return res.json();
    },
  });
  const { data: nextYearEntries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: ["/api/yearly-calendar", currentSchoolYear + 1],
    queryFn: async () => {
      const res = await fetch(`/api/yearly-calendar?schoolYear=${currentSchoolYear + 1}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load yearly calendar");
      return res.json();
    },
  });

  type UpcomingItem =
    | { kind: "event"; date: string; event: Event }
    | { kind: "yearly"; date: string; entry: YearlyCalendarEntry };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const eventItems: UpcomingItem[] = allEvents
    .filter((event) => new Date(event.date).getTime() >= todayMs && event.status === "active")
    .map((event) => ({ kind: "event" as const, date: event.date, event }));

  const yearlyItems: UpcomingItem[] = [...currentYearEntries, ...nextYearEntries]
    .filter((entry) => {
      if (!entry.date || new Date(entry.date).getTime() < todayMs) return false;
      // "Closed" days (planleggingsdag, ferie etc.) always surface on the
      // homepage so parents see them without anyone having to flag them.
      if (entry.entryType === "closed") return true;
      // Day events only show when at least one homepage flag is set.
      if (entry.entryType === "day_event") {
        return entry.showOnHomepage === true || entry.showForParents === true;
      }
      return false;
    })
    .map((entry) => ({ kind: "yearly" as const, date: entry.date as string, entry }));

  const upcomingEvents = [...eventItems, ...yearlyItems]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

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
      <section className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-2xl p-8">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-neutral-900 mb-4">
              {t.home.title}
            </h2>
            <p className="text-lg text-neutral-700 mb-6">
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
            <img 
              src={kindergartenImage}
              alt="Barn som leker på lekeplass" 
              className="rounded-xl shadow-lg w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Blog Posts / News Section */}
      {blogPosts.length > 0 && (
        <section>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-heading font-semibold text-xl text-neutral-900 mb-6">
                {language === 'no' ? 'Nyheter' : 'News'}
              </h3>
              <div className="space-y-6">
                {blogPosts.slice(0, 3).map((post) => (
                  <div key={post.id} className="border-b border-neutral-200 last:border-0 pb-6 last:pb-0">
                    <h4 className="font-semibold text-lg text-neutral-900 mb-2">
                      {post.title}
                    </h4>
                    <p className="text-xs text-neutral-500 mb-3">
                      {new Date(post.publishedDate).toLocaleDateString('no-NO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                      {post.author && (
                        <span className="ml-2">
                          • {language === 'no' ? 'av' : 'by'} {post.author}
                        </span>
                      )}
                    </p>
                    <div
                      className="prose prose-sm prose-neutral max-w-none mb-2 text-neutral-700"
                      dangerouslySetInnerHTML={{
                        __html: post.content.length > 200
                          ? `${post.content.substring(0, 200)}...`
                          : post.content
                      }}
                    />
                    <Link href="/news">
                      <span className="text-sm text-primary hover:text-primary/80 font-medium cursor-pointer">
                        {language === 'no' ? 'Les mer →' : 'Read more →'}
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
              <h3 className="font-heading font-semibold text-xl text-neutral-900">{t.home.aboutKindergarten}</h3>
            </div>
            <div className="space-y-3 text-neutral-700">
              {kindergartenInfo ? (
                <>
                  <p><strong>{t.home.contact}</strong> <a
                    href={`mailto:${kindergartenInfo.contactEmail}`}
                    className="text-blue-600 hover:text-blue-500 transition-colors"
                  >
                    {kindergartenInfo.contactEmail}
                  </a></p>
                  <p><strong>{t.home.municipality}</strong> {kindergartenInfo.address}</p>
                  <p><strong>{t.home.openingHours}</strong> {kindergartenInfo.openingHours}</p>
                  <p><strong>{t.home.numberOfChildren}</strong> {kindergartenInfo.numberOfChildren} {language === 'no' ? 'barn' : 'children'}</p>
                  <p><strong>{t.home.owner}</strong> {kindergartenInfo.owner}</p>
                  {kindergartenInfo.styrerName && kindergartenInfo.styrerEmail && (
                    <p><strong>{language === 'no' ? 'Styrer:' : 'Director:'}</strong> <a
                      href={`mailto:${kindergartenInfo.styrerEmail}`}
                      className="text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      {kindergartenInfo.styrerName}
                    </a></p>
                  )}
                  <p className="mt-4">
                    {kindergartenInfo.description}
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-500 italic">
                  {language === 'no' ? 'Laster informasjon...' : 'Loading information...'}
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
              <h3 className="font-heading font-semibold text-xl text-neutral-900">{t.home.fauTitle}</h3>
            </div>
            <div className="space-y-3 text-neutral-700">
              <p><strong>{t.home.contact}</strong> <a 
                href="mailto:fauerdalbarnehage@gmail.com"
                className="text-blue-600 hover:text-blue-500 transition-colors"
              >
                fauerdalbarnehage@gmail.com
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

      {/* Upcoming Events */}
      <section>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-heading font-semibold text-xl text-neutral-900 mb-6">{t.home.upcomingEvents}</h3>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <p className="text-neutral-600">{t.home.noEvents}</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {upcomingEvents.map((item) => {
                  if (item.kind === "event") {
                    const event = item.event;
                    return (
                      <div key={`event-${event.id}`} className="border border-neutral-200 rounded-lg p-4">
                        <div className="flex items-center mb-3">
                          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center mr-3">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <h4 className="font-medium text-neutral-900">{event.title}</h4>
                        </div>
                        <div
                          className="prose prose-sm prose-neutral max-w-none text-sm text-neutral-600 mb-3"
                          dangerouslySetInnerHTML={{ __html: event.description }}
                        />
                        <div className="space-y-1 text-xs text-accent">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>{new Date(event.date).toLocaleDateString('no-NO')} kl. {event.time}</span>
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
                        isClosed ? "border-red-200 bg-red-50/40" : "border-neutral-200"
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
                        <h4 className="font-medium text-neutral-900">{entry.title}</h4>
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
                        <p className="text-sm text-neutral-600 mb-3">{entry.description}</p>
                      )}
                      <div className="space-y-1 text-xs text-accent">
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>{new Date(entry.date as string).toLocaleDateString('no-NO')}</span>
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
    </div>
  );
}
