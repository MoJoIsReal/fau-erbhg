import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

/**
 * A form error that stays put next to what it is about (guide §8: red text,
 * an icon and the explanation under the field). `role="alert"` announces it
 * when it appears; give the field `aria-invalid` and point its
 * `aria-describedby` at `id`. A toast vanishes after a few seconds and is
 * tied to no field, so it is no place for the only copy of an error.
 */
export function FormError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-small font-medium text-destructive">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
