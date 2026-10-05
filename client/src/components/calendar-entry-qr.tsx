import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { printToken } from "@/lib/calendar-pdf-theme";

// A QR code ends up on paper and in other people's phones, so like the
// printable calendar it keeps the light theme's ink on a white ground whatever
// the screen theme is. Inverted codes scan badly on older phone cameras.
const QR_INK = printToken("color-ink");
const QR_GROUND = printToken("color-surface-raised");

/** "Foreldrefest i Grendahuset! 🎉" → "foreldrefest-i-grendahuset". */
function fileSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "kalender";
}

/**
 * The QR half of the share dialog. Split from it because the encoder and the
 * token sheet it reads are only worth loading once someone asks to share.
 */
export default function CalendarEntryQr({ url, title }: { url: string; title: string }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `qr-${fileSlug(title)}.png`;
    link.click();
  };

  return (
    <>
      {/* Drawn larger than shown, so the downloaded PNG stays sharp on a
          printed poster. */}
      <QRCodeCanvas
        ref={canvasRef}
        value={url}
        size={512}
        level="M"
        marginSize={4}
        fgColor={QR_INK}
        bgColor={QR_GROUND}
        role="img"
        aria-label={t.calendar.shareQrLabel.replace("{title}", title)}
        className="rounded-token"
        style={{ width: "12rem", height: "12rem" }}
      />
      <p className="measure text-small text-subtle">{t.calendar.shareQrHint}</p>
      <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {t.calendar.shareQrDownload}
      </Button>
    </>
  );
}
