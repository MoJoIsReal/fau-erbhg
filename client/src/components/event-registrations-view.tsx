import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Mail, Phone, MessageSquare, Calendar, Download, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { exportAttendeesToExcel } from "@/lib/excel-export";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Event, EventRegistration } from "@shared/schema";

interface EventRegistrationsViewProps {
  event: Event;
}

export default function EventRegistrationsView({ event }: EventRegistrationsViewProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: registrations = [], isLoading } = useQuery<EventRegistration[]>({
    queryKey: [`/api/registrations?eventId=${event.id}`],
  });

  const deleteRegistrationMutation = useMutation({
    mutationFn: (registrationId: number) => 
      apiRequest("DELETE", `/api/secure-registrations/${registrationId}`),
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
        title: language === 'no' ? "Påmelding slettet" : "Registration deleted",
        description: language === 'no' ? "Påmeldingen har blitt slettet." : "The registration has been deleted.",
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
        title: language === 'no' ? "Feil ved sletting" : "Delete error",
        description: language === 'no' ? "Kunne ikke slette påmeldingen. Prøv igjen senere." : "Could not delete the registration. Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleExportExcel = () => {
    exportAttendeesToExcel(event, registrations, language);
  };

  const handleDeleteRegistration = (registrationId: number, registrationName: string) => {
    if (confirm(language === 'no' 
      ? `Er du sikker på at du vil slette påmeldingen for ${registrationName}?`
      : `Are you sure you want to delete the registration for ${registrationName}?`
    )) {
      deleteRegistrationMutation.mutate(registrationId);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-neutral-600">
            {language === 'no' ? 'Laster påmeldinger...' : 'Loading registrations...'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalAttendees = registrations.reduce((sum, reg) => sum + (reg.attendeeCount || 1), 0);

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
              <p className="text-sm text-neutral-600">{language === 'no' ? 'Dato' : 'Date'}</p>
              <p className="font-medium">{formatDate(event.date, language)}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600">{language === 'no' ? 'Tid' : 'Time'}</p>
              <p className="font-medium">{event.time}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600">{language === 'no' ? 'Påmeldte' : 'Registered'}</p>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{totalAttendees}</span>
                </Badge>
                {event.maxAttendees && (
                  <span className="text-sm text-neutral-600">
                    / {event.maxAttendees} {language === 'no' ? 'maks' : 'max'}
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
              {language === 'no' ? 'Påmeldingsliste' : 'Registration List'} ({registrations.length})
            </CardTitle>
            {registrations.length > 0 && (
              <Button 
                onClick={handleExportExcel}
                variant="outline" 
                size="sm"
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>{language === 'no' ? 'Last ned Excel' : 'Download Excel'}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <div className="text-center py-8 text-neutral-600">
              <Users className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
              <p>{language === 'no' ? 'Ingen påmeldinger ennå' : 'No registrations yet'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {registrations.map((registration, index) => (
                <div key={registration.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-neutral-900">{registration.name}</h4>
                      <Badge variant="outline" className="mt-1">
                        {registration.attendeeCount || 1} {language === 'no' ? 'personer' : 'people'}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-neutral-500">#{index + 1}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRegistration(registration.id, registration.name)}
                        disabled={deleteRegistrationMutation.isPending}
                        className="border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm">
                        <Mail className="h-4 w-4 text-neutral-500" />
                        <a href={`mailto:${registration.email}`} className="text-primary hover:underline">
                          {registration.email}
                        </a>
                      </div>
                      {registration.phone && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="h-4 w-4 text-neutral-500" />
                          <a href={`tel:${registration.phone}`} className="text-primary hover:underline">
                            {registration.phone}
                          </a>
                        </div>
                      )}
                    </div>
                    
                    {registration.comments && (
                      <div className="space-y-2">
                        <div className="flex items-start space-x-2 text-sm">
                          <MessageSquare className="h-4 w-4 text-neutral-500 mt-0.5" />
                          <div>
                            <p className="text-neutral-600 text-xs mb-1">
                              {language === 'no' ? 'Kommentar:' : 'Comment:'}
                            </p>
                            <p className="text-neutral-900">{registration.comments}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}