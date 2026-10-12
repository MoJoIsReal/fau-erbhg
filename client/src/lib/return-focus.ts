/**
 * Where focus goes when a dialog closes.
 *
 * Radix returns focus to a dialog's <DialogTrigger>. Most dialogs here are
 * opened from state (`open={isOpen}`) and have no trigger, so on close Radix
 * focused nothing and a keyboard or screen-reader user was dropped back at the
 * top of the page (WCAG 2.4.3). Pass `returnFocus` as `onCloseAutoFocus` on
 * such a dialog's content.
 *
 * The page keeps a short history of focused elements rather than one "opener"
 * per dialog: when a dialog closes its own contents are already detached, so
 * the newest element still in the document is the right place to go back to —
 * the button that opened it, the menu trigger when the opener was a menu item
 * that has since unmounted, or a field in the dialog underneath when two are
 * stacked.
 */
const MAX_HISTORY = 10;
const history: HTMLElement[] = [];

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || element === document.body) return;
      // Radix's invisible focus guards take focus for an instant at the edges
      // of a dialog; they are never a place to return to.
      if (element.hasAttribute("data-radix-focus-guard")) return;
      const existing = history.indexOf(element);
      if (existing !== -1) history.splice(existing, 1);
      history.push(element);
      if (history.length > MAX_HISTORY) history.shift();
    },
    true,
  );
}

export function returnFocus(event: Event) {
  for (let i = history.length - 1; i >= 0; i--) {
    const element = history[i];
    if (element.isConnected) {
      event.preventDefault();
      element.focus();
      return;
    }
  }
}
