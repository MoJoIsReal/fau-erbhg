import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Users, Mail, Phone, MessageSquare, Calendar, Camera, Clock, Download, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { exportAttendeesToExcel } from "@/lib/excel-export";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Event, EventRegistration } from "@shared/schema";
import { resolvePhotoSlotsForRegistration } from "@shared/photo-slots";

interface EventRegistrationsViewProps {
  event: Event;
}

export default function EventRegistrationsView({ event }: EventRegistrationsViewProps) {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registrations = [], isLoading } = useQuery<EventRegistration[]>({
    queryKey: [`/api/registrations?eventId=${event.id}`],
  });

  const deleteRegistrationMutation = useMutation({
    mutationFn: (registrationId: number) =>
      apiRequest("DELETE", `/api/registrations?id=${registrationId}`),
    onMutate: async (registrationId: number) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [`/api/registrations?eventId=${event.id}`] });
      
      // Snapshot the previous value
      const previousRegistrations = queryClient.getQueryData([`/api/registrations?eventId=${event.id}`]);
      
      // Optimistically update to new value
      queryClient.setQueryData([`/api/registrations?eventId=${event.id}`], (old: EventRegistration[] | undefined) => {
        return old?.filter(reg => reg.id !== registrationId) || [];
      });
      
      // Update events list attendee count
      queryClient.setQueryData(["/api/events"], (oldEvents: any) => {
        if (!oldEvents) return oldEvents;
        return oldEvents.map((evt: any) => {
          if (evt.id === event.id) {
            const deletedReg = registrations.find(r => r.id === registrationId);
            const attendeeReduction = deletedReg?.attendeeCount || 1;
            return {
              ...evt,
              currentAttendees: Math.max(0, (evt.currentAttendees || 0) - attendeeReduction)
            };
          }
          return evt;
        });
      });
      
      return { previousRegistrations };
    },
    onSuccess: () => {
      toast({
        title: t.events.registrationDeleted,
        description: t.events.registrationHasBeenDeleted,
      });
      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: [`/api/registrations?eventId=${event.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (err, registrationId, context) => {
      // Rollback on error
      if (context?.previousRegistrations) {
        queryClient.setQueryData([`/api/registrations?eventId=${event.id}`], context.previousRegistrations);
      }
      toast({
        title: t.events.deleteError,
        description: t.events.couldNotDeleteRegistration,
        variant: "destructive",
      });
    },
  });

  const handleExportExcel = () => {
    exportAttendeesToExcel(event, registrations, language);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-neutral-600 dark:text-neutral-300">
            {t.events.loadingRegistrations}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalAttendees = registrations.reduce((sum, reg) => sum + (reg.attendeeCount || 1), 0);
  const isFotoEvent = event.type === 'foto';

  // Resolve photo slots for a registration — prefers stored slots, falls back to legacy replay.
  const getPhotoSlots = (registrationIndex: number): string[] => {
    if (!isFotoEvent) return [];
    const reg = registrations[registrationIndex];
    return resolvePhotoSlotsForRegistration(
      { time: event.time },
      {
        id: reg.id,
        attendeeCount: reg.attendeeCount,
        childrenNames: reg.childrenNames,
        photoSlots: reg.photoSlots,
      },
      registrations.map(r => ({
        id: r.id,
        attendeeCount: r.attendeeCount,
        childrenNames: r.childrenNames,
        photoSlots: r.photoSlots,
      })),
    );
  };

  return (
    <div className="space-y-6">
      {/* Event Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>{event.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.events.date}</p>
              <p className="font-medium">{formatDate(event.date, language)}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.events.time}</p>
              <p className="font-medium">{event.time}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t.events.registered}</p>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{totalAttendees}</span>
                </Badge>
                {event.maxAttendees && (
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    / {event.maxAttendees} {t.events.maxAttendees}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registrations List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {t.events.registrationList} ({registrations.length})
            </CardTitle>
            {registrations.length > 0 && (
              <Button 
                onClick={handleExportExcel}
                variant="outline" 
                size="sm"
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>{t.events.downloadExcel}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="text-center py-8 text-neutral-600 dark:text-neutral-300">
              <Users className="h-12 w-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-600" />
              <p>{t.events.noRegistrationsYet}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {registrations.map((registration, index) => {
                const childrenNames: string[] = registration.childrenNames
                  ? (() => { try { return JSON.parse(registration.childrenNames); } catch { return []; } })()
                  : [];
                const photoSlots = getPhotoSlots(index);

                return (
                <div key={registration.id} className="border dark:border-neutral-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-50">{registration.name}</h4>
                      <Badge variant="outline" className="mt-1">
                        {isFotoEvent
                          ? `${registration.attendeeCount || 1} ${t.events.children}`
                          : `${registration.attendeeCount || 1} ${t.events.people}`
                        }
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">#{index + 1}</span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deleteRegistrationMutation.isPending}
                            className="border-red-500 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                            aria-label={t.events.deleteRegistration}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t.events.deleteRegistration2}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {language === 'no'
                                ? `Er du sikker på at du vil slette påmeldingen for ${registration.name}?`
                                : `Are you sure you want to delete the registration for ${registration.name}?`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t.events.cancel}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => deleteRegistrationMutation.mutate(registration.id)}
                            >
                              {t.events.delete}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Photo event: show children names and their time slots */}
                  {isFotoEvent && childrenNames.length > 0 && (
                    <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Camera className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-200">
                          {t.events.childrenTimeSlots}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {childrenNames.map((childName: string, i: number) => (
                          <div key={i} className="flex items-center space-x-2 text-sm">
                            <Clock className="h-3 w-3 text-purple-500" />
                            <span className="text-neutral-900 dark:text-neutral-50">{childName}</span>
                            <span className="text-purple-600 dark:text-purple-200 font-medium">
                              {photoSlots[i] || '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm">
                        <Mail className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                        <a href={`mailto:${registration.email}`} className="text-primary hover:underline">
                          {registration.email}
                        </a>
                      </div>
                      {registration.phone && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                          <a href={`tel:${registration.phone}`} className="text-primary hover:underline">
                            {registration.phone}
                          </a>
                        </div>
                      )}
                    </div>

                    {registration.comments && (
                      <div className="space-y-2">
                        <div className="flex items-start space-x-2 text-sm">
                          <MessageSquare className="h-4 w-4 text-neutral-500 dark:text-neutral-400 mt-0.5" />
                          <div>
                            <p className="text-neutral-600 dark:text-neutral-400 text-xs mb-1">
                              {t.events.comment}
                            </p>
                            <p className="text-neutral-900 dark:text-neutral-50">{registration.comments}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
