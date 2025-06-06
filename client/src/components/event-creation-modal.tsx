import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TimeInput24h } from "@/components/time-input-24h";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertEventSchema } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateAddress } from "@/lib/location-utils";
import { z } from "zod";

const formSchema = insertEventSchema.extend({
  maxAttendees: z.number().min(1).optional().nullable(),
  customLocation: z.string().optional().refine(
    (val) => {
      // Only validate if location is "Annet" and customLocation is provided
      return !val || validateAddress(val);
    },
    {
      message: "Vennligst oppgi en gyldig adresse (minimum 5 tegn, kun bokstaver, tall og standard tegn)"
    }
  )
});

type FormData = z.infer<typeof formSchema>;

interface EventCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EventCreationModal({ isOpen, onClose }: EventCreationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      type: "meeting",
      maxAttendees: null,
      customLocation: ""
    }
  });

  const selectedLocation = useWatch({
    control: form.control,
    name: "location"
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      // Include customLocation in the data if location is "Annet"
      const eventData = {
        ...data,
        customLocation: data.location === "Annet" ? data.customLocation : null
      };
      return apiRequest("POST", "/api/events", eventData);
    },
    onSuccess: () => {
      toast({
        title: "Arrangement opprettet!",
        description: "Det nye arrangementet er nå tilgjengelig for påmelding.",
      });
      form.reset();
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: any) => {
      toast({
        title: "Feil ved opprettelse",
        description: error.message || "Kunne ikke opprette arrangementet. Prøv igjen senere.",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Opprett nytt arrangement</DialogTitle>
          <DialogDescription>
            Fyll ut skjemaet for å opprette et nytt arrangement eller møte.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tittel</FormLabel>
                  <FormControl>
                    <Input placeholder="Navn på arrangementet" {...field} />
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
                  <FormLabel>Beskrivelse</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Beskriv arrangementet..."
                      rows={3}
                      {...field}
                      value={field.value || ""}
                    />
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
                    <FormLabel>Dato</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                    <FormLabel>Tid</FormLabel>
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
                  <FormLabel>Sted</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg sted" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Småbarnsfløyen">Småbarnsfløyen</SelectItem>
                      <SelectItem value="Storbarnsfløyen">Storbarnsfløyen</SelectItem>
                      <SelectItem value="Møterom">Møterom</SelectItem>
                      <SelectItem value="Ute">Ute</SelectItem>
                      <SelectItem value="Digitalt">Digitalt</SelectItem>
                      <SelectItem value="Annet">Annet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedLocation === "Annet" && (
              <FormField
                control={form.control}
                name="customLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spesifiser sted</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Skriv inn adresse eller stedbeskrivelse"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Velg type arrangement" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="meeting">Møte</SelectItem>
                      <SelectItem value="event">Arrangement</SelectItem>
                      <SelectItem value="volunteer">Dugnad</SelectItem>
                      <SelectItem value="internal">Internt</SelectItem>
                      <SelectItem value="other">Annet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxAttendees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maks antall deltakere (valgfritt)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      placeholder="La stå tom for ubegrenset"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Oppretter..." : "Opprett arrangement"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}