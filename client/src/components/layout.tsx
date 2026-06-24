import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Menu, Home, Calendar, CalendarDays, Newspaper, Lightbulb, Mail, Folder, LogIn, LogOut, User, Settings as SettingsIcon, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import childIcon from "../assets/child.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { type Event } from "@shared/schema";
import LoginModal from "./login-modal";
import LanguageToggle from "./language-toggle";
import DarkModeToggle from "./dark-mode-toggle";

// Navigation will be translated dynamically

interface LayoutProps {
  children: React.ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  children?: NavigationItem[];
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

  const navigation: NavigationItem[] = [
    { name: t.navigation.home, href: "/", icon: Home },
    {
      name: t.navigation.updates,
      href: "/news",
      icon: Newspaper,
      children: [
        { name: t.navigation.news, href: "/news", icon: Newspaper },
        { name: t.navigation.tips, href: "/tips-tricks", icon: Lightbulb },
      ],
    },
    { name: t.navigation.events, href: "/events", icon: Calendar },
    { name: t.navigation.yearlyCalendar, href: "/arskalender", icon: CalendarDays },
    { name: t.navigation.contact, href: "/contact", icon: Mail },
    { name: t.navigation.documents, href: "/files", icon: Folder },
  ];
  const primaryNavigation = navigation.slice(0, 4);
  const secondaryNavigation = navigation.slice(4);
  const isNavigationItemActive = (item: NavigationItem) =>
    location === item.href || Boolean(item.children?.some((child) => child.href === location));
  const secondaryNavigationIsActive = secondaryNavigation.some(isNavigationItemActive);
  const desktopNavItemClass = (isActive: boolean) =>
    `flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 ${
      isActive
        ? "bg-primary/10 text-primary"
        : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 hover:text-primary dark:hover:bg-neutral-900"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col min-w-0">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-transparent dark:border-neutral-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 min-h-[4rem] min-w-0 lg:grid-cols-[minmax(220px,auto)_minmax(0,1fr)_auto]">
            {/* Logo */}
            <Link href="/" className="flex min-w-0 items-center space-x-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <img src={childIcon} alt="FAU Erdal Barnehage" className="w-10 h-10 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-heading font-bold text-lg text-neutral-900 dark:text-neutral-50 leading-tight">{t.header.title}</h1>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-tight">{t.header.subtitle}</p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden min-w-0 flex-nowrap items-center justify-center gap-1 lg:flex">
              {primaryNavigation.map((item) => {
                const isActive = isNavigationItemActive(item);
                if (item.children) {
                  return (
                    <DropdownMenu key={item.name}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className={desktopNavItemClass(isActive)}
                        >
                          <span>{item.name}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          return (
                            <DropdownMenuItem key={child.href} asChild>
                              <Link href={child.href} className="flex w-full items-center gap-2">
                                <ChildIcon className="h-4 w-4" />
                                <span>{child.name}</span>
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={desktopNavItemClass(isActive)}
                  >
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={desktopNavItemClass(secondaryNavigationIsActive)}
                  >
                    <span>{t.navigation.more}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {secondaryNavigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href} className="flex w-full items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            {/* Language Toggle, Dark Mode & Auth Controls */}
            <div className="hidden min-w-0 shrink-0 items-center justify-end gap-2 border-l border-neutral-200 pl-4 dark:border-neutral-800 lg:flex">
              <LanguageToggle />
              <DarkModeToggle />
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex max-w-[220px] items-center gap-2 px-3"
                      title={user?.name || "FAU"}
                      aria-label={user?.name || "FAU"}
                    >
                      <User className="h-4 w-4 shrink-0" />
                      {/* Hide username text at lg (1024-1279) to give the
                          nav row enough room. Show name at xl+ where there's
                          space. */}
                      <span className="hidden truncate xl:inline">{user?.name || "FAU"}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="truncate">{user?.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/messages" className="flex w-full items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>{language === 'no' ? 'Meldinger' : 'Messages'}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex w-full items-center gap-2">
                        <SettingsIcon className="h-4 w-4" />
                        <span>{language === 'no' ? 'Innstillinger' : 'Settings'}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isLoggingOut}
                      onSelect={(event) => {
                        event.preventDefault();
                        logout();
                      }}
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{isLoggingOut ? t.header.loggingOut : t.header.logout}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoginModalOpen(true)}
                  className="flex items-center gap-2"
                  title={t.header.login}
                  aria-label={t.header.login}
                >
                  <LogIn className="h-4 w-4 shrink-0" />
                  {/* Hide the label at lg (1024-1279) so the six nav items
                      have room to lay out without overlapping; reveal it
                      from xl (1280+) where there's space. */}
                  <span className="hidden xl:inline">{t.header.login}</span>
                </Button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="justify-self-end lg:hidden"
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
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.header.subtitle}</p>
                  </div>
                </div>
                <nav className="space-y-3">
                  {navigation.map((item) => {
                    const isActive = location === item.href || item.children?.some((child) => child.href === location);
                    const Icon = item.icon;
                    if (item.children) {
                      return (
                        <div key={item.name} className="space-y-2">
                          <div
                            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg ${
                              isActive
                                ? "text-primary bg-primary/10"
                                : "text-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <div className="ml-6 space-y-2">
                            {item.children.map((child) => {
                              const childIsActive = location === child.href;
                              const ChildIcon = child.icon;
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                                    childIsActive
                                      ? "text-primary bg-primary/10"
                                      : "text-neutral-600 dark:text-neutral-300 hover:text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                  }`}
                                >
                                  <ChildIcon className="h-5 w-5" />
                                  <span className="font-medium">{child.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "text-primary bg-primary/10"
                            : "text-neutral-600 dark:text-neutral-300 hover:text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* Mobile Language Toggle & Auth Controls */}
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6 mt-6 space-y-4">
                  <div className="flex justify-center gap-2">
                    <LanguageToggle />
                    <DarkModeToggle />
                  </div>
                  {isAuthenticated ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                        <User className="h-5 w-5 text-neutral-600 dark:text-neutral-300" />
                        <span className="font-medium text-neutral-900 dark:text-neutral-50">{user?.name}</span>
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
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full min-w-0 animate-in fade-in-0 duration-200">
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
                  className="block text-blue-400 hover:text-blue-300 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  {t.footer.facebook}
                </a>
                <a 
                  href="https://askoy.kommune.no/tjenester/barnehagen/barnehagene-pa-askoy/kommunalebarnehager/erdal-barnehage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  {t.footer.website}
                </a>
                <a 
                  href="https://barnehagefakta.no/barnehage/974600838/erdal-barnehage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  {t.footer.barnehageFakta}
                </a>
                {t.footer.hours && <p>{t.footer.hours}</p>}
                <a
                  href="https://foreldreutvalgene.no/fub/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  {t.footer.fubLink}
                </a>
                <Link
                  href="/nyhetsbrev"
                  className="block text-blue-400 hover:text-blue-300 transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                >
                  {t.newsletter.footerLink}
                </Link>
              </div>
            </div>
            
            <div>
              <h4 className="font-heading font-semibold mb-4">{t.footer.nextMeeting}</h4>
              <div className="bg-neutral-800 rounded-lg p-4">
                {nextMeeting ? (
                  <>
                    <p className="font-medium mb-2">{nextMeeting.title}</p>
                    <p className="text-sm text-neutral-300 mb-1">
                      {new Date(nextMeeting.date).toLocaleDateString(language === 'no' ? 'no-NO' : 'en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                    <p className="text-sm text-neutral-300 mb-3">
                      {language === 'no' ? 'Kl.' : 'At'} {nextMeeting.time} - {nextMeeting.location}
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
            <Link href="/personvern" className="inline-block mb-2 text-blue-400 hover:text-blue-300 transition-colors">
              {t.footer.privacy}
            </Link>
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
