import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Loader2, CheckCircle2, XCircle, CalendarDays, Clock, MapPin } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import PageHero from "@/components/site/page-hero";
import { Surface } from "@/components/site/section";
import { Button } from "@/components/ui/button";

type Lookup = {
  name: string;
  attendeeCount: number | null;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  location: string;
  customLocation: string | null;
  cancellable: boolean;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; registration: Lookup }
  | { kind: "cancelling"; registration: Lookup }
  | { kind: "cancelled" }
  | { kind: "closed" }
  | { kind: "notFound" }
  | { kind: "error"; registration?: Lookup };

function StatusCard({
  tone,
  title,
  description,
}: {
  tone: "pending" | "success" | "error";
  title: string;
  description?: string;
}) {
  return (
    <Surface className="space-y-4 p-8 text-center" role={tone === "error" ? "alert" : "status"}>
      {tone === "pending" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />}
      {tone === "success" && <CheckCircle2 className="mx-auto h-10 w-10 text-brand" />}
      {tone === "error" && <XCircle className="mx-auto h-10 w-10 text-destructive" />}
      <h2 className="text-h3 font-bold tracking-tight text-ink">{title}</h2>
      {description && <p className="text-copy">{description}</p>}
    </Surface>
  );
}

// Reached from the link in the registration confirmation and reminder emails.
// Looking the registration up is harmless, so it happens on load; deleting it
// waits for an explicit click, so a mail scanner that prefetches the link can
// never cancel anyone's place.
export default function RegistrationCancel() {
  const { language, t } = useLanguage();
  const copy = t.registrationCancel;
  const search = useSearch();
  const token = new URLSearchParams(search).get("token");

  usePageMeta({
    title: copy.navTitle,
    description: copy.subtitle,
    path: "/avmelding",
  });

  const [state, setState] = useState<State>({ kind: "loading" });
  const looked = useRef(false);

  useEffect(() => {
    if (!token || looked.current) return;
    looked.current = true;

    apiRequest("POST", "/api/registrations?action=cancel-lookup", { token })
      .then((res) => res.json())
      .then((registration: Lookup) =>
        setState(registration.cancellable ? { kind: "ready", registration } : { kind: "closed" }),
      )
      .catch((error) =>
        setState(error instanceof ApiError && error.status === 404 ? { kind: "notFound" } : { kind: "error" }),
      );
  }, [token]);

  const cancel = (registration: Lookup) => {
    setState({ kind: "cancelling", registration });
    apiRequest("POST", "/api/registrations?action=cancel", { token })
      .then(() => setState({ kind: "cancelled" }))
      .catch((error) =>
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: "notFound" }
            : { kind: "error", registration },
        ),
      );
  };

  let content;
  if (!token) {
    content = <StatusCard tone="error" title={copy.notFoundTitle} description={copy.missingTokenDesc} />;
  } else if (state.kind === "loading") {
    content = <StatusCard tone="pending" title={copy.loading} />;
  } else if (state.kind === "cancelled") {
    content = <StatusCard tone="success" title={copy.successTitle} description={copy.successDesc} />;
  } else if (state.kind === "closed") {
    content = <StatusCard tone="error" title={copy.closedTitle} description={copy.closedDesc} />;
  } else if (state.kind === "notFound") {
    content = <StatusCard tone="error" title={copy.notFoundTitle} description={copy.notFoundDesc} />;
  } else if (state.kind === "error" && !state.registration) {
    content = <StatusCard tone="error" title={copy.errorTitle} description={copy.errorDesc} />;
  } else {
    const registration = state.registration!;
    const busy = state.kind === "cancelling";
    const location = registration.customLocation
      ? `${registration.location} (${registration.customLocation})`
      : registration.location;
    const date = new Date(registration.eventDate).toLocaleDateString(language === "en" ? "en-US" : "no-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    content = (
      <Surface className="space-y-6 p-6 sm:p-8">
        <div className="space-y-3">
          <h2 className="text-h3 font-bold tracking-tight text-ink">{registration.eventTitle}</h2>
          <ul className="space-y-2 text-copy">
            <li className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              {date}
            </li>
            {registration.eventTime && (
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                {registration.eventTime}
              </li>
            )}
            {location && (
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                {location}
              </li>
            )}
          </ul>
        </div>

        <dl className="grid gap-1 text-copy sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="font-semibold text-ink">{copy.registeredAs}</dt>
          <dd>{registration.name}</dd>
          <dt className="font-semibold text-ink">{copy.attendees}</dt>
          <dd>{registration.attendeeCount ?? 1}</dd>
        </dl>

        {state.kind === "error" && (
          <p className="text-small text-destructive" role="alert">
            {copy.errorDesc}
          </p>
        )}

        <div className="space-y-3">
          <p className="text-copy">{copy.confirmQuestion}</p>
          <Button onClick={() => cancel(registration)} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? copy.cancelling : copy.cancelButton}
          </Button>
        </div>
      </Surface>
    );
  }

  return (
    <div className="mx-auto max-w-2xl section-rhythm">
      <PageHero tone="peach" title={copy.title} lead={copy.subtitle} />
      {content}
    </div>
  );
}
