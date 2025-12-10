import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FauBoardMember } from "@shared/schema";

const ROLES = ["Leder", "Medlem", "Vara"];

export default function Settings() {
  const { language } = useLanguage();
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
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
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
    </div>
  );
}
