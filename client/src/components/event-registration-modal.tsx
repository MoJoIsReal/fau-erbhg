import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { insertEventRegistrationSchema } from "@shared/schema";
import { MAX_ATTENDEES_PER_REGISTRATION, PHONE_PLACEHOLDER, type SignupErrorCode } from "@shared/constants";
import type { Event } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import PotluckContributions from "@/components/potluck-contributions";
import {
  TURNSTILE_FAILED,
  TurnstileWidget,
  turnstileEnabled,
  type TurnstileHandle,
} from "@/components/turnstile-widget";
import { z } from "zod";

const formSchema = insertEventRegistrationSchema.omit({ eventId: true }).extend({
  attendeeCount: z.number().min(1, "Må være minst 1 deltaker").max(MAX_ATTENDEES_PER_REGISTRATION, `Maksimalt ${MAX_ATTENDEES_PER_REGISTRATION} deltakere`),
  childrenNames: z.string().optional().nullable(),
  foodContribution: z.string().max(200).optional().nullable(),
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
  const asksFood = event?.potluck === true;
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNotReady, setTurnstileNotReady] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      attendeeCount: 1,
      comments: "",
      childrenNames: null,
      foodContribution: "",
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
    form.clearErrors("childrenNames");
  };

  // Outside a photo day the registrant is attendee 1, so everyone after them
  // is named here, in the same list a photo booking uses for its children.
  const otherAttendeeCount = isFotoEvent ? 0 : Math.max(0, (attendeeCount || 1) - 1);
  const namesError = form.formState.errors.childrenNames?.message;

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      if (!event) throw new Error("Ingen arrangement valgt");
      return apiRequest("POST", `/api/registrations`, { ...data, eventId: event.id, language, turnstileToken });
    },
    // A Turnstile token is single-use, whatever the outcome.
    onSettled: () => turnstileRef.current?.reset(),
    onSuccess: () => {
      toast({
        title: t.modals.eventRegistration.success,
        description: t.modals.eventRegistration.successDesc,
      });
      form.reset();
      onClose();
      // Refresh events to show updated attendee count
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      if (event) queryClient.invalidateQueries({ queryKey: [`/api/registrations?eventId=${event.id}&food=1`] });
    },
    onError: (error: unknown) => {
      const body = getApiErrorBody(error);
      const code = typeof body?.code === "string" ? body.code : null;
      // Without a widget on the page (no site key in this build) there is
      // nothing to show the message in, so the refusal falls through to the toast.
      if (turnstileEnabled && code === TURNSTILE_FAILED) {
        setTurnstileNotReady(true);
        return;
      }
      // The API names each refusal with a code, translated here. This used to
      // match substrings of the English messages, and showed anything it did
      // not recognise untranslated.
      const messages = t.modals.eventRegistration.errors;
      const isSignupError = (value: string | null): value is SignupErrorCode =>
        value !== null && Object.prototype.hasOwnProperty.call(messages, value);
      if (!isSignupError(code)) {
        toast({
          title: t.modals.eventRegistration.error,
          description: t.modals.eventRegistration.errorDesc,
          variant: "destructive",
        });
        return;
      }
      const suggestion = typeof body?.suggestion === "string" ? body.suggestion : "";
      const message = messages[code]
        .replace("{max}", String(MAX_ATTENDEES_PER_REGISTRATION))
        .replace("{email}", suggestion);
      if (code === "FOOD_CONTRIBUTION_REQUIRED") {
        form.setError("foodContribution", { type: "manual", message });
        return;
      }
      if (code === "ATTENDEE_NAMES_REQUIRED") {
        form.setError("childrenNames", { type: "manual", message });
        return;
      }
      // A problem with the address belongs under the address field.
      if (code === "EMAIL_REJECTED" || code === "ALREADY_REGISTERED" || (code === "EMAIL_TYPO" && suggestion)) {
        form.setError("email", { type: "manual", message });
        return;
      }
      toast({
        title: t.modals.eventRegistration.error,
        description: message,
        variant: "destructive",
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
          title: t.events.missingNames,
          description: t.modals.eventRegistration.errors.CHILD_NAMES_REQUIRED,
          variant: "destructive"
        });
        return;
      }
      // Trim the array to only the needed children
      const trimmedNames = names.slice(0, count).map(n => n.trim());
      data.childrenNames = JSON.stringify(trimmedNames);
    } else if ((data.attendeeCount || 1) > 1) {
      const others = (data.attendeeCount || 1) - 1;
      const names = getChildrenNamesArray().slice(0, others).map((n) => (n ?? "").trim());
      if (names.length < others || names.some((n) => !n)) {
        form.setError("childrenNames", {
          type: "manual",
          message: t.modals.eventRegistration.errors.ATTENDEE_NAMES_REQUIRED,
        });
        return;
      }
      data.childrenNames = JSON.stringify(names);
    } else {
      data.childrenNames = null;
    }
    if (asksFood) {
      const food = data.foodContribution?.trim() ?? "";
      if (!food) {
        form.setError("foodContribution", {
          type: "manual",
          message: t.modals.eventRegistration.errors.FOOD_CONTRIBUTION_REQUIRED,
        });
        return;
      }
      data.foodContribution = food;
    } else {
      data.foodContribution = null;
    }
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileNotReady(true);
      return;
    }
    mutation.mutate(data);
  };

  const onTurnstileToken = (token: string | null) => {
    setTurnstileToken(token);
    if (token) setTurnstileNotReady(false);
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
              ? (t.events.registerPhotoSession)
              : (t.events.eventRegistration)
            }
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {isFotoEvent
              ? (language === 'no'
                ? 'Oppgi antall barn som skal fotograferes og fornavn på hvert barn.'
                : 'Enter the number of children to be photographed and the first name of each child.')
              : (language === 'no'
                ? 'Fyll ut skjemaet nedenfor for å melde deg på arrangementet.'
                : 'Fill out the form below to register for the event.')
            }
          </DialogDescription>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 pt-3 pb-2 sm:px-6">
            <div className="p-3 bg-sand rounded-lg border border-hairline">
              <h4 className="font-medium text-ink">{event.title}</h4>
              <p className="text-sm text-subtle">
                {new Date(event.date).toLocaleDateString(language === 'no' ? 'no-NO' : 'en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })} {t.events.at} {event.time}
              </p>
              <p className="text-sm text-subtle">{event.location}</p>
            </div>
          </div>

          <Form {...form}>
            <form id="reg-form" onSubmit={form.handleSubmit(onSubmit)} className="px-4 pb-4 space-y-4 sm:px-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isFotoEvent ? (t.events.parentGuardianName) : 'Fullt navn *'}</FormLabel>
                  <FormControl>
                    <Input placeholder={isFotoEvent ? (t.events.parentGuardianName2) : 'Ditt navn'} {...field} />
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
                      ? (t.events.numberChildren)
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
                            ? `${num} ${num === 1 ? (t.events.child) : (t.events.children)}`
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
                <p className="text-sm font-medium text-copy">
                  {t.events.childrenSFirstNames}
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

            {/* Everyone else on a multi-person signup, by name */}
            {otherAttendeeCount > 0 && (
              <fieldset className="space-y-3" aria-describedby="other-attendees-hint">
                <legend className={`text-sm font-medium ${namesError ? "text-destructive" : ""}`}>
                  {t.events.otherAttendeeNames}
                </legend>
                <p id="other-attendees-hint" className="text-sm text-subtle">{t.events.otherAttendeeNamesHint}</p>
                {Array.from({ length: otherAttendeeCount }, (_, i) => {
                  const value = getChildrenNamesArray()[i] || "";
                  return (
                    <div key={i} className="space-y-2">
                      <Label htmlFor={`other-attendee-${i}`}>
                        {t.events.attendeeNumber.replace("{n}", String(i + 2))}
                      </Label>
                      <Input
                        id={`other-attendee-${i}`}
                        autoComplete="off"
                        maxLength={100}
                        placeholder={t.events.attendeeNamePlaceholder}
                        value={value}
                        aria-invalid={Boolean(namesError) && !value.trim()}
                        onChange={(e) => setChildName(i, e.target.value)}
                      />
                    </div>
                  );
                })}
                {namesError && (
                  <p role="alert" className="text-sm font-medium text-destructive">{namesError}</p>
                )}
              </fieldset>
            )}

            {asksFood && (
              <div className="rounded-lg border border-hairline bg-sand p-3">
                <PotluckContributions eventId={event.id} />
              </div>
            )}

            {asksFood && (
              <FormField
                control={form.control}
                name="foodContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.events.foodContributionLabel}</FormLabel>
                    <p className="text-sm text-subtle">{t.events.foodContributionHint}</p>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder={t.events.foodContributionPlaceholder}
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

            {event.maxAttendees != null && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/70 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Plasser igjen:</strong> {event.maxAttendees - (event.currentAttendees ?? 0)} av {event.maxAttendees}
                </p>
              </div>
            )}

            <TurnstileWidget ref={turnstileRef} onToken={onTurnstileToken} showNotReady={turnstileNotReady} />

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
