import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertContactMessageSchema } from "@shared/schema";
import { FAU_EMAIL, KINDERGARTEN_ADDRESS, PHONE_PLACEHOLDER } from "@shared/constants";
import {
  GraduationCap,
  Info,
  Mail,
  MapPin,
  Phone,
  Send,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import NewsletterSignup from "@/components/newsletter-signup";
import PageHero from "@/components/site/page-hero";
import { SectionHeader, Surface } from "@/components/site/section";
import { InfoBanner } from "@/components/site/banners";
import { ILLUSTRATION_FJORD } from "@/components/site/illustrations";

type FormData = z.infer<typeof insertContactMessageSchema> & {
  subject: string;
  website?: string;
};

type ContactCard = {
  title: string;
  email?: string;
  address?: string;
  phone?: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Kontakt.
 *
 * Two things, in the order the guide puts them (§13): who you are writing to,
 * then the form. The form is capped at the guide's 600px measure and sits in
 * the main column on desktop, with the contact cards beside it — and under it
 * on a phone, so the thing most people came to do is the first thing they
 * reach.
 */
export default function Contact() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  usePageMeta({
    title: language === "no" ? "Kontakt" : "Contact",
    description:
      language === "no"
        ? "Ta kontakt med FAU Erdal Barnehage. Send en henvendelse, tilbakemelding eller anonym beskjed."
        : "Get in touch with FAU Erdal Kindergarten. Send a message, feedback or an anonymous note.",
    path: "/contact",
  });
  const [isAnonymous, setIsAnonymous] = useState(false);

  const formSchema = insertContactMessageSchema.extend({
    subject: z.string().min(1, t.contact.selectSubject),
    website: z.string().optional(),
  });

  const contactCards: ContactCard[] = [
    {
      title: t.contact.fauContact,
      email: FAU_EMAIL,
      description: t.contact.fauContactDesc,
      icon: UserRoundCheck,
    },
    {
      title: t.contact.kindergartenContact,
      email: "erdal.barnehage@askoy.kommune.no",
      address: KINDERGARTEN_ADDRESS,
      description: t.contact.kindergartenContactDesc,
      icon: GraduationCap,
    },
  ];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
      website: "",
    },
  });

  const watchSubject = form.watch("subject");

  // Track when anonymous is selected and clear personal data
  useEffect(() => {
    const isAnonymousSelected = watchSubject === "anonymous";
    setIsAnonymous(isAnonymousSelected);

    if (isAnonymousSelected) {
      // Clear personal information fields when anonymous is selected
      form.setValue("name", "");
      form.setValue("email", "");
      form.setValue("phone", "");
    }
  }, [watchSubject, form]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      // For anonymous submissions, remove personal data before sending
      if (data.subject === "anonymous") {
        return apiRequest("POST", "/api/contact", {
          ...data,
          name: "",
          email: "",
          phone: "",
        });
      }
      // language decides which of the two auto-reply templates the sender gets.
      return apiRequest("POST", "/api/contact", { ...data, language });
    },
    onSuccess: () => {
      toast({
        title: t.contact.success,
        description: t.contact.successDesc,
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: t.contact.error,
        description: error.message || t.contact.errorDesc,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="section-rhythm">
      <PageHero
        layout="strip"
        tone="peach"
        priority
        title={t.contact.title}
        lead={t.contact.heroLead}
        illustration={{ art: ILLUSTRATION_FJORD, alt: "" }}
      />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] lg:gap-16">
        {/* min-w-0: a grid item defaults to a min-content floor, and the
            select's longest option was wide enough to push the whole column
            past the viewport at 375px. */}
        <section className="min-w-0" aria-labelledby="contact-form-heading">
          <SectionHeader
            id="contact-form-heading"
            title={t.contact.formTitle}
            description={t.contact.formLead}
          />

          {/* The guide caps a form at 600px: past that, a label and its field
              drift apart and the eye has to travel (§13). */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-[600px] space-y-5">
              <input
                type="text"
                {...form.register("website")}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute h-px w-px opacity-0"
                style={{ left: "-10000px" }}
              />

              {/* Subject first: it decides whether the personal fields are
                  asked for at all, so asking for a name that then disappears
                  was the wrong order. */}
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.contact.subject} *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t.contact.subjectPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="anonymous">{t.contact.subjects.anonymous}</SelectItem>
                        <SelectItem value="general">{t.contact.subjects.general}</SelectItem>
                        <SelectItem value="concern">{t.contact.subjects.concern}</SelectItem>
                        <SelectItem value="feedback">{t.contact.subjects.feedback}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAnonymous && (
                <InfoBanner
                  tone="warm"
                  role="status"
                  icon={<Info className="h-5 w-5" aria-hidden="true" />}
                  title={t.contact.anonymous}
                >
                  {t.contact.anonymousDesc}
                </InfoBanner>
              )}

              {!isAnonymous && (
                <>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.contact.name} *</FormLabel>
                        <FormControl>
                          <Input autoComplete="name" {...field} />
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
                        <FormLabel>{t.contact.email} *</FormLabel>
                        <FormControl>
                          {/* inputMode and autoComplete so a phone offers the
                              right keyboard and the stored address. */}
                          <Input type="email" inputMode="email" autoComplete="email" {...field} />
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
                        <FormLabel>{t.contact.phone}</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder={PHONE_PLACEHOLDER}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.contact.message} *</FormLabel>
                    <FormControl>
                      <Textarea rows={6} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={mutation.isPending}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {mutation.isPending ? t.contact.sending : t.contact.send}
              </Button>
            </form>
          </Form>
        </section>

        <aside className="min-w-0 space-y-8" aria-labelledby="contact-ways-heading">
          <div>
            <h2 id="contact-ways-heading" className="text-h3 font-bold tracking-tight text-ink">
              {t.contact.otherWays}
            </h2>
            <div className="mt-5 space-y-4">
              {contactCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Surface key={card.title} className="p-5">
                    <div className="flex items-start gap-4">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-token bg-green-50 text-brand"
                        aria-hidden="true"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink">{card.title}</h3>
                        <p className="mt-0.5 text-small text-subtle">{card.description}</p>
                        <ul className="mt-3 space-y-1.5 text-small">
                          {card.email && (
                            <li className="flex items-start gap-2">
                              <Mail
                                className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                                aria-hidden="true"
                              />
                              <a
                                href={`mailto:${card.email}`}
                                className="min-w-0 break-words font-semibold text-brand hover:underline"
                              >
                                {card.email}
                              </a>
                            </li>
                          )}
                          {card.address && (
                            <li className="flex items-start gap-2 text-copy">
                              <MapPin
                                className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                                aria-hidden="true"
                              />
                              <span>{card.address}</span>
                            </li>
                          )}
                          {card.phone && (
                            <li className="flex items-start gap-2 text-copy">
                              <Phone
                                className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
                                aria-hidden="true"
                              />
                              <span>{card.phone}</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </Surface>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-h3 font-bold tracking-tight text-ink">{t.newsletter.title}</h2>
            <p className="mt-2 text-small text-copy">{t.newsletter.subtitle}</p>
            <div className="mt-5">
              <NewsletterSignup />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
