import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  attendeeCount: z.number().min(1, "Må være minst 1 deltaker").max(10, "Maksimalt 10 deltakere")
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
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      attendeeCount: 1,
      comments: ""
    }
  });

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
    mutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Påmelding til arrangement</DialogTitle>
          <DialogDescription>
            Fyll ut skjemaet nedenfor for å melde deg på arrangementet.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 p-4 bg-neutral-50 rounded-lg">
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fullt navn *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ditt navn" {...field} />
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
                  <FormLabel>Antall deltakere</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg antall" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(num => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} {num === 1 ? "person" : "personer"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="flex space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Avbryt
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Melder på..." : "Meld deg på"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
