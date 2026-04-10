import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertEventRegistrationSchema } from "@shared/schema";
import { PHONE_PLACEHOLDER } from "@shared/constants";
import type { Event } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { z } from "zod";

const formSchema = insertEventRegistrationSchema.omit({ eventId: true }).extend({
  attendeeCount: z.number().min(1, "Må være minst 1 deltaker").max(10, "Maksimalt 10 deltakere"),
  childrenNames: z.string().optional().nullable(),
  // Email validation removed from frontend - handled by backend database blacklist
});

type FormData = z.infer<typeof formSchema>;

interface EventRegistrationModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EventRegistrationModal({ event, isOpen, onClose }: EventRegistrationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();
  const isFotoEvent = event?.type === "foto";

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      attendeeCount: 1,
      comments: "",
      childrenNames: null,
    }
  });

  const attendeeCount = useWatch({
    control: form.control,
    name: "attendeeCount",
  });

  // For foto events, parse childrenNames as JSON array
  const childrenNamesRaw = useWatch({
    control: form.control,
    name: "childrenNames",
  });

  const getChildrenNamesArray = (): string[] => {
    try {
      if (childrenNamesRaw) return JSON.parse(childrenNamesRaw);
    } catch {}
    return [];
  };

  const setChildName = (index: number, value: string) => {
    const names = getChildrenNamesArray();
    // Ensure array is large enough
    while (names.length <= index) names.push("");
    names[index] = value;
    form.setValue("childrenNames", JSON.stringify(names));
  };

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      if (!event) throw new Error("Ingen arrangement valgt");
      return apiRequest("POST", `/api/registrations`, { ...data, eventId: event.id, language });
    },
    onSuccess: () => {
      toast({
        title: t.modals.eventRegistration.success,
        description: t.modals.eventRegistration.successDesc,
      });
      form.reset();
      onClose();
      // Refresh events to show updated attendee count
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: any) => {
      // Parse error message - remove JSON parts if present
      let rawMessage = error.message || t.modals.eventRegistration.errorDesc;

      // Extract clean error message (remove category JSON if present)
      const errorMessage = rawMessage.split('","category"')[0].replace(/^400:\s*{"error":"?/, '').replace(/"$/, '');

      // Check if it's an email validation error
      const isEmailError = errorMessage.includes('e-postadresse') ||
                          errorMessage.includes('email address') ||
                          errorMessage.includes('Mente du') ||
                          errorMessage.includes('Did you mean');

      if (isEmailError) {
        // Show inline error on email field
        form.setError('email', {
          type: 'manual',
          message: errorMessage
        });
        return; // Don't show toast
      }

      // Handle other specific errors with toast
      let toastMessage = errorMessage;

      if (errorMessage.includes("already registered")) {
        toastMessage = language === 'no'
          ? "Denne e-postadressen er allerede registrert for dette arrangementet"
          : "This email is already registered for this event";
        // Also set inline error for email
        form.setError('email', {
          type: 'manual',
          message: toastMessage
        });
        return;
      } else if (errorMessage.includes("cancelled")) {
        toastMessage = language === 'no'
          ? "Du kan ikke melde deg på et avlyst arrangement"
          : "Cannot register for cancelled event";
      } else if (errorMessage.includes("full") || errorMessage.includes("capacity")) {
        toastMessage = language === 'no'
          ? "Arrangementet er fullt"
          : "Event is full";
      }

      toast({
        title: t.modals.eventRegistration.error,
        description: toastMessage,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    // Validate children names for foto events
    if (isFotoEvent) {
      const names = getChildrenNamesArray();
      const count = data.attendeeCount || 1;
      const missingNames = [];
      for (let i = 0; i < count; i++) {
        if (!names[i] || names[i].trim() === "") {
          missingNames.push(i + 1);
        }
      }
      if (missingNames.length > 0) {
        toast({
          title: language === 'no' ? "Manglende navn" : "Missing names",
          description: language === 'no'
            ? `Vennligst oppgi fornavn på alle barn`
            : `Please provide first names for all children`,
          variant: "destructive"
        });
        return;
      }
      // Trim the array to only the needed children
      const trimmedNames = names.slice(0, count).map(n => n.trim());
      data.childrenNames = JSON.stringify(trimmedNames);
    }
    mutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col gap-0 p-0 top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none h-dvh max-h-dvh rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:h-auto sm:max-h-[90dvh] sm:rounded-lg">

        {/* Sticky header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 pr-12 border-b border-border sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle className="text-base font-semibold sm:text-lg">
            {isFotoEvent
              ? (language === 'no' ? 'Påmelding til fotografering' : 'Register for photo session')
              : 'Påmelding til arrangement'
            }
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {isFotoEvent
              ? (language === 'no'
                ? 'Oppgi antall barn som skal fotograferes og fornavn på hvert barn.'
                : 'Enter the number of children to be photographed and the first name of each child.')
              : 'Fyll ut skjemaet nedenfor for å melde deg på arrangementet.'
            }
          </DialogDescription>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 pt-3 pb-2 sm:px-6">
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <h4 className="font-medium text-neutral-900">{event.title}</h4>
              <p className="text-sm text-neutral-600">
                {new Date(event.date).toLocaleDateString('no-NO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })} kl. {event.time}
              </p>
              <p className="text-sm text-neutral-600">{event.location}</p>
            </div>
          </div>

          <Form {...form}>
            <form id="reg-form" onSubmit={form.handleSubmit(onSubmit)} className="px-4 pb-4 space-y-4 sm:px-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isFotoEvent ? (language === 'no' ? 'Navn foresatt *' : 'Parent/guardian name *') : 'Fullt navn *'}</FormLabel>
                  <FormControl>
                    <Input placeholder={isFotoEvent ? (language === 'no' ? 'Navn på foresatt' : 'Parent/guardian name') : 'Ditt navn'} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-post *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="din.epost@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefon</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder={PHONE_PLACEHOLDER} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attendeeCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isFotoEvent
                      ? (language === 'no' ? 'Antall barn' : 'Number of children')
                      : 'Antall deltakere'
                    }
                  </FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg antall" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(num => (
                        <SelectItem key={num} value={num.toString()}>
                          {isFotoEvent
                            ? `${num} ${num === 1 ? (language === 'no' ? 'barn' : 'child') : (language === 'no' ? 'barn' : 'children')}`
                            : `${num} ${num === 1 ? "person" : "personer"}`
                          }
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dynamic child name fields for foto events */}
            {isFotoEvent && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-neutral-700">
                  {language === 'no' ? 'Fornavn på barn' : 'Children\'s first names'}
                </p>
                {Array.from({ length: attendeeCount || 1 }, (_, i) => (
                  <div key={i}>
                    <Input
                      placeholder={language === 'no' ? `Barn ${i + 1} - fornavn` : `Child ${i + 1} - first name`}
                      value={getChildrenNamesArray()[i] || ""}
                      onChange={(e) => setChildName(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kommentarer</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Eventuelle allergier, spørsmål eller kommentarer..."
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {event.maxAttendees && event.currentAttendees && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Plasser igjen:</strong> {event.maxAttendees - event.currentAttendees} av {event.maxAttendees}
                </p>
              </div>
            )}

            </form>
          </Form>
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-border sm:px-6 sm:pt-4 sm:pb-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleClose}>
              Avbryt
            </Button>
            <Button
              form="reg-form"
              type="submit"
              className="w-full sm:w-auto"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Melder på..." : "Meld deg på"}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
