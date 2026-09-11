import { useState } from "react";
import { CalendarPlus, Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

const FEED_PATH = "/kalender.ics";

/**
 * "Subscribe to the calendar": hands the parent the iCalendar feed URL served
 * by /kalender.ics. Unlike the per-event "add to calendar" export, a
 * subscription keeps updating — new events, changed times and cancellations
 * arrive in their own calendar app without them doing anything.
 */
export default function CalendarSubscribe() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Built from the current origin so it works on localhost, previews and
  // production without a configured base URL on the client.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const query = language === "en" ? "?lang=en" : "";
  const httpUrl = `${origin}${FEED_PATH}${query}`;
  const webcalUrl = httpUrl.replace(/^https?:/, "webcal:");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(httpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: t.calendar.subscribeCopied });
    } catch {
      toast({
        variant: "destructive",
        title: t.calendar.subscribeCopyFailed,
        description: t.calendar.subscribeCopyFailedHint,
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          <span>{t.calendar.subscribe}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.calendar.subscribeTitle}</DialogTitle>
          <DialogDescription>{t.calendar.subscribeDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                {t.calendar.subscribeGoogle}
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <a href={webcalUrl}>{t.calendar.subscribeApple}</a>
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-feed-url">{t.calendar.subscribeUrlLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="calendar-feed-url"
                readOnly
                value={httpUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label={t.calendar.subscribeCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t.calendar.subscribeUrlHint}
            </p>
          </div>

          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button asChild variant="ghost" size="sm" className="flex items-center gap-2">
              <a href={httpUrl} download="fau-erdal-barnehage.ics">
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{t.calendar.subscribeDownload}</span>
              </a>
            </Button>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t.calendar.subscribeDownloadHint}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
