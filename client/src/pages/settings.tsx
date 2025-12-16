import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save, Archive, Home } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FauBoardMember } from "@shared/schema";

// Role values stored in database (Norwegian)
const ROLE_VALUES = ["Leder", "Medlem", "Vara"] as const;

// Helper function to get translated role label
function getRoleLabel(role: string, t: any): string {
  switch (role) {
    case "Leder":
      return t.settings.roles.leder;
    case "Medlem":
      return t.settings.roles.medlem;
    case "Vara":
      return t.settings.roles.vara;
    default:
      return role;
  }
}

interface BlogPost {
  id?: number;
  title: string;
  content: string;
  status: "published" | "archived";
  publishedDate: string;
  author?: string;
  showOnHomepage?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface KindergartenInfo {
  id: number;
  contactEmail: string;
  address: string;
  openingHours: string;
  numberOfChildren: number;
  owner: string;
  description: string;
}

export default function Settings() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<Partial<FauBoardMember>[]>([]);

  // Fetch FAU board members
  const { data: boardMembers, isLoading } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

  // Update local state when data loads
  useEffect(() => {
    if (boardMembers) {
      setMembers(boardMembers);
    }
  }, [boardMembers]);

  // Create member
  const createMutation = useMutation({
    mutationFn: async (member: Partial<FauBoardMember>) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/secure-settings?resource=board-members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(member),
      });

