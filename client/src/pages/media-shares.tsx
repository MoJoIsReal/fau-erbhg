import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Film,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Music,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, SectionHeader, Surface } from "@/components/site/section";
import { InfoBanner } from "@/components/site/banners";
import { StatusPill } from "@/components/site/controls";
import { QueryNotice } from "@/components/site/query-notice";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { formatDate, formatFileSize } from "@/lib/i18n";
import { MediaUploadError, prepareMedia, uploadMedia } from "@/lib/media-upload";
import type { MediaShareSummary } from "@shared/schema";
import {
  MEDIA_ACCEPT,
  MEDIA_DEFAULT_LIFETIME_DAYS,
  MEDIA_DESCRIPTION_MAX,
  MEDIA_MAX_EXTENSION_DAYS,
  MEDIA_MAX_INITIAL_DAYS,
  MEDIA_NEW_PIN_PATTERN,
  MEDIA_TITLE_MAX,
  mediaKind,
  normalizeMediaMime,
} from "@shared/media";

const LIST_KEY = ["/api/media?action=list"];
const LIFETIME_CHOICES = [7, 14, 30, 60, MEDIA_DEFAULT_LIFETIME_DAYS, MEDIA_MAX_INITIAL_DAYS];
const EXTENSION_CHOICES = [30, 90, MEDIA_MAX_EXTENSION_DAYS];

interface MediaList {
  configured: boolean;
  storage: { usedBytes: number; quotaBytes: number; maxFileBytes: number };
  shares: MediaShareSummary[];
}

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);

function errorCode(error: unknown): string | undefined {
  if (error instanceof MediaUploadError) return error.code;
  const code = getApiErrorBody(error)?.code;
  return typeof code === "string" ? code : undefined;
}

