import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { TimeInput24h } from "./time-input-24h";
import type { Event } from "@shared/schema";

interface EventEditModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EventEditModal({ event, isOpen, onClose }: EventEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();

  const formSchema = z.object({
    title: z.string().min(1, t.common.required),
    description: z.string().min(1, t.common.required),
    date: z.string().min(1, t.common.required),
    time: z.string().min(1, t.common.required),
    location: z.string().min(1, t.common.required),
    customLocation: z.string().optional(),
    maxAttendees: z.number().min(1).optional()
  });

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: event ? {
      title: event.title || "",
      description: event.description || "",
      date: event.date || "",
      time: event.time || "",
      location: event.location || "",
      customLocation: event.customLocation || "",
      maxAttendees: event.maxAttendees || undefined
    } : {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      customLocation: "",
      maxAttendees: undefined
    }
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      if (!event) throw new Error("No event to update");
      
      const payload = {
        title: data.title,
        description: data.description,
        date: data.date,
        time: data.time,
        location: data.location,
        customLocation: data.customLocation,
        maxAttendees: data.maxAttendees
      };
      
      return apiRequest("PUT", `/api/secure-events?id=${event.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: language === 'no' ? "Arrangement oppdatert" : "Event updated",
        description: language === 'no' ? "Arrangementet har blitt oppdatert." : "The event has been updated.",
      });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: language === 'no' ? "Feil" : "Error",
        description: error.message || (language === 'no' ? "Kunne ikke oppdatere arrangement" : "Could not update event"),
        variant: "destructive",
      });
    },
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
          <DialogTitle>
            {language === 'no' ? 'Rediger arrangement' : 'Edit Event'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === 'no' ? 'Tittel' : 'Title'}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === 'no' ? 'Beskrivelse' : 'Description'}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === 'no' ? 'Dato' : 'Date'}</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === 'no' ? 'Tid' : 'Time'}</FormLabel>
                    <FormControl>
                      <TimeInput24h
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === 'no' ? 'Sted' : 'Location'}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'no' ? "Velg sted" : "Select location"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Erdal barnehage">{language === 'no' ? 'Erdal barnehage' : 'Erdal Kindergarten'}</SelectItem>
                      <SelectItem value="Zoom">{language === 'no' ? 'Zoom møte' : 'Zoom meeting'}</SelectItem>
                      <SelectItem value="Annet">{language === 'no' ? 'Annet' : 'Other'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("location") === "Annet" && (
              <FormField
                control={form.control}
                name="customLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === 'no' ? 'Spesifiser sted' : 'Specify location'}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={language === 'no' ? "Skriv inn sted..." : "Enter location..."} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="maxAttendees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{language === 'no' ? 'Maks deltakere (valgfritt)' : 'Max attendees (optional)'}</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1"
                      {...field} 
                      value={field.value || ""} 
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />



            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                {language === 'no' ? 'Avbryt' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending 
                  ? (language === 'no' ? 'Oppdaterer...' : 'Updating...') 
                  : (language === 'no' ? 'Oppdater arrangement' : 'Update Event')
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}