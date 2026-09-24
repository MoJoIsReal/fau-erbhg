import { EditorDialog, EditorSection } from "@/components/site/editor-dialog";
import { CalendarCategory } from "@/components/site/calendar-category";
import { CALENDAR_DISPLAY_KINDS, calendarDisplayKind, calendarKindForEventType } from "@shared/calendar-entries";
import { useForm, useWatch } from "react-hook-form";
import { useEffect, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
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
      message: "invalid_address"
    }
  ),
  vigiloSignup: z.boolean().default(false),
  noSignup: z.boolean().default(false),
  notifyNewsletter: z.boolean().default(false)
});

// The three `.default(false)` fields above make zod 4 distinguish the two
// sides of the schema: on the way in those booleans are optional, on the way
// out they are always present. FormInput is what the fields bind to and what
// defaultValues must satisfy; FormData is what the resolver hands to onSubmit.
type FormInput = z.input<typeof formSchema>;
type FormData = z.output<typeof formSchema>;

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
          className={cn("min-h-11 w-full justify-start px-3 text-left font-normal", !value && "text-muted-foreground")}
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
          autoFocus
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
  const { t } = useLanguage();
  const { date, time } = splitDateTimeLocal(value);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
        <DatePickerInput
          value={date}
          onChange={(nextDate) => onChange(`${nextDate}T${time || "23:59"}`)}
          language={language}
          placeholder={t.events.selectDate}
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
        <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2" onClick={() => onChange("")}>
          {t.events.clearDeadline}
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
  const descriptionLabelId = useId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, language } = useLanguage();

  const form = useForm<FormInput, unknown, FormData>({
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
      noSignup: event.noSignup || false,
      notifyNewsletter: event.notifyNewsletter || false
    } : {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      type: "event",
      maxAttendees: null,
      registrationDeadline: "",
      customLocation: "",
      vigiloSignup: false,
      noSignup: false,
      notifyNewsletter: false
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
        noSignup: event.noSignup || false,
        notifyNewsletter: event.notifyNewsletter || false
      });
    } else {
      form.reset({
        title: "",
        description: "",
        date: "",
        time: "",
        location: "",
        type: "event",
        maxAttendees: null,
        registrationDeadline: "",
        customLocation: "",
        vigiloSignup: false,
        noSignup: false,
        notifyNewsletter: false
      });
    }
  }, [event, form, isOpen]);

  const selectedType = useWatch({ control: form.control, name: "type" });
  const noSignup = useWatch({ control: form.control, name: "noSignup" });
  const vigiloSignup = useWatch({ control: form.control, name: "vigiloSignup" });
  const registrationMode = selectedType === "internal" ? "none" : vigiloSignup ? "vigilo" : noSignup ? "none" : "website";
  const displayKind = calendarDisplayKind(calendarKindForEventType(selectedType));

  const selectedLocation = useWatch({
    control: form.control,
    name: "location"
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const eventData = {
        ...data,
        registrationDeadline: registrationMode === "website" ? toIsoDateTime(data.registrationDeadline) : null,
        maxAttendees: registrationMode === "website" ? data.maxAttendees : null,
        noSignup: registrationMode === "none",
        vigiloSignup: registrationMode === "vigilo",
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
        title: event ? t.entryEditor.updated : t.modals.eventCreation.success,
        description: t.entryEditor.eventHomepageHint,
      });
      form.reset();
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: any) => {
      toast({
        title: t.entryEditor.error,
        description: error.message || t.modals.eventCreation.errorDesc,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <EditorDialog title={event ? t.modals.eventEdit.title : t.modals.eventCreation.title}
        description={t.entryEditor.intro}
        footer={<div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>{t.modals.eventCreation.cancel}</Button>
          <Button form="event-form" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t.entryEditor.saving : event ? t.entryEditor.update : t.modals.eventCreation.create}
          </Button>
        </div>}>
        <Form {...form}>
          <form id="event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 [&_label]:text-small [&_label]:text-copy">
            <EditorSection title={t.entryEditor.content}>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.modals.eventCreation.titleLabel}</FormLabel>
                    <FormControl>
                      <Input autoFocus placeholder={t.modals.eventCreation.titlePlaceholder} {...field} />
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
                    <FormLabel id={descriptionLabelId}>{t.modals.eventCreation.descriptionLabel}</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        aria-labelledby={descriptionLabelId}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        content={field.value || ""}
                        onChange={field.onChange}
                        placeholder={t.modals.eventCreation.descriptionPlaceholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />


              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.entryEditor.category}</FormLabel>
                    <Select value={selectedType === "foto" ? "foto" : displayKind} onValueChange={(kind) => {
                      field.onChange(({ bhgdag: "activity", arrangement: "event", family: "family", info: "info", internt: "internal", foto: "foto" })[kind]);
                      if (kind === "foto") {
                        form.setValue("noSignup", false, { shouldDirty: true });
                        form.setValue("vigiloSignup", false, { shouldDirty: true });
                      }
                    }}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CALENDAR_DISPLAY_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{t.entryEditor.categories[kind]}</SelectItem>)}
                        <SelectItem value="foto">{t.modals.eventCreation.types.foto}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-col justify-end gap-2 pb-3">
                  <span className="text-micro text-subtle">{t.entryEditor.preview}</span>
                  <CalendarCategory kind={displayKind} />
                </div>
              </div>
              <p className="text-small text-subtle">{t.entryEditor.categoryHint}</p>
            </EditorSection>
            <EditorSection title={t.entryEditor.schedule}>
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
                          placeholder={t.events.selectDate}
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
                        <SelectItem value="Småbarnsfløyen">{t.entryEditor.placeSmall}</SelectItem>
                        <SelectItem value="Storbarnsfløyen">{t.entryEditor.placeLarge}</SelectItem>
                        <SelectItem value="Møterom">{t.entryEditor.placeMeeting}</SelectItem>
                        <SelectItem value="Ute">{t.entryEditor.placeOutside}</SelectItem>
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
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>{t.modals.eventCreation.customLocationLabel}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t.modals.eventCreation.customLocationPlaceholder}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {fieldState.error && <p className="text-small text-destructive">{t.entryEditor.addressError}</p>}
                    </FormItem>
                  )}
                />
              )}


            </EditorSection>
            <EditorSection title={t.entryEditor.signup}>
              {selectedType === "foto" && <p className="text-small text-subtle">{t.entryEditor.photoSignupHint}</p>}
              {selectedType === "internal" ? <p className="text-small text-subtle">{t.entryEditor.internalSignup}</p> : <>
                <Select value={registrationMode} onValueChange={(mode) => {
                  form.setValue("noSignup", mode === "none", { shouldDirty: true });
                  form.setValue("vigiloSignup", mode === "vigilo", { shouldDirty: true });
                }}>
                  <SelectTrigger aria-label={t.entryEditor.signup}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website">{selectedType === "foto" ? t.events.registerPhotoSession : t.entryEditor.onsiteSignup}</SelectItem>
                    <SelectItem value="none">{t.entryEditor.noSignup}</SelectItem>
                    <SelectItem value="vigilo">{t.entryEditor.vigiloSignup}</SelectItem>
                  </SelectContent>
                </Select>
                {registrationMode === "website" && <div className="grid gap-4 sm:grid-cols-2">
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
                    <p className="text-small text-muted-foreground">
                      {t.modals.eventCreation.registrationDeadlineHint}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />


                </div>}
              </>}
            </EditorSection>
            <EditorSection title={t.entryEditor.publishing}>
              <p className="text-small text-subtle">{t.entryEditor.eventHomepageHint}</p>
              <FormField
                control={form.control}
                name="notifyNewsletter"
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
                        {t.events.sendNewsletterReminder}
                      </FormLabel>
                      <p className="text-small text-muted-foreground">
                        {t.yearlyCalendar.modal.notifyNewsletterHint}
                      </p>
                    </div>
                  </FormItem>
                )}
              />

            </EditorSection>
          </form>
        </Form>
      </EditorDialog>
    </Dialog>
  );
}
