import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NewsletterSignup() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contact?action=newsletter-subscribe", {
        email,
        name,
        language,
        website,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.newsletter.successTitle, description: t.newsletter.successDesc });
      setEmail("");
      setName("");
    },
    onError: (error: any) => {
      toast({
        title: t.newsletter.errorTitle,
        description: error?.message || t.newsletter.errorDesc,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
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

      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.newsletter.consent}</p>

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90"
        disabled={mutation.isPending || !email}
      >
        <Mail className="h-4 w-4 mr-2" />
        {mutation.isPending ? t.newsletter.subscribing : t.newsletter.subscribe}
      </Button>
    </form>
  );
}
