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
import { cn } from "@/lib/utils";

const FEED_PATH = "/kalender.ics";
const FEED_NAME = "FAU Erdal Barnehage";

interface CalendarSubscribeProps {
  /** Extra classes for the trigger, so it can match the surface it sits on. */
  triggerClassName?: string;
  triggerSize?: "default" | "sm";
}

/**
 * "Subscribe to the calendar": hands the parent the iCalendar feed URL served
 * by /kalender.ics. Unlike the per-event "add to calendar" export, a
 * subscription keeps updating — new events, changed times and cancellations
 * arrive in their own calendar app without them doing anything.
 */
export default function CalendarSubscribe({
  triggerClassName,
  triggerSize = "sm",
}: CalendarSubscribeProps = {}) {
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
  // Outlook gets its own web deep link with the https URL. Handing it the
  // webcal:// link makes Outlook for Windows drop the scheme and prefill
  // "//host/kalender.ics", which its subscribe dialog rejects as invalid.
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpUrl)}&name=${encodeURIComponent(FEED_NAME)}`;

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
        <Button
          variant="outline"
          size={triggerSize}
          className={cn("flex items-center gap-2", triggerClassName)}
        >
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
          {/* Button labels are whitespace-nowrap by default, which makes a long
              label the dialog's minimum width and pushes every grid child past
              the padding. Let these wrap and shrink instead. */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-auto min-w-0 flex-1 whitespace-normal py-2 text-center">
              <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                {t.calendar.subscribeGoogle}
              </a>
            </Button>
            <Button asChild variant="outline" className="h-auto min-w-0 flex-1 whitespace-normal py-2 text-center">
              <a href={webcalUrl}>{t.calendar.subscribeApple}</a>
            </Button>
            <Button asChild variant="outline" className="h-auto min-w-0 flex-1 whitespace-normal py-2 text-center">
              <a href={outlookUrl} target="_blank" rel="noopener noreferrer">
                {t.calendar.subscribeOutlook}
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar-feed-url">{t.calendar.subscribeUrlLabel}</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="calendar-feed-url"
                readOnly
                value={httpUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={handleCopy}
                aria-label={t.calendar.subscribeCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-subtle">
              {t.calendar.subscribeUrlHint}
            </p>
          </div>

          <div className="border-t border-hairline pt-4">
            <Button asChild variant="ghost" size="sm" className="h-auto min-w-0 whitespace-normal py-2 flex items-center gap-2">
              <a href={httpUrl} download="fau-erdal-barnehage.ics">
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{t.calendar.subscribeDownload}</span>
              </a>
            </Button>
            <p className="mt-1 text-xs text-subtle">
              {t.calendar.subscribeDownloadHint}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
