import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/components/site/form-error";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, getApiErrorBody, invalidateEventRegistrations } from "@/lib/queryClient";
import { MAX_ATTENDEES_PER_REGISTRATION, type SignupErrorCode } from "@shared/constants";
import type { Event, EventRegistration } from "@shared/schema";

interface RegistrationEditDialogProps {
  event: Event;
  registration: EventRegistration;
}

function parseNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((name) => String(name ?? "")) : [];
  } catch {
    return [];
  }
}

// The council changes a signup on a parent's behalf: how many come, who the
// others are and, on a potluck, the food. The API holds it to the signup's own
// rules (a name for everyone besides the registrant, food on a potluck) and to
// the event's capacity. Not offered for a photo booking, whose children hold
// reserved slots.
export default function RegistrationEditDialog({ event, registration }: RegistrationEditDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(registration.attendeeCount || 1);
  const [names, setNames] = useState<string[]>(() => parseNames(registration.childrenNames));
  const [food, setFood] = useState(registration.foodContribution ?? "");
  type Field = "names" | "food" | "form";
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const signupErrors = t.modals.eventRegistration.errors;
  const otherCount = Math.max(0, attendeeCount - 1);
  const idPrefix = `registration-${registration.id}`;

  // Opening starts from what is stored, so a cancelled edit leaves nothing behind.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setAttendeeCount(registration.attendeeCount || 1);
      setNames(parseNames(registration.childrenNames));
      setFood(registration.foodContribution ?? "");
      setErrors({});
    }
    setOpen(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/registrations?id=${registration.id}`, {
        attendeeCount,
        childrenNames: otherCount > 0 ? JSON.stringify(names.slice(0, otherCount).map((name) => name.trim())) : null,
        foodContribution: event.potluck ? food.trim() : null,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidateEventRegistrations(event.id);
      toast({ title: t.events.registrationUpdated });
      setOpen(false);
    },
    onError: (failure: unknown) => {
      const code = getApiErrorBody(failure)?.code;
      const known = typeof code === "string" && Object.prototype.hasOwnProperty.call(signupErrors, code);
      const message = known
        ? signupErrors[code as SignupErrorCode].replace("{max}", String(MAX_ATTENDEES_PER_REGISTRATION))
        : t.events.couldNotUpdateRegistration;
      const field: Field = code === "ATTENDEE_NAMES_REQUIRED" ? "names"
        : code === "FOOD_CONTRIBUTION_REQUIRED" ? "food"
        : "form";
      setErrors({ [field]: message });
    },
  });

  const submit = () => {
    const found: Partial<Record<Field, string>> = {};
    if (names.slice(0, otherCount).filter((name) => name.trim()).length < otherCount) {
      found.names = signupErrors.ATTENDEE_NAMES_REQUIRED;
    }
    if (event.potluck && !food.trim()) found.food = signupErrors.FOOD_CONTRIBUTION_REQUIRED;
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t.events.editRegistration}: ${registration.name}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.events.editRegistration}</DialogTitle>
          <DialogDescription>
            {t.events.editRegistrationDesc.replace("{name}", registration.name)}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-count`}>{t.events.numberOfAttendees}</Label>
            <Select
              value={String(attendeeCount)}
              onValueChange={(value) => {
                setAttendeeCount(parseInt(value, 10));
                setErrors(({ names: _, form: __, ...rest }) => rest);
              }}
            >
              <SelectTrigger id={`${idPrefix}-count`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_ATTENDEES_PER_REGISTRATION }, (_, i) => i + 1).map((num) => (
                  <SelectItem key={num} value={String(num)}>{num}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {otherCount > 0 && (
            <fieldset className="space-y-3">
              <legend className={`text-sm font-medium ${errors.names ? "text-destructive" : ""}`}>
                {t.events.otherAttendeeNames}
              </legend>
              {Array.from({ length: otherCount }, (_, i) => {
                const value = names[i] ?? "";
                return (
                  <div key={i} className="space-y-2">
                    <Label htmlFor={`${idPrefix}-attendee-${i}`}>
                      {t.events.attendeeNumber.replace("{n}", String(i + 2))}
                    </Label>
                    <Input
                      id={`${idPrefix}-attendee-${i}`}
                      autoComplete="off"
                      maxLength={100}
                      placeholder={t.events.attendeeNamePlaceholder}
                      value={value}
                      aria-invalid={Boolean(errors.names) && !value.trim()}
                      aria-describedby={errors.names ? `${idPrefix}-names-error` : undefined}
                      onChange={(changeEvent) => {
                        const next = [...names];
                        next[i] = changeEvent.target.value;
                        setNames(next);
                        setErrors(({ names: _, form: __, ...rest }) => rest);
                      }}
                    />
                  </div>
                );
              })}
              <FormError id={`${idPrefix}-names-error`}>{errors.names}</FormError>
            </fieldset>
          )}

          {event.potluck && (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-food`}>{t.events.foodContribution}</Label>
              <Input
                id={`${idPrefix}-food`}
                maxLength={200}
                placeholder={t.events.foodContributionPlaceholder}
                value={food}
                aria-invalid={errors.food ? true : undefined}
                aria-describedby={errors.food ? `${idPrefix}-food-error` : undefined}
                onChange={(changeEvent) => {
                  setFood(changeEvent.target.value);
                  setErrors(({ food: _, form: __, ...rest }) => rest);
                }}
              />
              <FormError id={`${idPrefix}-food-error`}>{errors.food}</FormError>
            </div>
          )}

          <FormError id={`${idPrefix}-form-error`}>{errors.form}</FormError>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {t.events.saveRegistration}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
