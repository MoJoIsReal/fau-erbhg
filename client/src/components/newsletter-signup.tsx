import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  TURNSTILE_FAILED,
  TurnstileWidget,
  turnstileEnabled,
  type TurnstileHandle,
} from "@/components/turnstile-widget";

export default function NewsletterSignup() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNotReady, setTurnstileNotReady] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contact?action=newsletter-subscribe", {
        email,
        name,
        language,
        website,
        turnstileToken,
      });
      return res.json();
    },
    // A Turnstile token is single-use, whatever the outcome.
    onSettled: () => turnstileRef.current?.reset(),
    onSuccess: () => {
      toast({ title: t.newsletter.successTitle, description: t.newsletter.successDesc });
      setEmail("");
      setName("");
    },
    onError: (error: any) => {
      // Without a widget on the page (no site key in this build) there is
      // nothing to show the message in, so the refusal falls through to the toast.
      if (turnstileEnabled && getApiErrorBody(error)?.code === TURNSTILE_FAILED) {
        setTurnstileNotReady(true);
        return;
      }
      toast({
        title: t.newsletter.errorTitle,
        description: error?.message || t.newsletter.errorDesc,
        variant: "destructive",
      });
    },
  });

  const onTurnstileToken = (token: string | null) => {
    setTurnstileToken(token);
    if (token) setTurnstileNotReady(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileNotReady(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-px w-px opacity-0"
        style={{ left: "-10000px" }}
      />

      <div>
        <Label htmlFor="newsletter-email">{t.newsletter.emailLabel} *</Label>
        <Input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.newsletter.emailPlaceholder}
        />
      </div>

      <div>
        <Label htmlFor="newsletter-name">{t.newsletter.nameLabel}</Label>
        <Input
          id="newsletter-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.newsletter.namePlaceholder}
        />
      </div>

      <p className="text-xs text-subtle">{t.newsletter.consent}</p>

      <TurnstileWidget ref={turnstileRef} onToken={onTurnstileToken} showNotReady={turnstileNotReady} />

      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || !email}
      >
        <Mail className="h-4 w-4 mr-2" />
        {mutation.isPending ? t.newsletter.subscribing : t.newsletter.subscribe}
      </Button>
    </form>
  );
}