export default function MediaShares() {
  const { t, language } = useLanguage();
  usePageMeta({ title: t.mediaAdmin.title, description: t.mediaAdmin.intro, path: "/admin/media" });
  const list = useQuery<MediaList>({ queryKey: LIST_KEY });
  const storage = list.data?.storage;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-h1 font-bold tracking-tight text-ink">{t.mediaAdmin.title}</h1>
        <p className="measure mt-2 text-copy">{t.mediaAdmin.intro}</p>
        {storage && (
          <p className="mt-3 flex items-center gap-2 text-small text-subtle">
            <HardDrive className="h-4 w-4" aria-hidden="true" />
            {fill(t.mediaAdmin.storageUsed, {
              used: formatFileSize(storage.usedBytes, language),
              quota: formatFileSize(storage.quotaBytes, language),
            })}
          </p>
        )}
      </div>

      <QueryNotice queries={[list]} />
      {list.data && !list.data.configured && (
        <InfoBanner
          tone="alert"
          role="alert"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          title={t.mediaAdmin.notConfiguredTitle}
        >
          {t.mediaAdmin.notConfiguredBody}
        </InfoBanner>
      )}

      {list.data?.configured && storage && <CreateShare maxFileBytes={storage.maxFileBytes} />}

      <section aria-labelledby="media-shares-heading">
        <SectionHeader id="media-shares-heading" title={t.mediaAdmin.sharesHeading} />
        {list.data && list.data.shares.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-6 w-6" aria-hidden="true" />}
            title={t.mediaAdmin.noShares}
            description={t.mediaAdmin.noSharesBody}
          />
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {list.data?.shares.map((share) => <ShareRow key={share.id} share={share} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creating a share

type ItemStatus = "waiting" | "preparing" | "uploading" | "done" | "failed";

interface Item {
  key: string;
  file: File;
  status: ItemStatus;
  progress: number;
  /** Set when the file is refused before any upload. */
  problem?: string;
  removedMetadata?: boolean;
}

type Phase =
  | { name: "form" }
  | { name: "uploading" }
  | { name: "partial"; shareId: number; failed: number; total: number }
  | { name: "published"; link: string | null; expiresAt: string | null };

function CreateShare({ maxFileBytes }: { maxFileBytes: number }) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [formError, setFormError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const shareId = useRef<number | null>(null);

  const schema = useMemo(() => z.object({
    title: z.string().trim().min(1, t.mediaAdmin.titleLabel).max(MEDIA_TITLE_MAX),
    description: z.string().max(MEDIA_DESCRIPTION_MAX),
    expiresInDays: z.string(),
    pin: z.string().refine((pin) => pin === "" || MEDIA_NEW_PIN_PATTERN.test(pin), t.mediaAdmin.pinInvalid),
  }), [t]);
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", expiresInDays: String(MEDIA_DEFAULT_LIFETIME_DAYS), pin: "" },
  });

  // An upload in progress dies with the tab; say so before it is closed.
  useEffect(() => {
    if (phase.name !== "uploading") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t.mediaAdmin.leaveWarning;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase.name, t]);

  const update = (key: string, change: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    setItems((current) => [
      ...current,
      ...chosen.map((file, index) => {
        const mime = normalizeMediaMime(file.type, file.name);
        const problem = !mime || !mediaKind(mime)
          ? t.mediaAdmin.unsupported
          : file.size > maxFileBytes ? t.mediaAdmin.tooLarge : undefined;
        return { key: `${Date.now()}-${index}-${file.name}`, file, status: "waiting" as const, progress: 0, problem };
      }),
    ]);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });

  const publish = async (id: number) => {
    const res = await apiRequest("POST", "/api/media?action=publish", { id });
    const body = await res.json() as { share: MediaShareSummary; link: string | null };
    setPhase({ name: "published", link: body.link, expiresAt: body.share?.expiresAt ?? null });
    form.reset();
    setItems([]);
    refresh();
  };

  const discard = async (id: number) => {
    await apiRequest("DELETE", `/api/media?id=${id}`).catch(() => undefined);
    refresh();
  };

  const failWith = (error: unknown) => {
    const code = errorCode(error);
    toast({
      title: code === "STORAGE_QUOTA" ? t.mediaAdmin.quotaReached : t.mediaAdmin.errorGeneric,
      variant: "destructive",
    });
  };

  const submit = form.handleSubmit(async (values) => {
    const uploadable = items.filter((item) => !item.problem);
    if (uploadable.length === 0) {
      setFormError(t.mediaAdmin.noFilesChosen);
      return;
    }
    setFormError(null);
    setPhase({ name: "uploading" });
    abort.current = new AbortController();

    let id: number;
    try {
      const res = await apiRequest("POST", "/api/media?action=create", {
        title: values.title,
        description: values.description,
        expiresInDays: Number(values.expiresInDays),
        pin: values.pin || undefined,
      });
      id = ((await res.json()) as { share: MediaShareSummary }).share.id;
      shareId.current = id;
    } catch (error) {
      failWith(error);
      setPhase({ name: "form" });
      return;
    }

    // One file at a time: a large video already uploads three parts at once,
    // and a phone on mobile data does not gain from more.
    let failed = 0;
    for (const [position, item] of uploadable.entries()) {
      if (abort.current.signal.aborted) break;
      try {
        update(item.key, { status: "preparing", progress: 0 });
        const media = await prepareMedia(item.file);
        update(item.key, { status: "uploading", removedMetadata: media.removedMetadata });
        await uploadMedia({
          shareId: id,
          media,
          position,
          signal: abort.current.signal,
          onProgress: (progress) => update(item.key, { progress }),
        });
        update(item.key, { status: "done", progress: 1 });
      } catch (error) {
        failed += 1;
        const code = errorCode(error);
        update(item.key, {
          status: "failed",
          problem: code === "UNREADABLE" ? t.mediaAdmin.unreadable
            : code === "UNSUPPORTED_TYPE" ? t.mediaAdmin.unsupported
            : code === "FILE_TOO_LARGE" ? t.mediaAdmin.tooLarge
            : code === "STORAGE_QUOTA" ? t.mediaAdmin.quotaReached
            : t.mediaAdmin.failed,
        });
        if (code === "STORAGE_QUOTA") break;
      }
    }

    if (abort.current.signal.aborted) {
      await discard(id);
      setPhase({ name: "form" });
      return;
    }
    try {
      if (failed === uploadable.length) {
        await discard(id);
        toast({ title: t.mediaAdmin.allFailed, variant: "destructive" });
        setPhase({ name: "form" });
      } else if (failed > 0) {
        setPhase({ name: "partial", shareId: id, failed, total: uploadable.length });
      } else {
        await publish(id);
      }
    } catch (error) {
      failWith(error);
      setPhase({ name: "partial", shareId: id, failed, total: uploadable.length });
    }
  });

  if (phase.name === "published") {
    return (
      <Surface tone="raised" className="p-6" role="status">
        <p className="flex items-center gap-2 text-h4 font-semibold text-ink">
          <CheckCircle2 className="h-6 w-6 text-brand" aria-hidden="true" />
          {t.mediaAdmin.publishedTitle}
        </p>
        <p className="mt-2 text-copy">
          {fill(t.mediaAdmin.publishedBody, { date: formatDate(phase.expiresAt, language) })}
        </p>
        {phase.link && <LinkBox link={phase.link} />}
        <Button variant="outline" className="mt-6" onClick={() => setPhase({ name: "form" })}>
          {t.mediaAdmin.newAnother}
        </Button>
      </Surface>
    );
  }

  const busy = phase.name === "uploading";
  const { errors } = form.formState;

  return (
    <section aria-labelledby="media-new-heading">
      <SectionHeader id="media-new-heading" title={t.mediaAdmin.newShare} />
      <Surface className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="media-title">{t.mediaAdmin.titleLabel}</Label>
            <Input id="media-title" maxLength={MEDIA_TITLE_MAX} disabled={busy} aria-invalid={!!errors.title || undefined} {...form.register("title")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="media-description">{t.mediaAdmin.descriptionLabel}</Label>
            <Textarea id="media-description" rows={3} maxLength={MEDIA_DESCRIPTION_MAX} disabled={busy} {...form.register("description")} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="media-lifetime">{t.mediaAdmin.lifetimeLabel}</Label>
              <Select
                value={form.watch("expiresInDays")}
                onValueChange={(value) => form.setValue("expiresInDays", value)}
                disabled={busy}
              >
                <SelectTrigger id="media-lifetime"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFETIME_CHOICES.map((days) => (
                    <SelectItem key={days} value={String(days)}>{fill(t.mediaAdmin.days, { n: days })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-pin">{t.mediaAdmin.pinLabel}</Label>
              <Input
                id="media-pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                disabled={busy}
                aria-describedby="media-pin-help"
                aria-invalid={!!errors.pin || undefined}
                {...form.register("pin", { setValueAs: (value: string) => value.replace(/\D/g, "") })}
              />
              <p id="media-pin-help" className={`text-small ${errors.pin ? "font-semibold text-cat-stengt-text" : "text-subtle"}`}>
                {errors.pin?.message ?? t.mediaAdmin.pinHelp}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-small font-semibold text-ink" id="media-files-label">{t.mediaAdmin.filesLabel}</p>
            <p className="text-small text-subtle" id="media-files-help">
              {fill(t.mediaAdmin.filesHelp, { max: formatFileSize(maxFileBytes, language) })}
            </p>
            <Label
              htmlFor="media-files"
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-token border border-primary px-4 font-semibold text-brand hover:bg-green-50 focus-within:ring-[3px] focus-within:ring-ring ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t.mediaAdmin.chooseFiles}
              <input
                id="media-files"
                type="file"
                multiple
                accept={MEDIA_ACCEPT}
                onChange={addFiles}
                disabled={busy}
                aria-describedby="media-files-help"
                className="sr-only"
              />
            </Label>
            {items.length > 0 && (
              <ul className="mt-3 divide-y divide-hairline rounded-card border border-hairline" aria-live="polite">
                {items.map((item) => (
                  <FileRow
                    key={item.key}
                    item={item}
                    onRemove={busy ? undefined : () => setItems((current) => current.filter((other) => other.key !== item.key))}
                  />
                ))}
              </ul>
            )}
            {formError && <p role="alert" className="text-small font-semibold text-cat-stengt-text">{formError}</p>}
          </div>

          {phase.name === "partial" ? (
            <InfoBanner
              tone="alert"
              role="alert"
              icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
              title={t.mediaAdmin.partialTitle}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => publish(phase.shareId).catch(failWith)}>{t.mediaAdmin.publishAnyway}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await discard(phase.shareId);
                      setItems((current) => current.map((item) => ({ ...item, status: "waiting", progress: 0 })));
                      setPhase({ name: "form" });
                    }}
                  >
                    {t.mediaAdmin.discardDraft}
                  </Button>
                </div>
              }
            >
              {fill(t.mediaAdmin.partialBody, { failed: phase.failed, total: phase.total })}
            </InfoBanner>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="mr-2 h-4 w-4" aria-hidden="true" />}
                {busy ? t.mediaAdmin.uploading : t.mediaAdmin.submit}
              </Button>
              {busy && (
                <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>
                  {t.common.cancel}
                </Button>
              )}
            </div>
          )}
        </form>
      </Surface>
    </section>
  );
}

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const;

