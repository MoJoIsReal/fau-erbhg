import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertContactMessageSchema } from "@shared/schema";
import { Send, UserRoundCheck, User, GraduationCap, MapPin, Phone, Mail, Clock, Calendar } from "lucide-react";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";

type FormData = z.infer<typeof insertContactMessageSchema> & {
  subject: string;
};

export default function Contact() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const [isAnonymous, setIsAnonymous] = useState(false);

  const formSchema = insertContactMessageSchema.extend({
    subject: z.string().min(1, t.contact.selectSubject)
  });

  const contactInfo = [
    {
      title: t.contact.fauContact,
      email: "fauerdalbarnehage@gmail.com",
      description: t.contact.fauContactDesc,
      icon: UserRoundCheck,
      color: "bg-primary/20 text-primary"
    },
    {
      title: t.contact.kindergartenContact,
      email: "erdal.barnehage@askoy.kommune.no",
      address: "Steinråsa 5, 5306 Erdal",
      description: t.contact.kindergartenContactDesc,
      icon: GraduationCap,
      color: "bg-secondary/20 text-secondary"
    }
  ];
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: ""
    }
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
        return apiRequest("POST", "/api/documents?contact=true", {
          ...data,
          name: "",
          email: "",
          phone: ""
        });
      }
      return apiRequest("POST", "/api/documents?contact=true", data);
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
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="font-heading font-bold text-3xl text-neutral-900 mb-2">{t.contact.title}</h2>
        <p className="text-neutral-600">{t.contact.subtitle}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Contact Form */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-heading font-semibold text-xl text-neutral-900 mb-6">{t.contact.send}</h3>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {!isAnonymous && (
                  <>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.contact.name} *</FormLabel>
                          <FormControl>
                            <Input placeholder={t.contact.name} {...field} />
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
                            <Input type="email" placeholder={t.contact.email} {...field} />
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
                            <Input type="tel" placeholder="+47 xxx xx xxx" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {isAnonymous && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>{t.contact.anonymous}:</strong> {t.contact.anonymousDesc}
                    </p>
                  </div>
                )}

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

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.contact.message} *</FormLabel>
                      <FormControl>
                        <Textarea 
                          rows={5} 
                          placeholder={t.contact.message}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={mutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {mutation.isPending ? t.contact.sending : t.contact.send}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <div className="space-y-6">
          {/* Council Members */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-heading font-semibold text-xl text-neutral-900 mb-6">Foreldrenes arbeidsutvalg (FAU)</h3>
              
              <div className="space-y-4">
                {contactInfo.map((contact, index) => {
                  const Icon = contact.icon;
                  return (
                    <div key={index} className="flex items-start">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 flex-shrink-0 ${contact.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-neutral-900">{contact.title}</h4>
                        <p className="text-sm text-neutral-600 mb-1">{contact.description}</p>
                        {contact.email && (
                          <p className="text-sm text-neutral-700">
                            <Mail className="h-3 w-3 inline mr-2" />
                            <a href={`mailto:${contact.email}`} className="hover:text-primary">
                              {contact.email}
                            </a>
                          </p>
                        )}
                        {contact.address && (
                          <p className="text-sm text-neutral-700">
                            <MapPin className="h-3 w-3 inline mr-2" />
                            {contact.address}
                          </p>
                        )}
                        {contact.phone && (
                          <p className="text-sm text-neutral-700">
                            <Phone className="h-3 w-3 inline mr-2" />
                            {contact.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
