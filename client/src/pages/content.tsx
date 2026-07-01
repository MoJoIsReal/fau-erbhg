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
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [posts, setPosts] = useState<Partial<BlogPost>[]>([]);
  const [isEditingPost, setIsEditingPost] = useState<number | null>(null);

  usePageMeta({
    title: language === "no" ? "Innhold" : "Content",
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
    setPosts([
      {
        title: "",
        content: "",
        status: "published",
        category: "news",
        publishedDate: new Date().toISOString().split("T")[0],
      },
      ...posts,
    ]);
    setIsEditingPost(0);
  };

  const updatePost = (index: number, field: keyof BlogPost, value: string) => {
    const updated = [...posts];
    updated[index] = { ...updated[index], [field]: value };
    setPosts(updated);
  };

  const savePost = async (index: number) => {
    const post = posts[index];
    if (!post.title || !post.content) {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Tittel og innhold er påkrevd" : "Title and content are required",
      });
      return;
    }

    try {
      if (post.id) {
        await updatePostMutation.mutateAsync({ id: post.id, post });
      } else {
        await createPostMutation.mutateAsync(post);
      }

      await invalidateBlogPostQueries();
      setIsEditingPost(null);
      toast({
        title: language === "no" ? "Lagret!" : "Saved!",
        description: language === "no" ? "Innlegget er lagret" : "Post has been saved",
      });
    } catch {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke lagre innlegg" : "Could not save post",
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
        title: language === "no" ? "Oppdatert!" : "Updated!",
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
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke oppdatere innlegg" : "Could not update post",
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
        title: language === "no" ? "Oppdatert!" : "Updated!",
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
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke oppdatere innlegg" : "Could not update post",
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
          title: language === "no" ? "Slettet!" : "Deleted!",
          description: language === "no" ? "Innlegget ble slettet" : "Post was deleted",
        });
      } catch {
        toast({
          variant: "destructive",
          title: language === "no" ? "Feil" : "Error",
          description: language === "no" ? "Kunne ikke slette innlegg" : "Could not delete post",
        });
      }
    } else {
      setPosts(posts.filter((_, i) => i !== index));
      setIsEditingPost(null);
    }
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
            {language === "no" ? "Aktuelt / Innlegg" : "Updates / Posts"}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
            {language === "no"
              ? "Administrer nyheter, tips og informasjon som vises på nettsiden. Arkiver gamle innlegg for å skjule dem."
              : "Manage news, tips and information displayed on the website. Archive old posts to hide them."}
          </p>

          <Button onClick={addNewPost} className="mb-6" variant="default">
            <Plus className="h-4 w-4 mr-2" />
            {language === "no" ? "Nytt innlegg" : "New post"}
          </Button>

          <div className="space-y-6">
            {posts.map((post, index) => (
              <Card key={post.id || `new-${index}`} className={`p-4 ${post.status === "archived" ? "bg-gray-50 dark:bg-neutral-900/70 opacity-75" : ""}`}>
                {isEditingPost === index ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`post-title-${index}`}>{language === "no" ? "Tittel" : "Title"}</Label>
                      <Input
                        id={`post-title-${index}`}
                        value={post.title || ""}
                        onChange={(e) => updatePost(index, "title", e.target.value)}
                        placeholder={language === "no" ? "Tittel på innlegget" : "Post title"}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-content-${index}`}>{language === "no" ? "Innhold" : "Content"}</Label>
                      <RichTextEditor
                        content={post.content || ""}
                        onChange={(content) => updatePost(index, "content", content)}
                        placeholder={language === "no" ? "Skriv innlegget her..." : "Write your post here..."}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-category-${index}`}>{language === "no" ? "Kategori" : "Category"}</Label>
                      <Select value={post.category || "news"} onValueChange={(value) => updatePost(index, "category", value)}>
                        <SelectTrigger id={`post-category-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="news">{language === "no" ? "Nyheter" : "News"}</SelectItem>
                          <SelectItem value="tips">{language === "no" ? "Tips & triks" : "Tips & Tricks"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`post-date-${index}`}>{language === "no" ? "Publiseringsdato" : "Publish date"}</Label>
                      <Input
                        id={`post-date-${index}`}
                        type="date"
                        value={post.publishedDate || ""}
                        onChange={(e) => updatePost(index, "publishedDate", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-author-${index}`}>{language === "no" ? "Skrevet av" : "Written by"}</Label>
                      <Select value={post.author || ""} onValueChange={(value) => updatePost(index, "author", value)}>
                        <SelectTrigger id={`post-author-${index}`}>
                          <SelectValue placeholder={language === "no" ? "Velg forfatter" : "Select author"} />
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
                        {language === "no" ? "Lagre" : "Save"}
                      </Button>
                      <Button onClick={() => setIsEditingPost(null)} variant="outline" size="sm">
                        {language === "no" ? "Avbryt" : "Cancel"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="ml-auto">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {language === "no" ? "Slett" : "Delete"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{language === "no" ? "Slette blogginnlegg?" : "Delete blog post?"}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {language === "no"
                                ? `Dette sletter "${post.title || "innlegget"}" permanent.`
                                : `This permanently deletes "${post.title || "this post"}".`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{language === "no" ? "Avbryt" : "Cancel"}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePost(index)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {language === "no" ? "Slett" : "Delete"}
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
                        {post.title || (language === "no" ? "(Uten tittel)" : "(No title)")}
                      </h3>

                      <div className="hidden sm:flex gap-2 flex-shrink-0">
                        <Button onClick={() => setIsEditingPost(index)} variant="outline" size="sm">
                          {language === "no" ? "Rediger" : "Edit"}
                        </Button>
                        {post.id && post.status === "published" && (
                          <Button onClick={() => toggleHomepage(index)} variant="outline" size="sm">
                            <Home className="h-4 w-4 mr-2" />
                            {post.showOnHomepage
                              ? language === "no" ? "Fjern fra hjem" : "Remove from home"
                              : language === "no" ? "Vis på hjem" : "Show on home"}
                          </Button>
                        )}
                        {post.id && (
                          <Button onClick={() => archivePost(index)} variant="outline" size="sm">
                            <Archive className="h-4 w-4 mr-2" />
                            {post.status === "archived"
                              ? language === "no" ? "Publiser" : "Publish"
                              : language === "no" ? "Arkiver" : "Archive"}
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
                            <DropdownMenuItem onClick={() => setIsEditingPost(index)}>
                              {language === "no" ? "Rediger" : "Edit"}
                            </DropdownMenuItem>
                            {post.id && post.status === "published" && (
                              <DropdownMenuItem onClick={() => toggleHomepage(index)}>
                                <Home className="h-4 w-4 mr-2" />
                                {post.showOnHomepage
                                  ? language === "no" ? "Fjern fra hjem" : "Remove from home"
                                  : language === "no" ? "Vis på hjem" : "Show on home"}
                              </DropdownMenuItem>
                            )}
                            {post.id && (
                              <DropdownMenuItem onClick={() => archivePost(index)}>
                                <Archive className="h-4 w-4 mr-2" />
                                {post.status === "archived"
                                  ? language === "no" ? "Publiser" : "Publish"
                                  : language === "no" ? "Arkiver" : "Archive"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                      <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {(post.category || "news") === "tips"
                          ? language === "no" ? "Tips & triks" : "Tips & Tricks"
                          : language === "no" ? "Nyheter" : "News"}
                      </span>
                      {post.publishedDate &&
                        new Date(post.publishedDate).toLocaleDateString(language === "no" ? "no-NO" : "en-US")}
                      {post.author && <span className="ml-2">- {language === "no" ? "av" : "by"} {post.author}</span>}
                      {post.status === "archived" && (
                        <span className="ml-2 text-xs font-semibold text-orange-600">
                          ({language === "no" ? "ARKIVERT" : "ARCHIVED"})
                        </span>
                      )}
                    </p>
                    <SafeHtml
                      html={post.content}
                      className="prose prose-sm prose-neutral max-w-none line-clamp-3 text-neutral-700 dark:text-neutral-300"
                    />
                  </div>
                )}
              </Card>
            ))}

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
    </div>
  );
}
