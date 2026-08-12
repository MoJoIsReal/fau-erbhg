import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Home, Loader2, MoreVertical, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RichTextEditor from "@/components/RichTextEditor";
import SafeHtml from "@/components/safe-html";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { usePageMeta } from "@/hooks/usePageMeta";
import { apiRequest } from "@/lib/queryClient";
import type { FauBoardMember } from "@shared/schema";

interface BlogPost {
  id?: number;
  title: string;
  content: string;
  status: "published" | "archived";
  category: "news" | "tips";
  publishedDate: string;
  author?: string;
  showOnHomepage?: boolean;
}

export default function Content() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [posts, setPosts] = useState<Partial<BlogPost>[]>([]);
  // Edit state keys off the post id ("new" for an unsaved draft), not the
  // array index — refetched data used to be able to shift indexes mid-edit
  // and silently swap which post you were editing.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [postDraft, setPostDraft] = useState<Partial<BlogPost> | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "archived">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<number | null>(null);

  const postKey = (post: Partial<BlogPost>) => (post.id ? String(post.id) : "new");

  usePageMeta({
    title: t.contentPage.content,
    description:
      language === "no"
        ? "Administrer nyheter, aktuelt og tips som vises på siden."
        : "Manage news, updates and tips displayed on the site.",
    path: "/content",
  });

  const { data: boardMembers } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

  const { data: blogPosts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"],
  });

  useEffect(() => {
    if (blogPosts) {
      setPosts(blogPosts);
    }
  }, [blogPosts]);

  const invalidateBlogPostQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&category=news"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&category=tips"] }),
    ]);
  };

  const createPostMutation = useMutation({
    mutationFn: async (post: Partial<BlogPost>) => {
      const res = await apiRequest("POST", "/api/secure-settings?resource=blog-posts", post);
      return res.json();
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, post }: { id: number; post: Partial<BlogPost> }) => {
      const res = await apiRequest("PUT", `/api/secure-settings?resource=blog-posts&id=${id}`, post);
      return res.json();
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/secure-settings?resource=blog-posts&id=${id}`);
      return res.json();
    },
  });

  const addNewPost = () => {
    const draft: Partial<BlogPost> = {
      title: "",
      content: "",
      status: "published",
      category: "news",
      publishedDate: new Date().toISOString().split("T")[0],
    };
    setPosts([
      draft,
      ...posts,
    ]);
    setEditingKey("new");
    setPostDraft({ ...draft });
  };

  const updatePost = (index: number, field: keyof BlogPost, value: string) => {
    setPostDraft((current) => ({
      ...(current ?? posts[index] ?? {}),
      [field]: value,
    }));
  };

  const startEditingPost = (index: number) => {
    setEditingKey(postKey(posts[index] ?? {}));
    setPostDraft({ ...(posts[index] ?? {}) });
  };

  const cancelEditingPost = () => {
    if (editingKey === "new") {
      setPosts((current) => current.filter((post) => post.id));
    }
    setEditingKey(null);
    setPostDraft(null);
  };

  const savePost = async (index: number) => {
    const post = postDraft ?? posts[index];
    if (!post.title || !post.content) {
      toast({
        variant: "destructive",
        title: t.contentPage.error,
        description: t.contentPage.titleContentRequired,
      });
      return;
    }

    try {
      let savedPost: BlogPost;
      if (post.id) {
        savedPost = await updatePostMutation.mutateAsync({ id: post.id, post });
      } else {
        savedPost = await createPostMutation.mutateAsync(post);
      }

      setPosts((current) => current.map((item, itemIndex) => itemIndex === index ? savedPost : item));
      await invalidateBlogPostQueries();
      setEditingKey(null);
      setPostDraft(null);
      toast({
        title: t.contentPage.saved,
        description: t.contentPage.postHasBeenSaved,
      });
    } catch {
      toast({
        variant: "destructive",
        title: t.contentPage.error,
        description: t.contentPage.couldNotSavePost,
      });
    }
  };

  const archivePost = async (index: number) => {
    const post = posts[index];
    if (!post.id) return;

    try {
      await updatePostMutation.mutateAsync({
        id: post.id,
        post: { ...post, status: post.status === "archived" ? "published" : "archived" },
      });
      await invalidateBlogPostQueries();
      toast({
        title: t.contentPage.updated,
        description:
          post.status === "archived"
            ? language === "no"
              ? "Innlegget er publisert"
              : "Post has been published"
            : language === "no"
            ? "Innlegget er arkivert"
            : "Post has been archived",
      });
    } catch {
      toast({
        variant: "destructive",
        title: t.contentPage.error,
        description: t.contentPage.couldNotUpdatePost,
      });
    }
  };

  const toggleHomepage = async (index: number) => {
    const post = posts[index];
    if (!post.id) return;

    try {
      await updatePostMutation.mutateAsync({
        id: post.id,
        post: { ...post, showOnHomepage: !post.showOnHomepage },
      });
      await invalidateBlogPostQueries();
      toast({
        title: t.contentPage.updated,
        description:
          post.showOnHomepage
            ? language === "no"
              ? "Innlegget er fjernet fra forsiden"
              : "Post removed from homepage"
            : language === "no"
            ? "Innlegget vises på forsiden"
            : "Post will show on homepage",
      });
    } catch {
      toast({
        variant: "destructive",
        title: t.contentPage.error,
        description: t.contentPage.couldNotUpdatePost,
      });
    }
  };

  const deletePost = async (index: number) => {
    const post = posts[index];
    if (post.id) {
      try {
        await deletePostMutation.mutateAsync(post.id);
        await invalidateBlogPostQueries();
        toast({
          title: t.contentPage.deleted,
          description: t.contentPage.postWasDeleted,
        });
      } catch {
        toast({
          variant: "destructive",
          title: t.contentPage.error,
          description: t.contentPage.couldNotDeletePost,
        });
      }
    } else {
      setPosts(posts.filter((_, i) => i !== index));
      setEditingKey(null);
      setPostDraft(null);
    }
    setDeleteCandidate(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-50 mb-2">
            {t.contentPage.updatesPosts}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
            {language === "no"
              ? "Administrer nyheter, tips og informasjon som vises på nettsiden. Arkiver gamle innlegg for å skjule dem."
              : "Manage news, tips and information displayed on the website. Archive old posts to hide them."}
          </p>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Button onClick={addNewPost} variant="default" disabled={editingKey === "new"}>
              <Plus className="h-4 w-4 mr-2" />
              {t.contentPage.newPost}
            </Button>
            <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 p-1" role="group" aria-label={t.contentPage.filterByStatus}>
              {([
                ["all", t.contentPage.all],
                ["published", t.contentPage.published],
                ["archived", t.contentPage.archived],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant={statusFilter === value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={statusFilter === value}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.contentPage.searchTitles}
              className="w-full sm:w-56"
              aria-label={t.contentPage.searchTitles2}
            />
          </div>

          <div className="space-y-6">
            {posts.map((post, index) => {
              const isEditingThis = editingKey !== null && editingKey === postKey(post);
              const editablePost = isEditingThis && postDraft ? postDraft : post;
              // Filters hide non-matching posts instead of removing them from
              // state, so indexes passed to the handlers stay valid.
              const matchesStatus = statusFilter === "all" || (post.status ?? "published") === statusFilter;
              const matchesSearch = !searchTerm.trim() ||
                (post.title ?? "").toLowerCase().includes(searchTerm.trim().toLowerCase());
              if (!isEditingThis && (!matchesStatus || !matchesSearch)) return null;
              return (
              <Card key={post.id || `new-${index}`} className={`p-4 ${post.status === "archived" ? "bg-gray-50 dark:bg-neutral-900/70 opacity-75" : ""}`}>
                {isEditingThis ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`post-title-${index}`}>{t.contentPage.title}</Label>
                      <Input
                        id={`post-title-${index}`}
                        value={editablePost.title || ""}
                        onChange={(e) => updatePost(index, "title", e.target.value)}
                        placeholder={t.contentPage.postTitle}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-content-${index}`}>{t.contentPage.content}</Label>
                      <RichTextEditor
                        content={editablePost.content || ""}
                        onChange={(content) => updatePost(index, "content", content)}
                        placeholder={t.contentPage.writeYourPostHere}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-category-${index}`}>{t.contentPage.category}</Label>
                      <Select value={editablePost.category || "news"} onValueChange={(value) => updatePost(index, "category", value)}>
                        <SelectTrigger id={`post-category-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="news">{t.contentPage.news}</SelectItem>
                          <SelectItem value="tips">{t.contentPage.tipsTricks}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`post-date-${index}`}>{t.contentPage.publishDate}</Label>
                      <Input
                        id={`post-date-${index}`}
                        type="date"
                        value={editablePost.publishedDate || ""}
                        onChange={(e) => updatePost(index, "publishedDate", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-author-${index}`}>{t.contentPage.writtenBy}</Label>
                      <Select value={editablePost.author || ""} onValueChange={(value) => updatePost(index, "author", value)}>
                        <SelectTrigger id={`post-author-${index}`}>
                          <SelectValue placeholder={t.contentPage.selectAuthor} />
                        </SelectTrigger>
                        <SelectContent>
                          {boardMembers?.map((member) => (
                            <SelectItem key={member.id} value={member.name}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => savePost(index)} size="sm">
                        <Save className="h-4 w-4 mr-2" />
                        {t.contentPage.save}
                      </Button>
                      <Button onClick={cancelEditingPost} variant="outline" size="sm">
                        {t.contentPage.cancel}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="ml-auto">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t.contentPage.delete}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.contentPage.deleteBlogPost}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {language === "no"
                                ? `Dette sletter "${editablePost.title || "innlegget"}" permanent.`
                                : `This permanently deletes "${editablePost.title || "this post"}".`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.contentPage.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePost(index)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t.contentPage.delete}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex-1 pr-2">
                        {post.title || (t.contentPage.noTitle)}
                      </h3>

                      <div className="hidden sm:flex gap-2 flex-shrink-0">
                        <Button onClick={() => startEditingPost(index)} variant="outline" size="sm">
                          {t.contentPage.edit}
                        </Button>
                        {post.id && post.status === "published" && (
                          <Button onClick={() => toggleHomepage(index)} variant="outline" size="sm">
                            <Home className="h-4 w-4 mr-2" />
                            {post.showOnHomepage
                              ? t.contentPage.removeFromHome
                              : t.contentPage.showHome}
                          </Button>
                        )}
                        {post.id && (
                          <Button onClick={() => archivePost(index)} variant="outline" size="sm">
                            <Archive className="h-4 w-4 mr-2" />
                            {post.status === "archived"
                              ? t.contentPage.publish
                              : t.contentPage.archive}
                          </Button>
                        )}
                        {post.id && (
                          <Button
                            onClick={() => setDeleteCandidate(index)}
                            variant="outline"
                            size="sm"
                            className="border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t.contentPage.delete}
                          </Button>
                        )}
                      </div>

                      <div className="sm:hidden flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => startEditingPost(index)}>
                              {t.contentPage.edit}
                            </DropdownMenuItem>
                            {post.id && post.status === "published" && (
                              <DropdownMenuItem onClick={() => toggleHomepage(index)}>
                                <Home className="h-4 w-4 mr-2" />
                                {post.showOnHomepage
                                  ? t.contentPage.removeFromHome
                                  : t.contentPage.showHome}
                              </DropdownMenuItem>
                            )}
                            {post.id && (
                              <DropdownMenuItem onClick={() => archivePost(index)}>
                                <Archive className="h-4 w-4 mr-2" />
                                {post.status === "archived"
                                  ? t.contentPage.publish
                                  : t.contentPage.archive}
                              </DropdownMenuItem>
                            )}
                            {post.id && (
                              <DropdownMenuItem
                                onClick={() => setDeleteCandidate(index)}
                                className="text-red-600 dark:text-red-300 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t.contentPage.delete}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                      <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {(post.category || "news") === "tips"
                          ? t.contentPage.tipsTricks
                          : t.contentPage.news}
                      </span>
                      {post.publishedDate &&
                        new Date(post.publishedDate).toLocaleDateString(language === "no" ? "no-NO" : "en-US")}
                      {post.author && <span className="ml-2">- {t.contentPage.by} {post.author}</span>}
                      {post.status === "archived" && (
                        <span className="ml-2 text-xs font-semibold text-orange-600">
                          ({t.contentPage.archived2})
                        </span>
                      )}
                    </p>
                    {/* Text-only excerpt: a post that opens with a poster image
                        used to render it at full height in the admin list. */}
                    <SafeHtml
                      html={post.content}
                      truncate={250}
                      className="prose prose-sm prose-neutral max-w-none text-neutral-700 dark:text-neutral-300"
                    />
                  </div>
                )}
              </Card>
              );
            })}

            {posts.length === 0 && (
              <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                {language === "no"
                  ? "Ingen innlegg ennå. Klikk 'Nytt innlegg' for å komme i gang."
                  : "No posts yet. Click 'New post' to get started."}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Shared confirm dialog for deleting from view mode (desktop buttons
          and the mobile action menu both set deleteCandidate). */}
      <AlertDialog open={deleteCandidate !== null} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.contentPage.deletePost}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "no"
                ? `Dette sletter "${(deleteCandidate !== null && posts[deleteCandidate]?.title) || "innlegget"}" permanent.`
                : `This permanently deletes "${(deleteCandidate !== null && posts[deleteCandidate]?.title) || "this post"}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.contentPage.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteCandidate !== null) deletePost(deleteCandidate); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.contentPage.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
