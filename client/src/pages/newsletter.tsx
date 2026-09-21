import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import NewsletterSignup from "@/components/newsletter-signup";
import PageHero from "@/components/site/page-hero";
import { Surface } from "@/components/site/section";

type Status = "pending" | "success" | "error";

function StatusCard({
  status,
  title,
  description,
}: {
  status: Status;
  title: string;
  description?: string;
}) {
  return (
    <Surface className="space-y-4 p-8 text-center" role={status === "error" ? "alert" : "status"}>
      {status === "pending" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />}
      {status === "success" && <CheckCircle2 className="mx-auto h-10 w-10 text-brand" />}
      {status === "error" && <XCircle className="mx-auto h-10 w-10 text-destructive" />}
      <h2 className="text-h3 font-bold tracking-tight text-ink">{title}</h2>
      {description && <p className="text-copy">{description}</p>}
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

  const [status, setStatus] = useState<Status>("pending");
  // Tokens are acted on exactly once even though effects may run twice in dev.
  const handled = useRef(false);

  useEffect(() => {
    const token = confirmToken || unsubscribeToken;
    if (!token || handled.current) return;
    handled.current = true;

    const action = confirmToken ? "newsletter-confirm" : "newsletter-unsubscribe";
    apiRequest("POST", `/api/contact?action=${action}`, { token })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [confirmToken, unsubscribeToken]);

  let content;
  if (confirmToken) {
    content = (
      <StatusCard
        status={status}
        title={
          status === "pending"
            ? t.newsletter.confirmPendingTitle
            : status === "success"
            ? t.newsletter.confirmSuccessTitle
            : t.newsletter.confirmErrorTitle
        }
        description={
          status === "success"
            ? t.newsletter.confirmSuccessDesc
            : status === "error"
            ? t.newsletter.confirmErrorDesc
            : undefined
        }
      />
    );
  } else if (unsubscribeToken) {
    content = (
      <StatusCard
        status={status}
        title={
          status === "pending"
            ? t.newsletter.unsubPendingTitle
            : status === "success"
            ? t.newsletter.unsubSuccessTitle
            : t.newsletter.unsubErrorTitle
        }
        description={
          status === "success"
            ? t.newsletter.unsubSuccessDesc
            : status === "error"
            ? t.newsletter.unsubErrorDesc
            : undefined
        }
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
