import { Card, CardContent } from "@/components/ui/card";
import { Users, Heart, Star, School, Handshake, Calendar, Clock, MapPin } from "lucide-react";
import kindergartenImage from "@/assets/kindergarten-playground.png";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import type { Event } from "@shared/schema";

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

  // Filter and sort upcoming events (next 3) - exclude cancelled events
  const upcomingEvents = allEvents
    .filter(event =>
      new Date(event.date) >= new Date() &&
      event.status === 'active'
    )
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
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap mb-2">
                      {post.content.length > 200
                        ? `${post.content.substring(0, 200)}...`
                        : post.content}
                    </p>
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
              <p><strong>{t.home.contact}</strong> <a 
                href="mailto:erdal.barnehage@askoy.kommune.no"
                className="text-blue-600 hover:text-blue-500 transition-colors"
              >
                erdal.barnehage@askoy.kommune.no
              </a></p>
              <p><strong>{t.home.municipality}</strong> Steinråsa 5, 5306 Erdal</p>
              <p><strong>{t.home.openingHours}</strong> 07:00 - 16:30</p>
              <p><strong>{t.home.numberOfChildren}</strong> 70 {language === 'no' ? 'barn' : 'children'}</p>
              <p><strong>{t.home.owner}</strong> Askøy kommune</p>
              <p className="mt-4">
                {t.home.kindergartenDescription}
              </p>
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
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="border border-neutral-200 rounded-lg p-4">
                    <div className="flex items-center mb-3">
                      <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center mr-3">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-medium text-neutral-900">{event.title}</h4>
                    </div>
                    <p className="text-sm text-neutral-600 mb-3">
                      {event.description}
                    </p>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
