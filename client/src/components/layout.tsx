import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Home, Calendar, Newspaper, Mail, Folder, LogIn, LogOut, User, Settings as SettingsIcon, MessageSquare } from "lucide-react";
import childIcon from "../assets/child.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { type Event } from "@shared/schema";
import LoginModal from "./login-modal";
import LanguageToggle from "./language-toggle";

// Navigation will be translated dynamically

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { t, language } = useLanguage();

  // Fetch events to find next meeting
  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Find next meeting (including internal events)
  const nextMeeting = events
    .filter(event =>
      event.status === 'active' &&
      new Date(event.date) >= new Date()
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  const navigation = [
    { name: t.navigation.home, href: "/", icon: Home },
    { name: t.navigation.news, href: "/news", icon: Newspaper },
    { name: t.navigation.events, href: "/events", icon: Calendar },
    { name: t.navigation.contact, href: "/contact", icon: Mail },
    { name: t.navigation.documents, href: "/files", icon: Folder },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 min-h-[4rem]">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <img src={childIcon} alt="FAU Erdal Barnehage" className="w-10 h-10 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-heading font-bold text-lg text-neutral-900 leading-tight">{t.header.title}</h1>
                <p className="text-xs sm:text-sm text-neutral-600 leading-tight">{t.header.subtitle}</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <nav className="flex space-x-8">
                {navigation.map((item) => {
                  const isActive = location === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`font-medium transition-colors pb-1 flex items-center space-x-2 ${
                        isActive
                          ? "text-primary border-b-2 border-primary"
                          : "text-neutral-600 hover:text-primary"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Language Toggle & Auth Controls */}
              <div className="flex items-center space-x-4 ml-8 border-l border-neutral-200 pl-8">
                <LanguageToggle />
                {isAuthenticated ? (
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-sm text-neutral-600">
                      <User className="h-4 w-4" />
                      <span>{user?.name}</span>
                    </div>
                    <Link href="/messages">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span>{language === 'no' ? 'Meldinger' : 'Messages'}</span>
                      </Button>
                    </Link>
                    <Link href="/settings">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        <span>{language === 'no' ? 'Innstillinger' : 'Settings'}</span>
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logout()}
                      disabled={isLoggingOut}
                      className="flex items-center space-x-2"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{isLoggingOut ? t.header.loggingOut : t.header.logout}</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLoginModalOpen(true)}
                    className="flex items-center space-x-2"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>{t.header.login}</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={language === 'no' ? 'Åpne meny' : 'Open menu'}
                >
                  <Menu className="h-6 w-6" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="w-8 h-8 flex items-center justify-center">
                    <img src={childIcon} alt="FAU Erdal Barnehage" className="w-8 h-8 object-contain" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-lg">{t.header.title}</h2>
                    <p className="text-sm text-neutral-600">{t.header.subtitle}</p>
                  </div>
                </div>
                <nav className="space-y-3">
                  {navigation.map((item) => {
                    const isActive = location === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "text-primary bg-primary/10"
                            : "text-neutral-600 hover:text-primary hover:bg-neutral-100"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* Mobile Language Toggle & Auth Controls */}
                <div className="border-t border-neutral-200 pt-6 mt-6 space-y-4">
                  <div className="flex justify-center">
                    <LanguageToggle />
                  </div>
                  {isAuthenticated ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3 px-4 py-2 bg-neutral-100 rounded-lg">
                        <User className="h-5 w-5 text-neutral-600" />
                        <span className="font-medium text-neutral-900">{user?.name}</span>
                      </div>
                      <Link href="/messages">
                        <Button
                          variant="outline"
                          onClick={() => setMobileMenuOpen(false)}
                          className="w-full flex items-center space-x-2"
                        >
                          <MessageSquare className="h-4 w-4" />
                          <span>{language === 'no' ? 'Meldinger' : 'Messages'}</span>
                        </Button>
                      </Link>
                      <Link href="/settings">
                        <Button
                          variant="outline"
                          onClick={() => setMobileMenuOpen(false)}
                          className="w-full flex items-center space-x-2"
                        >
                          <SettingsIcon className="h-4 w-4" />
                          <span>{language === 'no' ? 'Innstillinger' : 'Settings'}</span>
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        onClick={() => logout()}
                        disabled={isLoggingOut}
                        className="w-full flex items-center space-x-2"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{isLoggingOut ? t.header.loggingOut : t.header.logout}</span>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setLoginModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>{t.header.login}</span>
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-900 text-white py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src={childIcon} alt="FAU Erdal Barnehage" className="w-8 h-8 object-contain" />
                </div>
                <span className="font-heading font-bold text-lg">{t.header.title}</span>
              </div>
              <p className="text-neutral-300 text-sm mb-4">
                {t.footer.description}
              </p>
            </div>
            
            <div>
              <h4 className="font-heading font-semibold mb-4">{t.footer.contactInfo}</h4>
              <div className="space-y-2 text-sm text-neutral-300">
                {t.footer.address && <p>{t.footer.address}</p>}
                {t.footer.phone && <p>{t.footer.phone}</p>}
                <a 
                  href="https://www.facebook.com/groups/1674520382805077"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t.footer.facebook}
                </a>
                <a 
                  href="https://askoy.kommune.no/tjenester/barnehagen/barnehagene-pa-askoy/kommunalebarnehager/erdal-barnehage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t.footer.website}
                </a>
                <a 
                  href="https://barnehagefakta.no/barnehage/974600838/erdal-barnehage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t.footer.barnehageFakta}
                </a>
                {t.footer.hours && <p>{t.footer.hours}</p>}
                <a 
                  href="https://foreldreutvalgene.no/fub/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t.footer.fubLink}
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-heading font-semibold mb-4">{t.footer.nextMeeting}</h4>
              <div className="bg-neutral-800 rounded-lg p-4">
                {nextMeeting ? (
                  <>
                    <p className="font-medium mb-2">{nextMeeting.title}</p>
                    <p className="text-sm text-neutral-300 mb-1">
                      {new Date(nextMeeting.date).toLocaleDateString('no-NO', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-sm text-neutral-300 mb-3">
                      Kl. {nextMeeting.time} - {nextMeeting.location}
                    </p>
                    <Link href="/events" className="text-primary hover:text-white text-sm font-medium">
                      {t.home.moreInfo}
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-neutral-300">{t.home.noEvents}</p>
                )}
              </div>
            </div>
          </div>
          
          <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm text-neutral-400">
            <p>{t.footer.copyright}</p>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal 
        isOpen={loginModalOpen} 
        onClose={() => setLoginModalOpen(false)} 
      />
    </div>
  );
}
