import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { apiErrorText, apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import PageHero from "@/components/site/page-hero";
import { Surface } from "@/components/site/section";
import { FormError } from "@/components/site/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The link carries its token in the fragment, which never reaches a server
// log or a Referer header.
function tokenFromHash(): string {
  return window.location.hash.replace(/^#/, "");
}

// "Nytt passord", reached from the link in the password-reset email. Nothing
// happens on load: the token is spent only by an explicit save, so a mail
// scanner that prefetches the link changes nothing.
export default function ResetPassword() {
  const { t } = useLanguage();
  const copy = t.passwordReset;
  const queryClient = useQueryClient();
  const [token] = useState(tokenFromHash);
  // Dropped from the address bar once read, so the link does not stay in the
  // browser history.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  type Field = "new" | "confirm" | "form";
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [linkInvalid, setLinkInvalid] = useState<string | null>(null);
  const clear = (field: Field) => setErrors(({ [field]: _, form: __, ...rest }) => rest);
  const fieldProps = (field: Field) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `reset-${field}-error` : undefined,
  });

  usePageMeta({
    title: copy.navTitle,
    description: copy.subtitle,
    path: "/nytt-passord",
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("GET", "/api/auth?action=csrf");
      const response = await apiRequest("POST", "/api/auth?action=reset-password", { token, newPassword });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth"] });
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (failure: unknown) => {
      const message = apiErrorText(failure, t, t.apiErrors.generic);
      const code = getApiErrorBody(failure)?.code;
      if (code === "RESET_LINK_INVALID") setLinkInvalid(message);
      else setErrors({ [code === "PASSWORD_TOO_SHORT" ? "new" : "form"]: message });
    },
  });

  const submit = () => {
    const found: Partial<Record<Field, string>> = {};
    if (newPassword.length < 12) found.new = t.modals.passwordChange.tooShort;
    else if (newPassword !== confirmPassword) found.confirm = t.modals.passwordChange.mismatch;
    setErrors(found);
    if (Object.keys(found).length === 0) resetMutation.mutate();
  };

  let content;
  if (!token || linkInvalid) {
    content = (
      <Surface className="space-y-4 p-8 text-center" role="alert">
        <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 className="text-h3 font-bold tracking-tight text-ink">{copy.missingTitle}</h2>
        <p className="text-copy">{linkInvalid ?? copy.missingDesc}</p>
      </Surface>
    );
  } else if (resetMutation.isSuccess) {
    content = (
      <Surface className="space-y-4 p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-brand" aria-hidden="true" />
        <h2 className="text-h3 font-bold tracking-tight text-ink">{copy.successTitle}</h2>
        <p className="text-copy">{copy.successDesc}</p>
        <Button asChild>
          <Link href="/">{t.navigation.home}</Link>
        </Button>
      </Surface>
    );
  } else {
    content = (
      <Surface className="p-6 sm:p-8">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <div>
            <Label htmlFor="reset-new-password">{t.modals.passwordChange.newPassword}</Label>
            <Input
              id="reset-new-password"
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => { setNewPassword(event.target.value); clear("new"); }}
              {...fieldProps("new")}
              minLength={12}
              required
            />
            <FormError id="reset-new-error">{errors.new}</FormError>
          </div>
          <div>
            <Label htmlFor="reset-confirm-password">{t.modals.passwordChange.confirmPassword}</Label>
            <Input
              id="reset-confirm-password"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); clear("confirm"); }}
              {...fieldProps("confirm")}
              minLength={12}
              required
            />
            <FormError id="reset-confirm-error">{errors.confirm}</FormError>
          </div>
          <FormError id="reset-form-error">{errors.form}</FormError>
          <Button type="submit" disabled={resetMutation.isPending}>
            {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {resetMutation.isPending ? copy.saving : copy.save}
          </Button>
        </form>
      </Surface>
    );
  }

  return (
    <div className="mx-auto max-w-2xl section-rhythm">
      <PageHero tone="peach" title={copy.title} lead={copy.subtitle} />
      {content}
    </div>
  );
}
