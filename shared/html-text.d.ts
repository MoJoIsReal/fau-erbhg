export function htmlToPlainText(html: string | null | undefined, options?: { links?: boolean }): string;

export function truncatePlainText(text: string | null | undefined, maxLength: number): string;

export function plainTextToHtml(text: string | null | undefined): string;
