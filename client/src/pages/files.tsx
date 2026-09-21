import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Download,
  FileIcon,
  FileSpreadsheet,
  FileText,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import FileUploadModal from "@/components/file-upload-modal";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatFileSize } from "@/lib/i18n";
import PageHero from "@/components/site/page-hero";
import { ILLUSTRATION_DOCUMENTS } from "@/components/site/illustrations";
import { Surface, EmptyState } from "@/components/site/section";
import { FilterChip } from "@/components/site/controls";
import { EditorSurface } from "@/components/site/cards";
import type { Document } from "@shared/schema";

// Images uploaded from inside the rich-text editor are stored as documents
// under the "editor-image" category with a raw Cloudinary filename. They are
// not archive documents, so they never appear here; these three categories
// are the whole public list.
const CATEGORY_IDS = ["protokoll", "vedtekter", "budsjett"] as const;
type CategoryId = (typeof CATEGORY_IDS)[number];

/** A short, readable file type from a MIME type, plus its icon. */
function fileKind(mimeType: string | null | undefined): { icon: LucideIcon; label: string } {
  const type = mimeType ?? "";
  if (type.includes("pdf")) return { icon: FileText, label: "PDF" };
  if (type.includes("sheet") || type.includes("excel"))
    return { icon: FileSpreadsheet, label: "XLSX" };
  if (type.includes("word")) return { icon: FileIcon, label: "DOCX" };
  if (type.startsWith("image/")) return { icon: FileIcon, label: type.slice(6).toUpperCase() };
  return { icon: FileIcon, label: "FIL" };
}

/**
 * Dokumenter.
 *
 * The old page split one short archive across three equal cards, each showing
 * at most three files behind a "see all" that opened a modal — so finding last
 * month's referat meant guessing a category and then opening a dialog. The
 * guide asks for a compact list with the type and size as metadata and the
 * download as the obvious action (§9, §13), so that is what this is: one list,
 * filterable by category, with every file one click away.
 */
export default function Files() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const { user } = useAuth();
  const canManageDocuments = user?.role === "admin" || user?.role === "member";
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  usePageMeta({
    title: t.documents.title,
    description:
      language === "no"
        ? "Last ned referater, vedtekter og andre dokumenter fra FAU Erdal Barnehage."
        : "Download minutes, statutes and other documents from FAU Erdal Kindergarten.",
    path: "/files",
  });

  const categories: { id: CategoryId; name: string }[] = [
    { id: "protokoll", name: t.documents.categories.protocol },
    { id: "vedtekter", name: t.documents.categories.regulations },
    { id: "budsjett", name: t.documents.categories.budget },
  ];

  const {
    data: allDocuments = [],
    isLoading,
    error,
  } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: number) => apiRequest("DELETE", `/api/documents?id=${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: t.documents.documentDeleted,
        description: t.documents.documentWasDeletedSuccessfully,
      });
    },
    onError: () => {
      toast({
        title: t.documents.error,
        description:
          language === "no"
            ? "Kunne ikke slette dokumentet. Prøv igjen."
            : "Could not delete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Newest first, and only the three archive categories. Sorted explicitly
  // rather than trusting the order the API happens to return.
  const documents = useMemo(
    () =>
      allDocuments
        .filter((doc) => (CATEGORY_IDS as readonly string[]).includes(doc.category))
        .slice()
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
    [allDocuments],
  );

  const shown =
    category === "all" ? documents : documents.filter((doc) => doc.category === category);
  const countFor = (id: CategoryId) => documents.filter((doc) => doc.category === id).length;
  const categoryName = (id: string) => categories.find((item) => item.id === id)?.name ?? id;

  const deleteButton = (doc: Document) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-subtle hover:bg-destructive/10 hover:text-destructive"
          disabled={deleteDocumentMutation.isPending}
          aria-label={language === "no" ? `Slett ${doc.title}` : `Delete ${doc.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.documents.deleteDocument}</AlertDialogTitle>
          <AlertDialogDescription>
            {language === "no"
              ? `Dette sletter "${doc.title}" fra dokumentlisten.`
              : `This deletes "${doc.title}" from the document list.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.documents.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteDocumentMutation.mutate(doc.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t.documents.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div className="section-rhythm">
      {/* A compact hero: the list below is the page, so the band is shallow
          — but the page still needs an identity of its own, which is the
          blue/slate tone plus its own crop (guide v1.1 §21). */}
      <PageHero
        layout="editorial"
        tone="blue"
        nativeRatio
        priority
        title={t.documents.title}
        lead={t.documents.heroLead}
        illustration={{ art: ILLUSTRATION_DOCUMENTS, alt: "" }}
      />

      {canManageDocuments && (
        <EditorSurface label={t.ui.editorTools}>
          <Button size="sm" onClick={() => setIsUploadModalOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {t.documents.upload}
          </Button>
        </EditorSurface>
      )}

      <section aria-label={t.documents.title}>
        <div className="mb-6 flex flex-wrap items-center gap-2" role="group">
          <FilterChip
            label={t.documents.allCategories}
            pressed={category === "all"}
            onClick={() => setCategory("all")}
            count={documents.length}
          />
          {categories.map((item) => (
            <FilterChip
              key={item.id}
              label={item.name}
              pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              count={countFor(item.id)}
            />
          ))}
        </div>

        {isLoading ? (
          <Surface className="divide-y divide-hairline" aria-busy={true}>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-token bg-green-50" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-green-50" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-green-50" />
                </div>
              </div>
            ))}
          </Surface>
        ) : error ? (
          <EmptyState
            isError
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title={t.documents.error}
            description={error.message}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title={t.documents.noDocuments}
            description={t.documents.noDocumentsDesc}
          />
        ) : (
          <Surface as="ul" className="divide-y divide-hairline">
            {shown.map((doc) => {
              const { icon: Icon, label: kindLabel } = fileKind(doc.mimeType);
              const downloadUrl = `/api/documents?action=download&id=${doc.id}`;
              return (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-start gap-4 p-4 transition-colors duration-micro ease-guide hover:bg-green-50/50 sm:flex-nowrap sm:items-center sm:p-5"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-token bg-green-50 text-brand"
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{doc.title}</p>
                    {/* Category, format, size and date on one metadata line —
                        the four things that tell you whether this is the file
                        you came for (guide §9). */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-subtle">
                      <span>{categoryName(doc.category)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{kindLabel}</span>
                      {doc.fileSize ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatFileSize(doc.fileSize, language)}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <time dateTime={String(doc.uploadedAt)} className="tabular-nums">
                        {formatDate(doc.uploadedAt, language)}
                      </time>
                    </p>
                    {doc.description && (
                      <p className="measure mt-1.5 text-small text-copy">{doc.description}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="outline" size="sm" asChild>
                      {/* A real link rather than a window.open call, so it can
                          be opened in a new tab, copied or saved like any
                          other file. */}
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        // Every row's link reads the same two words otherwise,
                        // so the name always carries the document's title —
                        // at every width, not only where the label is hidden.
                        aria-label={`${t.documents.download} ${doc.title}`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">{t.documents.download}</span>
                      </a>
                    </Button>
                    {canManageDocuments && deleteButton(doc)}
                  </div>
                </li>
              );
            })}
          </Surface>
        )}
      </section>

      <FileUploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
    </div>
  );
}
