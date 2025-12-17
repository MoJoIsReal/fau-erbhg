import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Mail, Clock, User, Phone, Trash2, Check, Archive, Loader2 } from "lucide-react";
import { getCookie } from "@/lib/queryClient";

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

export default function Messages() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedMessage, setExpandedMessage] = useState<number | null>(null);

  // Fetch contact messages
  const { data: messages = [], isLoading } = useQuery<ContactMessage[]>({
    queryKey: ["/api/secure-settings?resource=contact-messages"],
  });

  // Update message status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const csrfToken = getCookie("csrf-token");
      const response = await fetch(`/api/secure-settings?resource=contact-messages&id=${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!response.ok) throw new Error("Failed to update message status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=contact-messages"] });
      toast({
        title: language === "no" ? "Oppdatert!" : "Updated!",
        description: language === "no" ? "Status er oppdatert" : "Status has been updated",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke oppdatere status" : "Could not update status",
      });
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const csrfToken = getCookie("csrf-token");
      const response = await fetch(`/api/secure-settings?resource=contact-messages&id=${id}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": csrfToken || "",
        },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=contact-messages"] });
      toast({
        title: language === "no" ? "Slettet!" : "Deleted!",
        description: language === "no" ? "Meldingen ble slettet" : "Message was deleted",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke slette melding" : "Could not delete message",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500">{language === "no" ? "Ny" : "New"}</Badge>;
      case 'responded':
        return <Badge className="bg-green-500">{language === "no" ? "Besvart" : "Responded"}</Badge>;
      case 'archived':
        return <Badge variant="secondary">{language === "no" ? "Arkivert" : "Archived"}</Badge>;
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800">
          {language === "no" ? "Meldinger" : "Messages"}
        </h1>
        <p className="text-neutral-600 mt-2">
          {language === "no"
            ? "Administrer henvendelser fra kontaktskjemaet"
            : "Manage contact form submissions"}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">{language === "no" ? "Nye" : "New"}</p>
                <p className="text-2xl font-bold text-blue-600">{newMessages.length}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">{language === "no" ? "Besvart" : "Responded"}</p>
                <p className="text-2xl font-bold text-green-600">{respondedMessages.length}</p>
              </div>
              <Check className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">{language === "no" ? "Arkivert" : "Archived"}</p>
                <p className="text-2xl font-bold text-neutral-600">{archivedMessages.length}</p>
              </div>
              <Archive className="h-8 w-8 text-neutral-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Messages list */}
      <Card>
        <CardContent className="p-6">
          {messages.length === 0 ? (
            <p className="text-center text-neutral-500 py-8">
              {language === "no" ? "Ingen meldinger ennå" : "No messages yet"}
            </p>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <Card key={message.id} className={`${message.status === 'new' ? 'border-blue-300 bg-blue-50/50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(message.status)}
                          <span className="font-semibold text-neutral-900">{getSubjectLabel(message.subject)}</span>
                        </div>
                        <div className="text-sm text-neutral-600 space-y-1">
                          {message.name && (
                            <p className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {message.name}
                              {message.email && (
                                <a href={`mailto:${message.email}`} className="text-blue-600 hover:text-blue-500">
                                  ({message.email})
                                </a>
                              )}
                            </p>
                          )}
                          {!message.name && message.subject === 'anonymous' && (
                            <p className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {language === "no" ? "Anonym" : "Anonymous"}
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
                            {new Date(message.createdAt).toLocaleDateString("no-NO", {
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
                            {language === "no" ? "Besvart" : "Responded"}
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
                            {language === "no" ? "Arkiver" : "Archive"}
                          </Button>
                        )}
                        {message.status === 'archived' && (
                          <Button
                            onClick={() => updateStatusMutation.mutate({ id: message.id, status: 'new' })}
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                          >
                            {language === "no" ? "Gjenopprett" : "Restore"}
                          </Button>
                        )}
                        <Button
                          onClick={() => deleteMutation.mutate(message.id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 border-red-200"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div
                      className={`mt-3 ${expandedMessage === message.id ? '' : 'line-clamp-2'}`}
                    >
                      <p className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 rounded">
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
                        ? language === "no" ? "Vis mindre" : "Show less"
                        : language === "no" ? "Vis mer" : "Show more"}
                    </Button>

                    {message.respondedAt && (
                      <p className="text-xs text-neutral-500 mt-3 italic">
                        {language === "no" ? "Besvart" : "Responded"}{" "}
                        {new Date(message.respondedAt).toLocaleDateString("no-NO")}
                        {message.respondedBy && ` ${language === "no" ? "av" : "by"} ${message.respondedBy}`}
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