      if (!response.ok) throw new Error("Failed to create member");
      return response.json();
    },
  });

  // Update member
  const updateMutation = useMutation({
    mutationFn: async ({ id, member }: { id: number; member: Partial<FauBoardMember> }) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/secure-settings?resource=board-members&id=${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(member),
      });

      if (!response.ok) throw new Error("Failed to update member");
      return response.json();
    },
  });

  // Delete member
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/secure-settings?resource=board-members&id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete member");
      return response.json();
    },
  });

  const addMember = () => {
    setMembers([...members, { name: "", role: "", sortOrder: members.length }]);
  };

  const removeMember = async (index: number) => {
    const member = members[index];
    if (member.id) {
      try {
        await deleteMutation.mutateAsync(member.id);
        await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=board-members"] });
        toast({
          title: language === "no" ? "Slettet!" : "Deleted!",
          description: language === "no" ? "Medlem ble slettet" : "Member was deleted",
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: language === "no" ? "Feil" : "Error",
          description: language === "no" ? "Kunne ikke slette medlem" : "Could not delete member",
        });
      }
    } else {
      // Just remove from local state if not saved yet
      setMembers(members.filter((_, i) => i !== index));
    }
  };

  const updateMember = (index: number, field: keyof FauBoardMember, value: string) => {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    setMembers(updated);
  };

  const handleSave = async () => {
    try {
      for (const member of members) {
        if (!member.name || !member.role) continue;

        if (member.id) {
          // Update existing
          await updateMutation.mutateAsync({ id: member.id, member });
        } else {
          // Create new
          await createMutation.mutateAsync(member);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=board-members"] });

      toast({
        title: language === "no" ? "Lagret!" : "Saved!",
        description: language === "no" ? "Styremedlemmer er lagret" : "Board members have been saved",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke lagre endringer" : "Could not save changes",
      });
    }
  };

  // ===== BLOG POSTS MANAGEMENT =====
  const [posts, setPosts] = useState<Partial<BlogPost>[]>([]);
  const [isEditingPost, setIsEditingPost] = useState<number | null>(null);

  // Fetch blog posts (including archived)
  const { data: blogPosts, isLoading: isLoadingPosts } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"],
  });

  useEffect(() => {
    if (blogPosts) {
      setPosts(blogPosts);
    }
  }, [blogPosts]);

  // Create blog post mutation
  const createPostMutation = useMutation({
    mutationFn: async (post: Partial<BlogPost>) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/secure-settings?resource=blog-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(post),
      });

      if (!response.ok) throw new Error("Failed to create post");
      return response.json();
    },
  });

  // Update blog post mutation
  const updatePostMutation = useMutation({
    mutationFn: async ({ id, post }: { id: number; post: Partial<BlogPost> }) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/secure-settings?resource=blog-posts&id=${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(post),
      });

      if (!response.ok) throw new Error("Failed to update post");
      return response.json();
    },
  });

  // Delete blog post mutation
  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/secure-settings?resource=blog-posts&id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete post");
      return response.json();
    },
  });

  const addNewPost = () => {
    const newPost = {
      title: "",
      content: "",
      status: "published" as const,
      publishedDate: new Date().toISOString().split("T")[0],
    };
    setPosts([newPost, ...posts]);
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

      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"] });
      setIsEditingPost(null);

      toast({
        title: language === "no" ? "Lagret!" : "Saved!",
        description: language === "no" ? "Innlegget er lagret" : "Post has been saved",
      });
    } catch (error) {
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

      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"] });

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
    } catch (error) {
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

      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts"] });

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
    } catch (error) {
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
        await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=blog-posts&includeArchived=true"] });

        toast({
          title: language === "no" ? "Slettet!" : "Deleted!",
          description: language === "no" ? "Innlegget ble slettet" : "Post was deleted",
        });
      } catch (error) {
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

  // ===== KINDERGARTEN INFO MANAGEMENT =====
  const [kindergartenInfo, setKindergartenInfo] = useState<Partial<KindergartenInfo> | null>(null);
  const [isEditingKindergarten, setIsEditingKindergarten] = useState(false);

  // Fetch kindergarten info
  const { data: fetchedKindergartenInfo, isLoading: isLoadingKindergarten } = useQuery<KindergartenInfo>({
    queryKey: ["/api/secure-settings?resource=kindergarten-info"],
  });

  useEffect(() => {
    if (fetchedKindergartenInfo) {
      setKindergartenInfo(fetchedKindergartenInfo);
    }
  }, [fetchedKindergartenInfo]);

  // Update kindergarten info mutation
  const updateKindergartenMutation = useMutation({
    mutationFn: async (info: Partial<KindergartenInfo>) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/secure-settings?resource=kindergarten-info", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(info),
      });

      if (!response.ok) throw new Error("Failed to update kindergarten info");
      return response.json();
    },
  });

  const updateKindergartenField = (field: keyof KindergartenInfo, value: string | number) => {
    setKindergartenInfo(prev => prev ? { ...prev, [field]: value } : null);
  };

  const saveKindergartenInfo = async () => {
    if (!kindergartenInfo) return;

    try {
      await updateKindergartenMutation.mutateAsync(kindergartenInfo);
      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=kindergarten-info"] });
      setIsEditingKindergarten(false);

      toast({
        title: language === "no" ? "Lagret!" : "Saved!",
        description: language === "no" ? "Barnehageinformasjon er lagret" : "Kindergarten info has been saved",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: language === "no" ? "Feil" : "Error",
        description: language === "no" ? "Kunne ikke lagre informasjon" : "Could not save information",
      });
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800">
          {language === "no" ? "Innstillinger" : "Settings"}
        </h1>
        <p className="text-neutral-600 mt-2">
          {language === "no"
            ? "Administrer FAU-styret og annet innhold på siden"
            : "Manage FAU board and other site content"}
        </p>
      </div>

      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">
            {language === "no" ? "FAU-styret" : "FAU Board"}
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            {language === "no"
              ? "Definer styremedlemmer og deres roller. Dette vises på forsiden."
              : "Define board members and their roles. This is shown on the homepage."}
          </p>

          <div className="space-y-4">
            {members.map((member, index) => (
              <div key={member.id || `new-${index}`} className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor={`name-${index}`}>
                    {language === "no" ? "Navn" : "Name"}
                  </Label>
                  <Input
                    id={`name-${index}`}
                    value={member.name || ""}
                    onChange={(e) => updateMember(index, "name", e.target.value)}
                    placeholder={language === "no" ? "Navn Navnesen" : "John Doe"}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor={`role-${index}`}>
                    {language === "no" ? "Rolle" : "Role"}
                  </Label>
                  <Select
                    value={member.role || ""}
                    onValueChange={(value) => updateMember(index, "role", value)}
                  >
                    <SelectTrigger id={`role-${index}`}>
                      <SelectValue placeholder={language === "no" ? "Velg rolle" : "Select role"} />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_VALUES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {getRoleLabel(role, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removeMember(index)}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={addMember}
            className="mt-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            {language === "no" ? "Legg til medlem" : "Add member"}
          </Button>
        </div>

        <div className="flex justify-end gap-4 pt-6 border-t">
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {(createMutation.isPending || updateMutation.isPending) ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {language === "no" ? "Lagre endringer" : "Save changes"}
          </Button>
        </div>
      </Card>

      {/* Blog Posts Section */}
      <Card className="p-6 mt-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">
            {language === "no" ? "Nyheter / Innlegg" : "News / Blog Posts"}
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            {language === "no"
              ? "Administrer nyheter og informasjon som vises på forsiden. Arkiver gamle innlegg for å skjule dem."
              : "Manage news and information displayed on the homepage. Archive old posts to hide them."}
          </p>

          <Button onClick={addNewPost} className="mb-6" variant="default">
            <Plus className="h-4 w-4 mr-2" />
            {language === "no" ? "Nytt innlegg" : "New post"}
          </Button>

          <div className="space-y-6">
            {posts.map((post, index) => (
              <Card key={post.id || `new-${index}`} className={`p-4 ${post.status === "archived" ? "bg-gray-50 opacity-75" : ""}`}>
                {isEditingPost === index ? (
                  // Edit mode
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`post-title-${index}`}>
                        {language === "no" ? "Tittel" : "Title"}
                      </Label>
                      <Input
                        id={`post-title-${index}`}
                        value={post.title || ""}
                        onChange={(e) => updatePost(index, "title", e.target.value)}
                        placeholder={language === "no" ? "Tittel på innlegget" : "Post title"}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-content-${index}`}>
                        {language === "no" ? "Innhold" : "Content"}
                      </Label>
                      <Textarea
                        id={`post-content-${index}`}
                        value={post.content || ""}
                        onChange={(e) => updatePost(index, "content", e.target.value)}
                        placeholder={language === "no" ? "Skriv innlegget her..." : "Write your post here..."}
                        rows={6}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-date-${index}`}>
                        {language === "no" ? "Publiseringsdato" : "Publish date"}
                      </Label>
                      <Input
                        id={`post-date-${index}`}
                        type="date"
                        value={post.publishedDate || ""}
                        onChange={(e) => updatePost(index, "publishedDate", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`post-author-${index}`}>
                        {language === "no" ? "Skrevet av" : "Written by"}
                      </Label>
                      <Select
                        value={post.author || ""}
                        onValueChange={(value) => updatePost(index, "author", value)}
                      >
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
                      <Button
                        onClick={() => deletePost(index)}
                        variant="destructive"
                        size="sm"
                        className="ml-auto"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {language === "no" ? "Slett" : "Delete"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-neutral-900">
                        {post.title || (language === "no" ? "(Uten tittel)" : "(No title)")}
                      </h3>
                      <div className="flex gap-2">
                        <Button onClick={() => setIsEditingPost(index)} variant="outline" size="sm">
                          {language === "no" ? "Rediger" : "Edit"}
                        </Button>
                        {post.id && post.status === "published" && (
                          <Button
                            onClick={() => toggleHomepage(index)}
                            variant="outline"
                            size="sm"
                          >
                            <Home className="h-4 w-4 mr-2" />
                            {post.showOnHomepage
                              ? language === "no"
                                ? "Fjern fra hjem"
                                : "Remove from home"
                              : language === "no"
                              ? "Vis på hjem"
                              : "Show on home"}
                          </Button>
                        )}
                        {post.id && (
                          <Button
                            onClick={() => archivePost(index)}
                            variant="outline"
                            size="sm"
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            {post.status === "archived"
                              ? language === "no"
                                ? "Publiser"
                                : "Publish"
                              : language === "no"
                              ? "Arkiver"
                              : "Archive"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-neutral-600 mb-2">
                      {post.publishedDate &&
                        new Date(post.publishedDate).toLocaleDateString("no-NO")}
                      {post.author && (
                        <span className="ml-2">
                          • {language === "no" ? "av" : "by"} {post.author}
                        </span>
                      )}
                      {post.status === "archived" && (
                        <span className="ml-2 text-xs font-semibold text-orange-600">
                          ({language === "no" ? "ARKIVERT" : "ARCHIVED"})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap line-clamp-3">
                      {post.content}
                    </p>
                  </div>
                )}
              </Card>
            ))}

            {posts.length === 0 && (
              <p className="text-center text-neutral-500 py-8">
                {language === "no"
                  ? "Ingen innlegg ennå. Klikk 'Nytt innlegg' for å komme i gang."
                  : "No posts yet. Click 'New post' to get started."}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Kindergarten Info Section */}
      <Card className="p-6 mt-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">
            {language === "no" ? "Barnehageinformasjon" : "Kindergarten Information"}
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            {language === "no"
              ? "Administrer kontaktinformasjon og detaljer om barnehagen som vises på forsiden."
              : "Manage contact information and kindergarten details displayed on the homepage."}
          </p>

          {kindergartenInfo && (
            <div className="space-y-4">
              {isEditingKindergarten ? (
                // Edit mode
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="kindergarten-email">
                      {language === "no" ? "Kontakt e-post" : "Contact email"} *
                    </Label>
                    <Input
                      id="kindergarten-email"
                      type="email"
                      value={kindergartenInfo.contactEmail || ""}
                      onChange={(e) => updateKindergartenField("contactEmail", e.target.value)}
                      placeholder="barnehage@example.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-address">
                      {language === "no" ? "Adresse" : "Address"} *
                    </Label>
                    <Input
                      id="kindergarten-address"
                      value={kindergartenInfo.address || ""}
                      onChange={(e) => updateKindergartenField("address", e.target.value)}
                      placeholder="Steinråsa 5, 5306 Erdal"
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-hours">
                      {language === "no" ? "Åpningstider" : "Opening hours"} *
                    </Label>
                    <Input
                      id="kindergarten-hours"
                      value={kindergartenInfo.openingHours || ""}
                      onChange={(e) => updateKindergartenField("openingHours", e.target.value)}
                      placeholder="07:00 - 16:30"
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-children">
                      {language === "no" ? "Antall barn" : "Number of children"} *
                    </Label>
                    <Input
                      id="kindergarten-children"
                      type="number"
                      value={kindergartenInfo.numberOfChildren || ""}
                      onChange={(e) => updateKindergartenField("numberOfChildren", parseInt(e.target.value))}
                      placeholder="70"
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-owner">
                      {language === "no" ? "Eier" : "Owner"} *
                    </Label>
                    <Input
                      id="kindergarten-owner"
                      value={kindergartenInfo.owner || ""}
                      onChange={(e) => updateKindergartenField("owner", e.target.value)}
                      placeholder="Askøy kommune"
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-description">
                      {language === "no" ? "Beskrivelse" : "Description"} *
                    </Label>
                    <Textarea
                      id="kindergarten-description"
                      value={kindergartenInfo.description || ""}
                      onChange={(e) => updateKindergartenField("description", e.target.value)}
                      placeholder={language === "no"
                        ? "Beskriv barnehagen..."
                        : "Describe the kindergarten..."}
                      rows={4}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={saveKindergartenInfo} disabled={updateKindergartenMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      {language === "no" ? "Lagre" : "Save"}
                    </Button>
                    <Button onClick={() => setIsEditingKindergarten(false)} variant="outline">
                      {language === "no" ? "Avbryt" : "Cancel"}
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="bg-neutral-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-neutral-900">
                      {language === "no" ? "Om Barnehagen" : "About Kindergarten"}
                    </h3>
                    <Button onClick={() => setIsEditingKindergarten(true)} variant="outline" size="sm">
                      {language === "no" ? "Rediger" : "Edit"}
                    </Button>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p><strong>{language === "no" ? "Kontakt:" : "Contact:"}</strong> {kindergartenInfo.contactEmail}</p>
                    <p><strong>{language === "no" ? "Adresse:" : "Address:"}</strong> {kindergartenInfo.address}</p>
                    <p><strong>{language === "no" ? "Åpningstider:" : "Opening hours:"}</strong> {kindergartenInfo.openingHours}</p>
                    <p><strong>{language === "no" ? "Antall barn:" : "Number of children:"}</strong> {kindergartenInfo.numberOfChildren} {language === "no" ? "barn" : "children"}</p>
                    <p><strong>{language === "no" ? "Eier:" : "Owner:"}</strong> {kindergartenInfo.owner}</p>
                    <p className="mt-3"><strong>{language === "no" ? "Beskrivelse:" : "Description:"}</strong></p>
                    <p className="text-neutral-700">{kindergartenInfo.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
