import { useForm, useWatch } from "react-hook-form";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeInput24h } from "@/components/time-input-24h";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertEventSchema, type Event } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateAddress } from "@/lib/location-utils";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { enGB, nb } from "date-fns/locale";
import { z } from "zod";
import RichTextEditor from "@/components/RichTextEditor";

const formSchema = insertEventSchema.extend({
  maxAttendees: z.number().min(1).optional().nullable(),
  registrationDeadline: z.string().optional().nullable(),
  customLocation: z.string().optional().refine(
    (val) => {
      return !val || validateAddress(val);
    },
    {
      message: "Vennligst oppgi en gyldig adresse (minimum 5 tegn, kun bokstaver, tall og standard tegn)"
    }
  ),
  vigiloSignup: z.boolean().default(false),
  noSignup: z.boolean().default(false)
});

type FormData = z.infer<typeof formSchema>;

function toDateTimeLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDateValue(value?: string | null) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value?: string | null, language: "no" | "en" = "no") {
  const date = parseDateValue(value);
  if (!date) return "";
  return date.toLocaleDateString(language === "no" ? "nb-NO" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function splitDateTimeLocal(value?: string | null) {
  if (!value) return { date: "", time: "" };
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

interface DatePickerInputProps {
  value?: string | null;
  onChange: (value: string) => void;
  language: "no" | "en";
  placeholder: string;
}

function DatePickerInput({ value, onChange, language, placeholder }: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-start px-3 text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? formatDisplayDate(value, language) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDateValue(date));
            setOpen(false);
          }}
          weekStartsOn={1}
          locale={language === "no" ? nb : enGB}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateTimePicker24hProps {
  value?: string | null;
  onChange: (value: string) => void;
  onBlur?: () => void;
  language: "no" | "en";
}

function DateTimePicker24h({ value, onChange, onBlur, language }: DateTimePicker24hProps) {
  const { date, time } = splitDateTimeLocal(value);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
        <DatePickerInput
          value={date}
          onChange={(nextDate) => onChange(`${nextDate}T${time || "23:59"}`)}
          language={language}
          placeholder={language === "no" ? "Velg dato" : "Select date"}
        />
        <TimeInput24h
          value={time}
          onChange={(nextTime) => {
            if (!date) return;
            onChange(`${date}T${nextTime}`);
          }}
          onBlur={onBlur}
          disabled={!date}
        />
      </div>
      {value && (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange("")}>
          {language === "no" ? "Fjern frist" : "Clear deadline"}
        </Button>
      )}
    </div>
  );
}

interface EventCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: Event | null;
}

