import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar, 
  Clock, 
  Users, 
  UserPlus, 
  Heart, 
  Plus,
  List,
  Grid,
  Trash2,
  AlertTriangle,
  MapPin
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/i18n";
import type { Event } from "@shared/schema";
import EventRegistrationModal from "@/components/event-registration-modal";
import EventCreationModal from "@/components/event-creation-modal";
import EventRegistrationsModal from "@/components/event-registrations-modal";
import CalendarView from "@/components/calendar-view";
import LocationMapLink from "@/components/location-map-link";
import AttendeeTooltip from "@/components/attendee-tooltip";

export default function Events() {
  const { language, t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedEventForRegistrations, setSelectedEventForRegistrations] = useState<Event | null>(null);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isRegistrationsModalOpen, setIsRegistrationsModalOpen] = useState(false);
  const [isCreationModalOpen, setIsCreationModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["/api/events"]
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/secure-events?id=${id}`),
    onSuccess: () => {
      toast({
        title: language === 'no' ? "Arrangement slettet" : "Event deleted",
        description: language === 'no' ? "Arrangementet har blitt slettet." : "The event has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-events"] });
    },
    onError: () => {
      toast({
        title: language === 'no' ? "Kunne ikke slette" : "Could not delete",
        description: language === 'no' ? "Arrangementet kunne ikke slettes. Det kan være at det har påmeldinger." : "Could not delete the event. It may have registrations.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/secure-events?id=${id}&action=cancel`),
    onSuccess: () => {
      toast({
        title: language === 'no' ? "Arrangement avlyst" : "Event cancelled",
        description: language === 'no' ? "Arrangementet har blitt avlyst og e-poster er sendt til alle påmeldte." : "The event has been cancelled and emails have been sent to all attendees.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-events"] });
    },
    onError: () => {
      toast({
        title: language === 'no' ? "Feil ved avlysning" : "Cancellation error",
        description: language === 'no' ? "Kunne ikke avlyse arrangementet. Prøv igjen senere." : "Could not cancel the event. Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleRegisterClick = (event: Event) => {
    if (event.status === 'cancelled') {
      toast({
        title: language === 'no' ? "Arrangementet er avlyst" : "Event is cancelled",
        description: language === 'no' ? "Du kan ikke melde deg på et avlyst arrangement." : "You cannot register for a cancelled event.",
        variant: "destructive",
      });
      return;
    }
    setSelectedEvent(event);
    setIsRegistrationModalOpen(true);
  };

  const handleCalendarEventClick = (event: Event) => {
    if (event.status === 'cancelled') {
      toast({
        title: language === 'no' ? "Arrangementet er avlyst" : "Event is cancelled",
        description: language === 'no' ? "Dette arrangementet er avlyst og påmelding er ikke mulig." : "This event is cancelled and registration is not available.",
        variant: "destructive",
      });
      return;
    }
    handleRegisterClick(event);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "meeting":
        return Calendar;
      case "event":
        return Heart;
      case "dugnad":
        return Users;
      default:
        return Calendar;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "meeting":
        return "bg-primary/20 text-primary";
      case "event":
        return "bg-secondary/20 text-secondary";
      case "dugnad":
        return "bg-accent/20 text-accent";
      default:
        return "bg-primary/20 text-primary";
    }
  };

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const currentEvents = sortedEvents.filter(event => new Date(event.date) >= today);
  const pastEvents = sortedEvents.filter(event => new Date(event.date) < today).reverse();

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-neutral-200 rounded mb-4"></div>
              <div className="h-4 bg-neutral-200 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-heading font-bold text-3xl text-neutral-900 mb-2">{t.events.title}</h2>
          <p className="text-neutral-600">{t.events.subtitle}</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          {/* View Toggle */}
          <div className="flex rounded-lg border border-neutral-200 p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="flex items-center space-x-2"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">{language === 'no' ? 'Liste' : 'List'}</span>
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              className="flex items-center space-x-2"
            >
              <Grid className="h-4 w-4" />
              <span className="hidden sm:inline">{language === 'no' ? 'Kalender' : 'Calendar'}</span>
            </Button>
          </div>
          
          {isAuthenticated && (
            <Button 
              onClick={() => setIsCreationModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t.events.addEvent}
            </Button>
          )}
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'calendar' ? (
        <CalendarView 
          events={events} 
          onEventClick={handleCalendarEventClick}
        />
      ) : (
        <div className="space-y-6">
          {events.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="font-semibold text-lg text-neutral-900 mb-2">{t.events.noEvents}</h3>
                <p className="text-neutral-600">{t.events.noEventsDesc}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current Events */}
              {currentEvents.map((event) => {
                const IconComponent = getEventIcon(event.type);
                const colorClass = getEventColor(event.type);
                
                return (
                  <Card key={event.id} className="overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 ${colorClass}`}>
                              <IconComponent className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="font-heading font-semibold text-xl text-neutral-900">{event.title}</h3>
                              <div className="flex items-center text-neutral-600 text-sm mt-1">
                                <Clock className="h-4 w-4 mr-2" />
                                <span>{new Date(event.date).toLocaleDateString('no-NO', { 
                                  day: 'numeric', 
                                  month: 'long', 
                                  year: 'numeric' 
                                })}, kl. {event.time}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mb-4">
                            <div className="flex items-center text-neutral-600 text-sm mb-2">
                              <LocationMapLink 
                                location={event.location}
                                customLocation={event.customLocation || undefined}
                                variant="ghost"
                                size="sm"
                              />
                            </div>
                            <p className="text-neutral-700">{event.description}</p>
                          </div>

                          <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center text-accent">
                              <Users className="h-4 w-4 mr-1" />
                              <span>{(event.currentAttendees || 0)} {t.events.attendees}</span>
                            </div>
                            {event.maxAttendees && (
                              <div className="flex items-center text-neutral-500">
                                <span>{t.events.maxAttendees}: {event.maxAttendees}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col space-y-3 mt-6 md:mt-0 md:ml-6">
                          {event.status === "cancelled" ? (
                            <div className="flex items-center text-red-600 text-sm font-medium bg-red-50 px-3 py-2 rounded-lg">
                              <AlertTriangle className="h-4 w-4 mr-2" />
                              <span>{language === 'no' ? 'Arrangementet er avlyst' : 'Event is cancelled'}</span>
                            </div>
                          ) : event.type === "dugnad" ? (
                            <Button 
                              onClick={() => handleRegisterClick(event)}
                              className="bg-primary hover:bg-primary/90 text-white"
                            >
                              <Heart className="h-4 w-4 mr-2" />
                              {language === 'no' ? 'Meld deg som frivillig' : 'Volunteer'}
                            </Button>
                          ) : (
                            <Button 
                              onClick={() => handleRegisterClick(event)}
                              className="bg-primary hover:bg-primary/90 text-white"
                              disabled={event.maxAttendees && event.currentAttendees ? event.currentAttendees >= event.maxAttendees : false}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              {event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees 
                                ? t.events.full 
                                : t.events.register
                              }
                            </Button>
                          )}
                          
                          {isAuthenticated && (
                            <>
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedEventForRegistrations(event);
                                  setIsRegistrationsModalOpen(true);
                                }}
                                className="flex items-center space-x-2"
                              >
                                <Users className="h-4 w-4" />
                                <span>{language === 'no' ? 'Se påmeldinger' : 'View registrations'}</span>
                              </Button>
                              
                              {event.status === "cancelled" ? (
                                <div className="flex items-center text-red-600 text-sm font-medium">
                                  <AlertTriangle className="h-4 w-4 mr-1" />
                                  <span>{language === 'no' ? 'AVLYST' : 'CANCELLED'}</span>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  {(event.currentAttendees || 0) > 0 ? (
                                    <Button 
                                      variant="outline"
                                      size="sm"
                                      onClick={() => cancelMutation.mutate(event.id)}
                                      className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                    >
                                      <AlertTriangle className="h-4 w-4 mr-1" />
                                      <span>{language === 'no' ? 'Avlys' : 'Cancel'}</span>
                                    </Button>
                                  ) : (
                                    <Button 
                                      variant="outline"
                                      size="sm"
                                      onClick={() => deleteMutation.mutate(event.id)}
                                      className="border-red-500 text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      <span>{language === 'no' ? 'Slett' : 'Delete'}</span>
                                    </Button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Past Events Section */}
              {pastEvents.length > 0 && (
                <div className="mt-12">
                  <h2 className="text-2xl font-bold text-neutral-900 mb-6">
                    {language === 'no' ? 'Tidligere arrangementer' : 'Past Events'}
                  </h2>
                  <div className="space-y-4">
                    {pastEvents.map((event) => {
                      const IconComponent = getEventIcon(event.type);
                      return (
                        <Card key={event.id} className="opacity-75 border-neutral-200">
                          <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-start gap-4">
                              <div className="flex-1">
                                <div className="flex items-start space-x-3 mb-3">
                                  <div className={`p-2 rounded-full ${getEventColor(event.type)}`}>
                                    <IconComponent className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-neutral-700">{event.title}</h3>
                                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500 mt-1">
                                      <div className="flex items-center">
                                        <Calendar className="h-4 w-4 mr-1" />
                                        <span>{formatDate(event.date, language)}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <Clock className="h-4 w-4 mr-1" />
                                        <span>{event.time}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <MapPin className="h-4 w-4 mr-1" />
                                        <span>{event.location}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-neutral-600 text-sm">{event.description}</p>
                              </div>
                              
                              <div className="flex items-center space-x-4 text-sm">
                                <div className="flex items-center text-neutral-500">
                                  <Users className="h-4 w-4 mr-1" />
                                  <span>{(event.currentAttendees || 0)} {language === 'no' ? 'deltok' : 'attended'}</span>
                                </div>
                                {isAuthenticated && (event.currentAttendees || 0) > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedEventForRegistrations(event);
                                      setIsRegistrationsModalOpen(true);
                                    }}
                                    className="flex items-center space-x-2 text-neutral-500 border-neutral-300"
                                  >
                                    <Users className="h-4 w-4" />
                                    <span>{language === 'no' ? 'Se deltakere' : 'View attendees'}</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Registration Modal */}
      <EventRegistrationModal
        event={selectedEvent}
        isOpen={isRegistrationModalOpen}
        onClose={() => {
          setIsRegistrationModalOpen(false);
          setSelectedEvent(null);
        }}
      />

      {/* Event Creation Modal */}
      <EventCreationModal
        isOpen={isCreationModalOpen}
        onClose={() => setIsCreationModalOpen(false)}
      />

      {/* Event Registrations Modal */}
      <EventRegistrationsModal
        event={selectedEventForRegistrations}
        isOpen={isRegistrationsModalOpen}
        onClose={() => {
          setIsRegistrationsModalOpen(false);
          setSelectedEventForRegistrations(null);
        }}
      />
    </div>
  );
}