import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiErrorText, apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { FormError } from "@/components/site/form-error";

export default function PasswordChangeModal() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Each error sits under the field it is about, and stays until that field
  // is edited or the form is sent again.
  type Field = "current" | "new" | "confirm" | "form";
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const clear = (field: Field) => setErrors(({ [field]: _, form: __, ...rest }) => rest);
  const fieldProps = (field: Field) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `password-${field}-error` : undefined,
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth?action=change-password", {
        currentPassword,
        newPassword,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      toast({ title: t.modals.passwordChange.success });
    },
    onError: (failure: unknown) => {
      const message = apiErrorText(failure, t, t.apiErrors.generic);
      const code = getApiErrorBody(failure)?.code;
      const field: Field = code === "CURRENT_PASSWORD_INCORRECT" ? "current"
        : code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_UNCHANGED" ? "new"
        : "form";
      setErrors({ [field]: message });
    },
  });

  const submit = () => {
    const found: Partial<Record<Field, string>> = {};
    if (!currentPassword) found.current = t.modals.passwordChange.currentRequired;
    if (newPassword.length < 12) found.new = t.modals.passwordChange.tooShort;
    else if (newPassword !== confirmPassword) found.confirm = t.modals.passwordChange.mismatch;
    setErrors(found);
    if (Object.keys(found).length === 0) changePasswordMutation.mutate();
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.modals.passwordChange.title}</DialogTitle>
          <DialogDescription>{t.modals.passwordChange.description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <div>
            <Label htmlFor="current-password">{t.modals.passwordChange.currentPassword}</Label>
            <Input
              id="current-password"
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => { setCurrentPassword(event.target.value); clear("current"); }}
              {...fieldProps("current")}
              required
            />
            <FormError id="password-current-error">{errors.current}</FormError>
          </div>
          <div>
            <Label htmlFor="new-password">{t.modals.passwordChange.newPassword}</Label>
            <Input
              id="new-password"
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => { setNewPassword(event.target.value); clear("new"); }}
              {...fieldProps("new")}
              minLength={12}
              required
            />
            <FormError id="password-new-error">{errors.new}</FormError>
          </div>
          <div>
            <Label htmlFor="confirm-password">{t.modals.passwordChange.confirmPassword}</Label>
            <Input
              id="confirm-password"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); clear("confirm"); }}
              {...fieldProps("confirm")}
              minLength={12}
              required
            />
            <FormError id="password-confirm-error">{errors.confirm}</FormError>
          </div>
          <FormError id="password-form-error">{errors.form}</FormError>
          <Button
            type="submit"
            className="w-full"
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? t.modals.passwordChange.saving : t.modals.passwordChange.save}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
