import type { ReactNode } from "react";
import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function EditorDialog({ title, description, children, footer }: {
  title: string; description: string; children: ReactNode; footer: ReactNode;
}) {
  return (
    <DialogContent className="flex h-dvh max-h-dvh max-w-none flex-col gap-0 rounded-none border-hairline bg-sand p-0 shadow-panel sm:h-auto sm:max-h-[90dvh] sm:max-w-editor sm:rounded-card [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
      <header className="shrink-0 border-b border-hairline px-6 py-5 pr-16 sm:px-8 sm:pr-20">
        <DialogTitle className="text-h3 font-bold text-ink">{title}</DialogTitle>
        <DialogDescription className="mt-2 text-small text-subtle">{description}</DialogDescription>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8">{children}</div>
      <footer className="shrink-0 border-t border-hairline bg-surface px-6 py-4 sm:px-8">{footer}</footer>
    </DialogContent>
  );
}

export function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4 border-t border-hairline pt-5 first:border-0 first:pt-0">
      <legend className="float-left mb-4 w-full text-small font-semibold text-ink">{title}</legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}
