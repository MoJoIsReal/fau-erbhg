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
import { Trash2, Loader2 } from "lucide-react";
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
        title: language === "no" ? "Feil" : "Error",
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
    if (status === "unsubscribed") return "text-neutral-600 bg-neutral-100 dark:text-neutral-300 dark:bg-neutral-800";
    return "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40";
  };

  const activeCount = subscribers.filter((s) => s.status === "active").length;

  return (
    <Card className="p-6 mt-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-50 mb-2">
          {t.newsletter.admin.title}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.newsletter.admin.description}</p>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-neutral-500 dark:text-neutral-400" />
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">{t.newsletter.admin.noSubscribers}</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
            {activeCount} {t.newsletter.admin.activeCount}
          </p>
          <ul className="divide-y dark:divide-neutral-800 border dark:border-neutral-800 rounded-md">
            {subscribers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900 dark:text-neutral-50 truncate">{s.email}</div>
                  {s.name && <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{s.name}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass(s.status)}`}>
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
                        <AlertDialogCancel>{language === "no" ? "Avbryt" : "Cancel"}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => deleteMutation.mutate(s.id)}
                        >
                          {language === "no" ? "Slett" : "Delete"}
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
