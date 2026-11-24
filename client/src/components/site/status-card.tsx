import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/site/section";

export type StatusCardTone = "ready" | "pending" | "success" | "error";

interface StatusCardProps {
  /** ready — nothing has happened yet, so no icon; the others carry one. */
  tone: StatusCardTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

/**
 * The one-card page a link from an email opens on: confirming or leaving the
 * newsletter, looking up a registration. An error is announced as an alert,
 * anything else as a status.
 */
export function StatusCard({ tone, title, description, action }: StatusCardProps) {
  return (
    <Surface className="space-y-4 p-8 text-center" role={tone === "error" ? "alert" : "status"}>
      {tone === "pending" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />}
      {tone === "success" && <CheckCircle2 className="mx-auto h-10 w-10 text-brand" />}
      {tone === "error" && <XCircle className="mx-auto h-10 w-10 text-destructive" />}
      <h2 className="text-h3 font-bold tracking-tight text-ink">{title}</h2>
      {description && <p className="text-copy">{description}</p>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </Surface>
  );
}
