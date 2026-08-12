import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Mail, Clock, User, Phone, Trash2, Check, Archive, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'new' | 'responded' | 'archived';
  createdAt: string;
  respondedAt?: string;
  respondedBy?: string;
}

type StatusFilter = 'all' | 'new' | 'responded' | 'archived';

export default function Messages() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedMessage, setExpandedMessage] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Fetch contact messages
  const { data: messages = [], isLoading } = useQuery<ContactMessage[]>({
    queryKey: ["/api/secure-settings?resource=contact-messages"],
  });

  // Update message status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/secure-settings?resource=contact-messages&id=${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=contact-messages"] });
      toast({
        title: t.messagesPage.updated,
        description: t.messagesPage.statusHasBeenUpdated,
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t.messagesPage.error,
        description: t.messagesPage.couldNotUpdateStatus,
      });
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/secure-settings?resource=contact-messages&id=${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=contact-messages"] });
      toast({
        title: t.messagesPage.deleted,
        description: t.messagesPage.messageWasDeleted,
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t.messagesPage.error,
        description: t.messagesPage.couldNotDeleteMessage,
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500">{t.messagesPage.new}</Badge>;
      case 'responded':
        return <Badge className="bg-green-500">{t.messagesPage.responded}</Badge>;
      case 'archived':
        return <Badge variant="secondary">{t.messagesPage.archived}</Badge>;
      default:
        return null;
    }
  };

  const getSubjectLabel = (subject: string) => {
    const subjects: Record<string, { no: string; en: string }> = {
      anonymous: { no: "Anonym henvendelse", en: "Anonymous inquiry" },
      general: { no: "Generell henvendelse", en: "General inquiry" },
      concern: { no: "Bekymringsmelding", en: "Concern" },
      feedback: { no: "Tilbakemelding", en: "Feedback" },
    };
    return language === "no" ? subjects[subject]?.no || subject : subjects[subject]?.en || subject;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const newMessages = messages.filter(m => m.status === 'new');
  const respondedMessages = messages.filter(m => m.status === 'responded');
  const archivedMessages = messages.filter(m => m.status === 'archived');

  // Unhandled messages first, newest first within each group — so an
  // archived message from last year can't sit above a fresh inquiry.
  const STATUS_ORDER: Record<ContactMessage['status'], number> = { new: 0, responded: 1, archived: 2 };
  const visibleMessages = (
    statusFilter === 'all' ? [...messages] : messages.filter((m) => m.status === statusFilter)
  ).sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // The summary cards are the filter controls: they looked clickable before
  // but did nothing, while the list always showed everything regardless of
  // what the counters said.
  const filterCards: {
    key: StatusFilter;
    label: string;
    count: number;
    icon: typeof Mail;
    numberClass: string;
    iconClass: string;
  }[] = [
    {
      key: 'new',
      label: t.messagesPage.new2,
      count: newMessages.length,
      icon: Mail,
      numberClass: "text-blue-600 dark:text-blue-300",
      iconClass: "text-blue-500",
    },
    {
      key: 'responded',
      label: t.messagesPage.responded,
      count: respondedMessages.length,
      icon: Check,
      numberClass: "text-green-600 dark:text-green-300",
      iconClass: "text-green-500",
    },
    {
      key: 'archived',
      label: t.messagesPage.archived,
      count: archivedMessages.length,
      icon: Archive,
      numberClass: "text-neutral-600 dark:text-neutral-300",
      iconClass: "text-neutral-500 dark:text-neutral-400",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-50">
          {t.messagesPage.messages}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-300 mt-2">
          {language === "no"
            ? "Administrer henvendelser fra kontaktskjemaet"
            : "Manage contact form submissions"}
        </p>
      </div>

      {/* Summary cards double as status filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8" role="group" aria-label={t.messagesPage.filterByStatus}>
        {filterCards.map((card) => {
          const Icon = card.icon;
          const isActive = statusFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setStatusFilter(isActive ? 'all' : card.key)}
              aria-pressed={isActive}
              className="text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
            >
              <Card className={isActive ? "border-primary ring-1 ring-primary" : "transition-colors hover:border-neutral-300 dark:hover:border-neutral-700"}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">{card.label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${card.numberClass}`}>{card.count}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${card.iconClass}`} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {isActive
                      ? t.messagesPage.showAll
                      : t.messagesPage.showOnlyThese}
                  </p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Messages list */}
      <Card>
        <CardContent className="p-6">
          {visibleMessages.length === 0 ? (
            <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              {messages.length === 0
                ? t.messagesPage.noMessagesYet
                : t.messagesPage.noMessagesWithStatus}
            </p>
          ) : (
            <div className="space-y-4">
              {visibleMessages.map((message) => (
                <Card key={message.id} className={`${message.status === 'new' ? 'border-blue-300 bg-blue-50/50 dark:border-blue-900/80 dark:bg-blue-950/20' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(message.status)}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-50">{getSubjectLabel(message.subject)}</span>
                        </div>
                        <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
                          {message.name && (
                            <p className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {message.name}
                              {message.email && (
                                <a href={`mailto:${message.email}`} className="text-blue-600 dark:text-blue-300 hover:text-blue-500">
                                  ({message.email})
                                </a>
                              )}
                            </p>
                          )}
                          {!message.name && message.subject === 'anonymous' && (
                            <p className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {t.messagesPage.anonymous}
                            </p>
                          )}
                          {message.phone && (
                            <p className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              {message.phone}
                            </p>
                          )}
                          <p className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {new Date(message.createdAt).toLocaleDateString(language === "no" ? "no-NO" : "en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {message.status !== 'responded' && (
                          <Button
                            onClick={() => updateStatusMutation.mutate({ id: message.id, status: 'responded' })}
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            {t.messagesPage.responded}
                          </Button>
                        )}
                        {message.status !== 'archived' && (
                          <Button
                            onClick={() => updateStatusMutation.mutate({ id: message.id, status: 'archived' })}
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                          >
                            <Archive className="h-4 w-4 mr-1" />
                            {t.messagesPage.archive}
                          </Button>
                        )}
                        {message.status === 'archived' && (
                          <Button
                            onClick={() => updateStatusMutation.mutate({ id: message.id, status: 'new' })}
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                          >
                            {t.messagesPage.restore}
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/70"
                              disabled={deleteMutation.isPending}
                              aria-label={t.messagesPage.deleteMessage}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t.messagesPage.deleteMessage2}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {language === "no"
                                  ? "Dette sletter henvendelsen permanent fra meldingslisten."
                                  : "This permanently deletes the inquiry from the message list."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t.messagesPage.cancel}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(message.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t.messagesPage.delete}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div
                      className={`mt-3 ${expandedMessage === message.id ? '' : 'line-clamp-2'}`}
                    >
                      <p className="text-sm text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-950 p-3 rounded">
                        {message.message}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedMessage(expandedMessage === message.id ? null : message.id)}
                      className="mt-2 text-xs"
                    >
                      {expandedMessage === message.id
                        ? t.messagesPage.showLess
                        : t.messagesPage.showMore}
                    </Button>

                    {message.respondedAt && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 italic">
                        {t.messagesPage.responded}{" "}
                        {new Date(message.respondedAt).toLocaleDateString(language === "no" ? "no-NO" : "en-US")}
                        {message.respondedBy && ` ${t.messagesPage.by} ${message.respondedBy}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