function FileRow({ item, onRemove }: { item: Item; onRemove?: () => void }) {
  const { t, language } = useLanguage();
  const kind = mediaKind(normalizeMediaMime(item.file.type, item.file.name) ?? "");
  const Icon = kind ? KIND_ICON[kind] : AlertTriangle;
  const label = item.problem
    ?? (item.status === "waiting" ? t.mediaAdmin.waiting
      : item.status === "preparing" ? t.mediaAdmin.preparing
      : item.status === "uploading" ? `${t.mediaAdmin.uploading} ${Math.round(item.progress * 100)} %`
      : item.status === "done" ? t.mediaAdmin.done
      : t.mediaAdmin.failed);
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Icon className={`h-5 w-5 shrink-0 ${item.problem ? "text-cat-stengt-text" : "text-brand"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-ink">{item.file.name}</p>
        <p className={`text-micro ${item.problem ? "font-semibold text-cat-stengt-text" : "text-subtle"}`}>
          {formatFileSize(item.file.size, language)} · {label}
          {item.removedMetadata && ` · ${t.mediaAdmin.metadataRemoved}`}
        </p>
        {(item.status === "uploading" || item.status === "done") && (
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-pill bg-green-50"
            role="progressbar"
            aria-label={item.file.name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(item.progress * 100)}
          >
            <div className="h-full bg-brand transition-[width] duration-micro" style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-token text-subtle hover:bg-green-50 hover:text-ink"
          aria-label={fill(t.mediaAdmin.removeFile, { name: item.file.name })}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function LinkBox({ link }: { link: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t.mediaAdmin.linkCopied });
    } catch {
      toast({ title: t.mediaAdmin.copyFailed, variant: "destructive" });
    }
  };
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={link} aria-label={t.mediaAdmin.copyLink} onFocus={(event) => event.currentTarget.select()} className="font-mono text-small" />
      <div className="flex gap-2">
        <Button type="button" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.mediaAdmin.copyLink}
        </Button>
        <Button asChild variant="outline" className="whitespace-nowrap">
          <a href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t.mediaAdmin.openShare}</span>
          </a>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The list

function ShareRow({ share }: { share: MediaShareSummary }) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [extendOpen, setExtendOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [extendBy, setExtendBy] = useState(String(EXTENSION_CHOICES[0]));
  const refresh = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });
  const active = share.status === "published" && !share.expired;

  const copy = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/media?action=link&id=${share.id}`);
      const { link } = (await res.json()) as { link: string };
      await navigator.clipboard.writeText(link);
    },
    onSuccess: () => toast({ title: t.mediaAdmin.linkCopied }),
    onError: () => toast({ title: t.mediaAdmin.copyFailed, variant: "destructive" }),
  });

  const extend = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/media?action=extend", { id: share.id, days: Number(extendBy) });
      return (await res.json()) as { share: MediaShareSummary; capped: boolean };
    },
    onSuccess: ({ share: next, capped }) => {
      const date = formatDate(next.expiresAt, language);
      toast({ title: fill(capped ? t.mediaAdmin.extendedCapped : t.mediaAdmin.extended, { date }) });
      setExtendOpen(false);
      refresh();
    },
    onError: (error) => toast({
      title: errorCode(error) === "MAX_LIFETIME" ? t.mediaAdmin.atMaxLifetime : t.mediaAdmin.errorGeneric,
      variant: "destructive",
    }),
  });

  const revoke = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/media?id=${share.id}`),
    onSuccess: () => {
      toast({ title: t.mediaAdmin.revoked });
      refresh();
    },
    onError: () => toast({ title: t.mediaAdmin.errorGeneric, variant: "destructive" }),
  });

  const status = share.status === "draft"
    ? <StatusPill tone="warn">{t.mediaAdmin.statusDraft}</StatusPill>
    : share.expired
      ? <StatusPill tone="warn">{t.mediaAdmin.statusExpired}</StatusPill>
      : <StatusPill tone="now">{t.mediaAdmin.statusActive}</StatusPill>;

  const expires = share.expiresAt
    ? fill(share.expired ? t.mediaAdmin.expiredOn : t.mediaAdmin.expiresOn, { date: formatDate(share.expiresAt, language) })
    : null;
  const files = share.fileCount === 1 ? t.mediaAdmin.fileOne : fill(t.mediaAdmin.fileMany, { n: share.fileCount });

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{share.title}</p>
          {status}
          {share.hasPin && (
            <StatusPill>
              <KeyRound className="h-3 w-3" aria-hidden="true" />
              {t.mediaAdmin.hasPin}
            </StatusPill>
          )}
        </div>
        <p className="mt-1 text-small text-subtle">
          {[files, formatFileSize(share.totalBytes, language), expires].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {active && (
          <Button type="button" variant="outline" size="sm" onClick={() => copy.mutate()} disabled={copy.isPending}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.mediaAdmin.copyLink}
          </Button>
        )}
        {share.status === "published" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setExtendOpen(true)}>
            {t.mediaAdmin.extend}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setRevokeOpen(true)} disabled={revoke.isPending}>
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.mediaAdmin.revoke}
        </Button>
      </div>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.mediaAdmin.extendTitle}</DialogTitle>
            <DialogDescription>
              {fill(t.mediaAdmin.extendBody, { date: formatDate(share.maxExpiresAt, language) })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`extend-${share.id}`}>{t.mediaAdmin.extendBy}</Label>
            <Select value={extendBy} onValueChange={setExtendBy}>
              <SelectTrigger id={`extend-${share.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXTENSION_CHOICES.map((days) => (
                  <SelectItem key={days} value={String(days)}>{fill(t.mediaAdmin.days, { n: days })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExtendOpen(false)}>{t.common.cancel}</Button>
            <Button type="button" onClick={() => extend.mutate()} disabled={extend.isPending}>{t.mediaAdmin.extendConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fill(t.mediaAdmin.revokeTitle, { title: share.title })}</AlertDialogTitle>
            <AlertDialogDescription>{t.mediaAdmin.revokeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revoke.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.mediaAdmin.revokeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
