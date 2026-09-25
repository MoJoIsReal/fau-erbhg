import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2, MailWarning } from "lucide-react";
import { InfoBanner } from "@/components/site/banners";
import { StatusPill } from "@/components/site/controls";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

interface Subscriber {
  id: number;
  email: string;
  name?: string | null;
  language: string;
  status: "pending" | "active" | "unsubscribed";
  createdAt?: string;
  confirmedAt?: string | null;
  unsubscribedAt?: string | null;
  /** Newsletter mails still to go out to this address, retries included. */
  pendingDeliveries?: number;
  /** Mails given up on after the last attempt (kept for 90 days). */
  failedDeliveries?: number;
}

const SUBSCRIBERS_KEY = "/api/secure-settings?resource=newsletter-subscribers";

export default function NewsletterSubscribersSection() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subscribers = [], isLoading } = useQuery<Subscriber[]>({
    queryKey: [SUBSCRIBERS_KEY],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `${SUBSCRIBERS_KEY}&id=${id}`);
      if (res.status !== 204 && !res.ok) {
        throw new Error(await res.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUBSCRIBERS_KEY] });
    },
    onError: (err: any) => {
      toast({
        title: t.settings.error,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const statusLabel = (status: Subscriber["status"]) => {
    if (status === "active") return t.newsletter.admin.statusActive;
    if (status === "unsubscribed") return t.newsletter.admin.statusUnsubscribed;
    return t.newsletter.admin.statusPending;
  };

  const statusClass = (status: Subscriber["status"]) => {
    if (status === "active") return "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40";
    if (status === "unsubscribed") return "text-subtle bg-green-50";
    return "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40";
  };

  const activeCount = subscribers.filter((s) => s.status === "active").length;
  const pendingDeliveries = subscribers.reduce((sum, s) => sum + (s.pendingDeliveries ?? 0), 0);
  const failedDeliveries = subscribers.reduce((sum, s) => sum + (s.failedDeliveries ?? 0), 0);

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-ink mb-2">
          {t.newsletter.admin.title}
        </h2>
        <p className="text-sm text-subtle">{t.newsletter.admin.description}</p>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-subtle" />
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-subtle italic">{t.newsletter.admin.noSubscribers}</p>
      ) : (
        <>
          <p className="text-sm text-subtle mb-3">
            {activeCount} {t.newsletter.admin.activeCount}
            {pendingDeliveries > 0 && (
              // "Label: n" reads right for one mail or many, in both languages.
              <> · {t.newsletter.admin.deliveryPending}: {pendingDeliveries}</>
            )}
          </p>
          {failedDeliveries > 0 && (
            <div className="mb-3">
              <InfoBanner
                tone="alert"
                icon={<MailWarning className="h-5 w-5" aria-hidden="true" />}
                title={t.newsletter.admin.deliveryFailedTitle}
              >
                {t.newsletter.admin.deliveryFailedBody}
              </InfoBanner>
            </div>
          )}
          <ul className="divide-y border rounded-md">
            {subscribers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">{s.email}</div>
                  {s.name && <div className="text-xs text-subtle truncate">{s.name}</div>}
                  {(s.failedDeliveries ?? 0) > 0 && (
                    <StatusPill tone="warn" className="mt-1">
                      <MailWarning className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.newsletter.admin.deliveryFailedTag}
                    </StatusPill>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-pill ${statusClass(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                        disabled={deleteMutation.isPending}
                        aria-label={t.newsletter.admin.delete}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.newsletter.admin.delete}</AlertDialogTitle>
                        <AlertDialogDescription>{t.newsletter.admin.deleteConfirm}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.settings.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => deleteMutation.mutate(s.id)}
                        >
                          {t.settings.delete}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