export default function EventCreationModal({ isOpen, onClose, event }: EventCreationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: event ? {
      title: event.title || "",
      description: event.description || "",
      date: event.date || "",
      time: event.time || "",
      location: event.location || "",
      type: event.type || "meeting",
      maxAttendees: event.maxAttendees || null,
      registrationDeadline: toDateTimeLocalInputValue(event.registrationDeadline),
      customLocation: event.customLocation || "",
      vigiloSignup: event.vigiloSignup || false,
      noSignup: event.noSignup || false
    } : {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      type: "meeting",
      maxAttendees: null,
      registrationDeadline: "",
      customLocation: "",
      vigiloSignup: false,
      noSignup: false
    }
  });

  useEffect(() => {
    if (event) {
      form.reset({
        title: event.title || "",
        description: event.description || "",
        date: event.date || "",
        time: event.time || "",
        location: event.location || "",
        type: event.type || "meeting",
        maxAttendees: event.maxAttendees || null,
        registrationDeadline: toDateTimeLocalInputValue(event.registrationDeadline),
        customLocation: event.customLocation || "",
        vigiloSignup: event.vigiloSignup || false,
        noSignup: event.noSignup || false
      });
    } else {
      form.reset({
        title: "",
        description: "",
        date: "",
        time: "",
        location: "",
        type: "meeting",
        maxAttendees: null,
        registrationDeadline: "",
        customLocation: "",
        vigiloSignup: false,
        noSignup: false
      });
    }
  }, [event, form]);

  const selectedLocation = useWatch({
    control: form.control,
    name: "location"
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const eventData = {
        ...data,
        registrationDeadline: toIsoDateTime(data.registrationDeadline),
        customLocation: data.location === "Annet" ? data.customLocation : null
      };

      if (event) {
        return apiRequest("PUT", `/api/events?id=${event.id}`, eventData);
      } else {
        return apiRequest("POST", "/api/events", eventData);
      }
    },
    onSuccess: () => {
      toast({
        title: event ? "Arrangement oppdatert!" : "Arrangement opprettet!",
        description: event
          ? "Arrangementet har blitt oppdatert."
          : "Det nye arrangementet er nå tilgjengelig for påmelding.",
      });
      form.reset();
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: any) => {
      toast({
        title: event ? "Feil ved oppdatering" : "Feil ved opprettelse",
        description: error.message || (event ? "Kunne ikke oppdatere arrangementet. Prøv igjen senere." : "Kunne ikke opprette arrangementet. Prøv igjen senere."),
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/*
       * Mobile: full-screen (top-0 left-0, no translate, rounded-none, h-dvh)
       * Desktop (sm+): centered modal (translate-x/y -50%, max-w-[560px], max-h-[90dvh])
       * flex flex-col + gap-0 overrides the base "grid gap-4 p-6"
       */}
      <DialogContent className="flex flex-col gap-0 p-0 top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none h-dvh max-h-dvh rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-[560px] sm:h-auto sm:max-h-[90dvh] sm:rounded-lg">

        {/* ── Sticky header ── */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 pr-12 border-b border-border sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle className="text-base font-semibold leading-snug sm:text-lg">
            {event ? (t.modals.eventEdit?.title || "Rediger arrangement") : t.modals.eventCreation.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {event ? (t.modals.eventEdit?.description || "Oppdater arrangementets detaljer") : t.modals.eventCreation.description}
          </DialogDescription>
        </div>

        {/* ── Scrollable form body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <Form {...form}>
            <form id="event-form" onSubmit={form.handleSubmit(onSubmit)} className="px-4 py-4 space-y-4 sm:px-6">

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.modals.eventCreation.titleLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.modals.eventCreation.titlePlaceholder} {...field} />
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
                    <FormLabel>{t.modals.eventCreation.descriptionLabel}</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        content={field.value || ""}
                        onChange={field.onChange}
                        placeholder={t.modals.eventCreation.descriptionPlaceholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.modals.eventCreation.dateLabel}</FormLabel>
                      <FormControl>
                        <DatePickerInput
                          value={field.value}
                          onChange={field.onChange}
                          language={language}
                          placeholder={language === "no" ? "Velg dato" : "Select date"}
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
                      <FormLabel>{t.modals.eventCreation.timeLabel}</FormLabel>
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
                    <FormLabel>{t.modals.eventCreation.locationLabel}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t.modals.eventCreation.locationPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Småbarnsfløyen">Småbarnsfløyen</SelectItem>
                        <SelectItem value="Storbarnsfløyen">Storbarnsfløyen</SelectItem>
                        <SelectItem value="Møterom">Møterom</SelectItem>
                        <SelectItem value="Ute">Ute</SelectItem>
                        <SelectItem value="Digitalt">{t.modals.eventCreation.locations.digitalt}</SelectItem>
                        <SelectItem value="Annet">{t.modals.eventCreation.locations.annet}</SelectItem>
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
                      <FormLabel>{t.modals.eventCreation.customLocationLabel}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t.modals.eventCreation.customLocationPlaceholder}
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
                    <FormLabel>{t.modals.eventCreation.typeLabel}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Velg type arrangement" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="meeting">{t.modals.eventCreation.types.meeting}</SelectItem>
                        <SelectItem value="event">{t.modals.eventCreation.types.event}</SelectItem>
                        <SelectItem value="dugnad">{t.modals.eventCreation.types.dugnad}</SelectItem>
                        <SelectItem value="foto">{t.modals.eventCreation.types.foto}</SelectItem>
                        <SelectItem value="internal">{t.modals.eventCreation.types.internal}</SelectItem>
                        <SelectItem value="annet">{t.modals.eventCreation.types.annet}</SelectItem>
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
                    <FormLabel>{t.modals.eventCreation.maxAttendeesLabel}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t.modals.eventCreation.maxAttendeesPlaceholder}
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="registrationDeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.modals.eventCreation.registrationDeadlineLabel}</FormLabel>
                    <FormControl>
                      <DateTimePicker24h
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        language={language}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      {t.modals.eventCreation.registrationDeadlineHint}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vigiloSignup"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        {language === 'no' ? 'Vigilo Påmelding' : 'Vigilo Signup'}
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        {language === 'no'
                          ? 'Bruk Vigilo-plattformen for påmelding til dette arrangementet'
                          : 'Use Vigilo platform for event registration'
                        }
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="noSignup"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2 pb-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        {language === 'no' ? 'Ingen påmelding' : 'No signup'}
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        {language === 'no'
                          ? 'Dette arrangementet krever ikke påmelding'
                          : 'This event does not require registration'
                        }
                      </p>
                    </div>
                  </FormItem>
                )}
              />

            </form>
          </Form>
        </div>

        {/* ── Sticky footer with action buttons ── */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-border sm:px-6 sm:pt-4 sm:pb-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose}>
              {t.modals.eventCreation.cancel}
            </Button>
            <Button form="event-form" type="submit" className="w-full sm:w-auto" disabled={mutation.isPending}>
              {mutation.isPending
                ? (event ? "Oppdaterer..." : t.modals.eventCreation.creating)
                : (event ? "Oppdater arrangement" : t.modals.eventCreation.create)
              }
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
