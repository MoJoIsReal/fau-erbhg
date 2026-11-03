import { useRef, useState } from "react";
import { useSearch } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorText, apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import NewsletterSignup from "@/components/newsletter-signup";
import PageHero from "@/components/site/page-hero";
import { Surface } from "@/components/site/section";

type Status = "ready" | "pending" | "success" | "error";

function StatusCard({
  status,
  title,
  description,
  action,
}: {
  status: Status;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Surface className="space-y-4 p-8 text-center" role={status === "error" ? "alert" : "status"}>
      {status === "pending" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />}
      {status === "success" && <CheckCircle2 className="mx-auto h-10 w-10 text-brand" />}
      {status === "error" && <XCircle className="mx-auto h-10 w-10 text-destructive" />}
      <h2 className="text-h3 font-bold tracking-tight text-ink">{title}</h2>
      {description && <p className="text-copy">{description}</p>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </Surface>
  );
}

export default function Newsletter() {
  const { language, t } = useLanguage();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const confirmToken = params.get("bekreft");
  const unsubscribeToken = params.get("avmeld");

  usePageMeta({
    title: t.newsletter.navTitle,
    description: t.newsletter.subtitle,
    path: "/nyhetsbrev",
  });

  const [status, setStatus] = useState<Status>("ready");
  // Why it failed. A link that is invalid, used or expired will not work on a
  // second try; anything else (too many attempts, a dropped connection) might,
  // so it says so and offers to try again. Every failure used to read as a
  // dead link, telling a parent to sign up again when a retry would do.
  const [failure, setFailure] = useState<{ kind: "link" } | { kind: "transient"; message: string } | null>(null);
  // A token is sent once, even if the button is pressed twice.
  const handled = useRef(false);

  // Nothing happens until the button is pressed. Mail scanners open the links
  // in a message, some running its scripts: acting on page load let one
  // unsubscribe a parent, or confirm an address someone else had entered.
  const act = () => {
    const token = confirmToken || unsubscribeToken;
    if (!token || handled.current) return;
    handled.current = true;
    setStatus("pending");
    const action = confirmToken ? "newsletter-confirm" : "newsletter-unsubscribe";
    apiRequest("POST", `/api/contact?action=${action}`, { token })
      .then(() => setStatus("success"))
      .catch((error) => {
        setFailure(getApiErrorBody(error)?.code === "LINK_EXPIRED"
          ? { kind: "link" }
          : { kind: "transient", message: apiErrorText(error, t, t.apiErrors.generic) });
        setStatus("error");
      });
  };
  const retry = () => {
    handled.current = false;
    setFailure(null);
    act();
  };
  const retryAction = failure?.kind === "transient" ? { label: t.dataState.retry, onClick: retry } : undefined;

  let content;
  if (confirmToken) {
    content = (
      <StatusCard
        status={status}
        title={
          status === "ready"
            ? t.newsletter.confirmReadyTitle
            : status === "pending"
            ? t.newsletter.confirmPendingTitle
            : status === "success"
            ? t.newsletter.confirmSuccessTitle
            : failure?.kind === "transient"
            ? t.newsletter.transientTitle
            : t.newsletter.confirmErrorTitle
        }
        description={
          status === "ready"
            ? t.newsletter.confirmReadyDesc
            : status === "success"
            ? t.newsletter.confirmSuccessDesc
            : failure?.kind === "transient"
            ? failure.message
            : status === "error"
            ? t.newsletter.confirmErrorDesc
            : undefined
        }
        action={status === "ready" ? { label: t.newsletter.confirmButton, onClick: act } : retryAction}
      />
    );
  } else if (unsubscribeToken) {
    content = (
      <StatusCard
        status={status}
        title={
          status === "ready"
            ? t.newsletter.unsubReadyTitle
            : status === "pending"
            ? t.newsletter.unsubPendingTitle
            : status === "success"
            ? t.newsletter.unsubSuccessTitle
            : failure?.kind === "transient"
            ? t.newsletter.transientTitle
            : t.newsletter.linkInvalidTitle
        }
        description={
          status === "ready"
            ? t.newsletter.unsubReadyDesc
            : status === "success"
            ? t.newsletter.unsubSuccessDesc
            : failure?.kind === "transient"
            ? failure.message
            : status === "error"
            ? t.apiErrors.LINK_EXPIRED
            : undefined
        }
        action={status === "ready" ? { label: t.newsletter.unsubButton, onClick: act } : retryAction}
      />
    );
  } else {
    content = (
      <Surface className="p-6">
        <NewsletterSignup />
      </Surface>
    );
  }

  return (
    <div className="mx-auto max-w-2xl section-rhythm">
      <PageHero tone="peach" title={t.newsletter.title} lead={t.newsletter.subtitle} />
      {content}
    </div>
  );
}
