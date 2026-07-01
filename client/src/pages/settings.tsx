import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FauBoardMember } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import StaffUsersSection from "@/components/staff-users-section";
import NewsletterSubscribersSection from "@/components/newsletter-subscribers-section";

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

interface KindergartenInfo {
  id: number;
  contactEmail: string;
  address: string;
  openingHours: string;
  numberOfChildren: number;
  owner: string;
  description: string;
  styrerName?: string;
  styrerEmail?: string;
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
      const res = await apiRequest("POST", "/api/secure-settings?resource=board-members", member);
      return res.json();
    },
  });

  // Update member
  const updateMutation = useMutation({
    mutationFn: async ({ id, member }: { id: number; member: Partial<FauBoardMember> }) => {
      const res = await apiRequest("PUT", `/api/secure-settings?resource=board-members&id=${id}`, member);
      return res.json();
    },
  });

  // Delete member
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/secure-settings?resource=board-members&id=${id}`);
      return res.json();
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
      const res = await apiRequest("PUT", "/api/secure-settings?resource=kindergarten-info", info);
      return res.json();
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
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-50">
          {language === "no" ? "Innstillinger" : "Settings"}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-300 mt-2">
          {language === "no"
            ? "Administrer FAU-styret og innstillinger for siden"
            : "Manage the FAU board and site settings"}
        </p>
      </div>
      {/* FAU Board Section */}
      <Card className="p-6 mt-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-50 mb-2">
            {language === "no" ? "FAU-styret" : "FAU Board"}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
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
                {member.id ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                        disabled={deleteMutation.isPending}
                        aria-label={language === "no" ? "Slett medlem" : "Delete member"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {language === "no" ? "Slette styremedlem?" : "Delete board member?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {language === "no"
                            ? `Dette sletter ${member.name || "medlemmet"} fra styret.`
                            : `This removes ${member.name || "this member"} from the board.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{language === "no" ? "Avbryt" : "Cancel"}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMember(index)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {language === "no" ? "Slett" : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => removeMember(index)}
                    className="border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                    disabled={deleteMutation.isPending}
                    aria-label={language === "no" ? "Fjern medlem" : "Remove member"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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

        <div className="flex justify-end gap-4 pt-6 border-t dark:border-neutral-800">
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

      {/* Kindergarten Info Section */}
      <Card className="p-6 mt-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-50 mb-2">
            {language === "no" ? "Barnehageinformasjon" : "Kindergarten Information"}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
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
                    <Label htmlFor="kindergarten-styrer-name">
                      {language === "no" ? "Styrer (navn)" : "Director (name)"}
                    </Label>
                    <Input
                      id="kindergarten-styrer-name"
                      value={kindergartenInfo.styrerName || ""}
                      onChange={(e) => updateKindergartenField("styrerName", e.target.value)}
                      placeholder={language === "no" ? "Navn på styrer" : "Director's name"}
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-styrer-email">
                      {language === "no" ? "Styrer (e-post)" : "Director (email)"}
                    </Label>
                    <Input
                      id="kindergarten-styrer-email"
                      type="email"
                      value={kindergartenInfo.styrerEmail || ""}
                      onChange={(e) => updateKindergartenField("styrerEmail", e.target.value)}
                      placeholder={language === "no" ? "styrer@example.com" : "director@example.com"}
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
                <div className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                      {language === "no" ? "Om Barnehagen" : "About Kindergarten"}
                    </h3>
                    <Button onClick={() => setIsEditingKindergarten(true)} variant="outline" size="sm">
                      {language === "no" ? "Rediger" : "Edit"}
                    </Button>
                  </div>

                  <div className="space-y-2 text-sm dark:text-neutral-300">
                    <p><strong>{language === "no" ? "Kontakt:" : "Contact:"}</strong> {kindergartenInfo.contactEmail}</p>
                    <p><strong>{language === "no" ? "Adresse:" : "Address:"}</strong> {kindergartenInfo.address}</p>
                    <p><strong>{language === "no" ? "Åpningstider:" : "Opening hours:"}</strong> {kindergartenInfo.openingHours}</p>
                    <p><strong>{language === "no" ? "Antall barn:" : "Number of children:"}</strong> {kindergartenInfo.numberOfChildren} {language === "no" ? "barn" : "children"}</p>
                    <p><strong>{language === "no" ? "Eier:" : "Owner:"}</strong> {kindergartenInfo.owner}</p>
                    {kindergartenInfo.styrerName && (
                      <p><strong>{language === "no" ? "Styrer:" : "Director:"}</strong> {kindergartenInfo.styrerName}</p>
                    )}
                    {kindergartenInfo.styrerEmail && (
                      <p><strong>{language === "no" ? "Styrer e-post:" : "Director email:"}</strong> {kindergartenInfo.styrerEmail}</p>
                    )}
                    <p className="mt-3"><strong>{language === "no" ? "Beskrivelse:" : "Description:"}</strong></p>
                    <p className="text-neutral-700 dark:text-neutral-300">{kindergartenInfo.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <StaffUsersSection />
      <NewsletterSubscribersSection />
    </div>
  );
}
