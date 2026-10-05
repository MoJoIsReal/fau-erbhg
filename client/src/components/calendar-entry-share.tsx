import { lazy, Suspense, useId, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
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
import type { CalendarEntry } from "@shared/calendar-entries";
import { calendarEntryPath } from "@shared/calendar-entries";

const CalendarEntryQr = lazy(() => import("@/components/calendar-entry-qr"));

/**
 * "Share": a link, and a QR code of the same link, that open this one entry's
 * detail panel rather than the top of the calendar — for a group chat, a
 * Facebook post or a poster on the kindergarten door.
 */
export default function CalendarEntryShare({ entry }: { entry: CalendarEntry }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  // Built from the current origin, like the feed URL, so a link copied on a
  // preview deployment points back to that preview.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}${calendarEntryPath(entry.id)}`;
  // Phones have a share sheet that reaches every messaging app at once;
  // desktop browsers mostly don't, and get the copy button alone.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: t.calendar.shareCopied });
    } catch {
      toast({ variant: "destructive", title: t.calendar.shareCopyFailed });
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: entry.title, url });
    } catch {
      // Closing the share sheet rejects too. The copy button is right there.
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t.calendar.share}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.calendar.shareTitle}</DialogTitle>
          <DialogDescription>{t.calendar.shareDescription}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <Label htmlFor={inputId}>{t.calendar.shareLinkLabel}</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id={inputId}
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={handleCopy}
                aria-label={t.calendar.shareCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {canShare && (
              <Button type="button" className="w-full" onClick={handleNativeShare}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {t.calendar.shareNative}
              </Button>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 border-t border-hairline pt-5 text-center">
            <Suspense fallback={<div className="h-48 w-48" aria-hidden="true" />}>
              <CalendarEntryQr url={url} title={entry.title} />
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
