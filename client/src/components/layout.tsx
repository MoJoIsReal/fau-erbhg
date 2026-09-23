import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Folder,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Newspaper,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
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
import LoginModal from "./login-modal";
import PasswordChangeModal from "./password-change-modal";
import LanguageToggle from "./language-toggle";
import DarkModeToggle from "./dark-mode-toggle";

interface LayoutProps {
  children: React.ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  // Extra paths that should highlight this item (e.g. /tips-tricks and the
  // /nyheter/:id permalinks all belong to "Aktuelt").
  matchPrefixes?: string[];
}

/**
 * The site chrome: one header, one footer, one content container.
 *
 * Header and footer are deliberately light. The guide's §6 asks for a 72px
 * desktop bar with the logo left and the main pages scannable at a glance,
 * the active page marked by *one* device — an underline — rather than an
 * underline and a pill at once. Everything that is not a public page
 * (language, theme, login, the editor's own destinations) sits to the right
 * of a separator, because admin functions do not belong in public navigation.
 */
export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { t, language } = useLanguage();
  const isAdmin = user?.role === "admin";
  const isCouncil = user?.role === "admin" || user?.role === "member";

  // wouter swaps the page without a document load, so focus would stay on the
  // link that was just activated, somewhere in the header. Move it to <main>
  // on every client-side navigation so a keyboard or screen-reader user
  // starts at the new page's content. The first render is skipped: on a
  // fresh load the browser already starts at the top of the document.
  const mainRef = useRef<HTMLElement>(null);
  const previousLocation = useRef(location);
  useEffect(() => {
    if (previousLocation.current === location) return;
    previousLocation.current = location;
    mainRef.current?.focus({ preventScroll: true });
  }, [location]);

  // The guide's recommended order: Hjem | Aktuelt | Kalender | Dokumenter |
  // Kontakt. News and tips share one page with a category switch, so
  // "Aktuelt" is a plain link rather than a dropdown.
  const navigation: NavigationItem[] = [
    { name: t.navigation.home, href: "/", icon: Home },
    {
      name: t.navigation.updates,
      href: "/news",
      icon: Newspaper,
      matchPrefixes: ["/nyheter", "/tips-tricks", "/tips-og-triks"],
    },
    {
      name: t.navigation.calendar,
      href: "/kalender",
      icon: CalendarDays,
      matchPrefixes: ["/kalender", "/events", "/arskalender"],
    },
    { name: t.navigation.documents, href: "/files", icon: Folder },
    { name: t.navigation.contact, href: "/contact", icon: Mail },
  ];

  const isActive = (item: NavigationItem) =>
    location === item.href ||
    Boolean(
      item.matchPrefixes?.some(
        (prefix) => location === prefix || location.startsWith(`${prefix}/`),
      ),
    );

  const editorLinks = [
    isCouncil && { href: "/admin", icon: LayoutDashboard, label: t.header.overview },
    isCouncil && { href: "/content", icon: Newspaper, label: t.header.content },
    isCouncil && { href: "/messages", icon: MessageSquare, label: t.header.messages },
    isAdmin && { href: "/settings", icon: SettingsIcon, label: t.header.settings },
  ].filter(Boolean) as { href: string; icon: LucideIcon; label: string }[];

  // The resources parents reach for, gathered in the footer where they are on
  // every page rather than only at the bottom of the home page. Ordered by how
  // often a parent actually needs them, not alphabetically.
  const usefulLinks = [
    { href: "https://vigilo.no", label: t.footer.vigilo },
    { href: "https://www.facebook.com/groups/1674520382805077", label: t.footer.facebook },
    {
      href: "https://askoy.kommune.no/tjenester/barnehagen/barnehagene-pa-askoy/kommunalebarnehager/erdal-barnehage",
      label: t.footer.website,
    },
    {
      href: "https://www.helsedirektoratet.no/retningslinjer/mat-og-maltider-i-barnehagen",
      label: t.footer.meals,
    },
    { href: "https://foreldreutvalgene.no/fub/", label: t.footer.fubLink },
    {
      href: "https://barnehagefakta.no/barnehage/974600838/erdal-barnehage",
      label: t.footer.barnehageFakta,
    },
  ];

  const navLinkClass = (active: boolean) =>
    `relative flex h-[var(--header-height)] items-center whitespace-nowrap px-3.5 text-body font-semibold transition-colors duration-micro ease-guide xl:px-5 ${
      active ? "text-brand" : "text-copy hover:text-brand"
    }`;

  const mobileLinkClass = (active: boolean) =>
    `flex min-h-[52px] items-center gap-3 rounded-token px-3 text-body font-semibold transition-colors duration-micro ease-guide ${
      active ? "bg-green-50 text-brand" : "text-copy hover:bg-green-50"
    }`;

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-background">
      {/* First stop for a keyboard reader on every page. */}
      <a
        href="#main"
        className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-token focus:bg-brand focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        {t.ui.skipToContent}
      </a>

      <header className="sticky top-0 z-50 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="container-page flex h-[var(--header-height-mobile)] items-center justify-between gap-4 lg:h-[var(--header-height)]">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-token py-1"
            aria-label={t.header.title}
          >
            <img
              src={childIcon}
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain lg:h-11 lg:w-11"
            />
            <span className="min-w-0">
              {/* Site name, not a heading: it is identical on every page, so
                  the page's own <h1> is what should describe that page. */}
              <span className="block truncate text-body font-bold leading-tight tracking-tight text-ink lg:text-h4">
                {t.header.title}
              </span>
              <span className="hidden truncate text-micro leading-tight text-subtle sm:block">
                {t.header.subtitle}
              </span>
            </span>
          </Link>

          <nav aria-label={t.ui.menu} className="hidden min-w-0 items-center lg:flex">
            {navigation.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClass(active)}
                >
                  {item.name}
                  {/* The active page is marked by form as well as colour: the
                      underline is what a reader who cannot separate green from
                      grey still sees. */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-3.5 bottom-0 h-[3px] rounded-t-pill bg-brand transition-opacity duration-micro ease-guide xl:inset-x-5 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 border-l border-hairline pl-3 lg:flex">
            <LanguageToggle />
            <DarkModeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex max-w-[200px] items-center gap-2"
                    aria-label={user?.name || t.ui.account}
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span className="hidden truncate xl:inline">{user?.name || "FAU"}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{user?.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {editorLinks.map(({ href, icon: Icon, label }) => (
                    <DropdownMenuItem key={href} asChild>
                      <Link href={href} className="flex w-full items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  {editorLinks.length > 0 && <DropdownMenuSeparator />}
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
                variant="ghost"
                size="sm"
                onClick={() => setLoginModalOpen(true)}
                className="flex items-center gap-2"
              >
                <LogIn className="h-4 w-4 shrink-0" />
                <span>{t.header.login}</span>
              </Button>
            )}
          </div>

          {/* Mobile menu. Not the desktop nav squeezed narrow: the pages come
              first as a full-width list with room for a thumb, and everything
              secondary lives under a separator below them (guide §6). */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t.ui.menu}>
                <Menu className="h-6 w-6" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex h-[100dvh] w-full flex-col gap-0 overflow-y-auto overscroll-contain bg-surface p-0 sm:max-w-sm"
            >
              <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
                <img src={childIcon} alt="" aria-hidden="true" className="h-9 w-9 object-contain" />
                <div className="min-w-0">
                  <p className="truncate font-bold leading-tight text-ink">{t.header.title}</p>
                  <p className="truncate text-micro text-subtle">{t.header.subtitle}</p>
                </div>
              </div>

              <nav aria-label={t.ui.menu} className="px-3 py-3">
                {navigation.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={mobileLinkClass(active)}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span>{item.name}</span>
                      {active && (
                        <span className="ml-auto h-2 w-2 rounded-pill bg-brand" aria-hidden="true" />
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-hairline px-5 py-5">
                <p className="mb-3 text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
                  {t.ui.appearance}
                </p>
                <div className="flex flex-wrap gap-2">
                  <LanguageToggle />
                  <DarkModeToggle />
                </div>

                {isAuthenticated && editorLinks.length > 0 && (
                  <>
                    <p className="mb-3 mt-6 text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
                      {t.ui.editorTools}
                    </p>
                    <div className="grid gap-2">
                      {editorLinks.map(({ href, icon: Icon, label }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-[48px] items-center gap-3 rounded-token border border-hairline px-3 text-small font-semibold text-copy hover:bg-green-50"
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{label}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                <div className="mt-6">
                  {isAuthenticated ? (
                    <Button
                      variant="outline"
                      onClick={() => logout()}
                      disabled={isLoggingOut}
                      className="w-full"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{isLoggingOut ? t.header.loggingOut : t.header.logout}</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setLoginModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>{t.header.login}</span>
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* tabIndex -1 makes <main> a focus target for the skip link and the
          navigation reset above without adding it to the tab order. It is a
          landmark, not a control, so it carries no focus ring of its own. */}
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="container-page focus:outline-none w-full min-w-0 flex-1 py-10 lg:py-14 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        {children}
      </main>

      {/* Light sand rather than the old near-black slab: the guide's default
          footer is a quiet extension of the page, held to four groups so it
          does not become a drawer for everything that fits nowhere else. */}
      <footer className="mt-auto border-t border-hairline bg-sand">
        <div className="container-page grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4 lg:py-16">
          <div>
            <div className="flex items-center gap-3">
              <img src={childIcon} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
              <span className="font-bold text-ink">{t.header.title}</span>
            </div>
            <p className="mt-4 text-small text-subtle">{t.footer.description}</p>
          </div>

          <nav aria-labelledby="footer-quick-links">
            <h2
              id="footer-quick-links"
              className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle"
            >
              {t.ui.quickLinks}
            </h2>
            <ul className="mt-4 space-y-3 text-body">
              {navigation.slice(1).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-copy hover:text-brand hover:underline">
                    {item.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/nyhetsbrev" className="text-copy hover:text-brand hover:underline">
                  {t.newsletter.footerLink}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Two columns from tablet up: six links in one stack would run
              longer than the footer's other groups and unbalance the row. */}
          <nav aria-labelledby="footer-useful" className="md:col-span-2">
            <h2
              id="footer-useful"
              className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle"
            >
              {t.footer.usefulLinks}
            </h2>
            <ul className="mt-4 grid gap-3 text-body sm:grid-cols-2">
              {usefulLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1.5 text-copy hover:text-brand hover:underline"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">({t.ui.externalLink})</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-hairline">
          <div className="container-page flex flex-wrap items-center justify-between gap-3 py-5 text-micro text-subtle">
            <p>{t.footer.copyright}</p>
            <Link
              href="/personvern"
              className="font-semibold text-copy hover:text-brand hover:underline"
            >
              {t.footer.privacy}
            </Link>
          </div>
        </div>
      </footer>

      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
      {user?.passwordChangeRequired && <PasswordChangeModal />}
    </div>
  );
}
