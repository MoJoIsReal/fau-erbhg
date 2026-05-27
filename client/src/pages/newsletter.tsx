import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import NewsletterSignup from "@/components/newsletter-signup";

type Status = "pending" | "success" | "error";

function StatusCard({ status, title, description }: { status: Status; title: string; description?: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        {status === "pending" && <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />}
        {status === "success" && <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />}
        {status === "error" && <XCircle className="h-10 w-10 text-red-600 mx-auto" />}
        <h3 className="font-heading font-semibold text-xl text-neutral-900 dark:text-neutral-50">{title}</h3>
        {description && <p className="text-neutral-600 dark:text-neutral-300">{description}</p>}
      </CardContent>
    </Card>
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
      <Card>
        <CardContent className="p-6">
          <NewsletterSignup />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h2 className="font-heading font-bold text-3xl text-neutral-900 dark:text-neutral-50 mb-2">
          {t.newsletter.title}
        </h2>
        <p className="text-neutral-600 dark:text-neutral-300">{t.newsletter.subtitle}</p>
      </div>
      {content}
    </div>
  );
}
