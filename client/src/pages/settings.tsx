import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Loader2, Plus, Trash2, Save } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FauBoardMember } from "@shared/schema";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
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

/** A row in the board editor: a member, plus a key that survives a reorder. */
type BoardRow = Partial<FauBoardMember> & { uid: string };

// An unsaved row needs an identity of its own. Dragging changes every index,
// so a key derived from the position would follow the position rather than the
// row, and the input you were typing in would jump to another member.
let unsavedRows = 0;
const newRowUid = () => `row-new-${(unsavedRows += 1)}`;

// dnd-kit's keyboard default is 25px per arrow press, which in a list of
// ~90px rows means four presses before anything moves. A press should be a
// position, so the step is the row's own height plus the list's gap.
const ROW_GAP = 16;
const rowKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  event.preventDefault();
  const height = context.activeNode?.getBoundingClientRect().height ?? 0;
  const step = height + ROW_GAP;
  return {
    ...currentCoordinates,
    y: currentCoordinates.y + (event.code === "ArrowDown" ? step : -step),
  };
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

interface BoardMemberRowProps {
  row: BoardRow;
  index: number;
  onChange: (uid: string, field: "name" | "role", value: string) => void;
  onRemove: (uid: string) => void;
  deleting: boolean;
}

/**
 * One member of the board, and the unit the list reorders.
 *
 * The row is both what you pick up and what you can drop on, so a drop reads
 * as "take this member's place" and the list needs no separate drop zone
 * between every pair of rows. Only the grip is a drag handle — the name field
 * has to stay a text field you can select inside of.
 */
function BoardMemberRow({ row, index, onChange, onRemove, deleting }: BoardMemberRowProps) {
  const { language, t } = useLanguage();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: row.uid });
  const { isOver, setNodeRef: setDropNodeRef } = useDroppable({ id: row.uid });
  const name = row.name?.trim() || t.settings.unnamedMember;

  // The same element is the draggable and the drop target, which is two refs
  // for one node.
  const setRowRef = (node: HTMLElement | null) => {
    setNodeRef(node);
    setDropNodeRef(node);
  };

  return (
    <div
      ref={setRowRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`grid grid-cols-[auto_1fr_auto] items-end gap-3 rounded-card border-b pb-4 sm:flex sm:gap-4 sm:border-0 sm:pb-0 ${
        // A row being carried needs a ground of its own: with a transparent
        // background it dragged as loose text over the row underneath it.
        isDragging ? "relative z-50 border-0 bg-surface px-2 py-2 shadow-panel ring-2 ring-brand/50" : ""
      } ${isOver && !isDragging ? "ring-2 ring-brand/40" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={fill(t.settings.moveMember, { name })}
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-token text-subtle hover:bg-green-50 hover:text-brand active:cursor-grabbing dark:hover:bg-green-950/40"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="col-span-2 min-w-0 sm:flex-1">
        <Label htmlFor={`name-${index}`}>
          {t.settings.name}
        </Label>
        <Input
          id={`name-${index}`}
          value={row.name || ""}
          onChange={(e) => onChange(row.uid, "name", e.target.value)}
          placeholder={t.settings.johnDoe}
        />
      </div>
      <div className="col-start-2 min-w-0 sm:flex-1">
        <Label htmlFor={`role-${index}`}>
          {t.settings.role}
        </Label>
        <Select
          value={row.role || ""}
          onValueChange={(value) => onChange(row.uid, "role", value)}
        >
          <SelectTrigger id={`role-${index}`}>
            <SelectValue placeholder={t.settings.selectRole} />
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
      {row.id ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="self-end shrink-0 border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
              disabled={deleting}
              aria-label={t.settings.deleteMember}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t.settings.deleteBoardMember}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {language === "no"
                  ? `Dette sletter ${row.name || "medlemmet"} fra styret.`
                  : `This removes ${row.name || "this member"} from the board.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.settings.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRemove(row.uid)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t.settings.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          variant="outline"
          size="icon"
          onClick={() => onRemove(row.uid)}
          className="self-end shrink-0 border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
          disabled={deleting}
          aria-label={t.settings.removeMember}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
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
  const [members, setMembers] = useState<BoardRow[]>([]);

  // Fetch FAU board members
  const { data: boardMembers, isLoading } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

  // Update local state when data loads
  useEffect(() => {
    if (boardMembers) {
      setMembers(boardMembers.map((member) => ({ ...member, uid: `row-${member.id}` })));
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
    setMembers((prev) => [...prev, { uid: newRowUid(), name: "", role: "" }]);
  };

  const removeMember = async (uid: string) => {
    const member = members.find((row) => row.uid === uid);
    if (!member) return;
    if (member.id) {
      try {
        await deleteMutation.mutateAsync(member.id);
        await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=board-members"] });
        toast({
          title: t.settings.deleted,
          description: t.settings.memberWasDeleted,
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: t.settings.error,
          description: t.settings.couldNotDeleteMember,
        });
      }
    } else {
      // Just remove from local state if not saved yet
      setMembers((prev) => prev.filter((row) => row.uid !== uid));
    }
  };

  const updateMember = (uid: string, field: "name" | "role", value: string) => {
    setMembers((prev) => prev.map((row) => (row.uid === uid ? { ...row, [field]: value } : row)));
  };

  // The list is the order. A drop rewrites the list, and the save below stamps
  // each row with its position, which is what the homepage reads back.
  const moveMember = (fromUid: UniqueIdentifier, toUid: UniqueIdentifier) => {
    setMembers((prev) => {
      const from = prev.findIndex((row) => row.uid === fromUid);
      const to = prev.findIndex((row) => row.uid === toUid);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // A grip is a small target on a phone, so touch needs a short press rather
  // than a distance — a distance threshold would fight the page's own scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: rowKeyboardCoordinates }),
  );

  const memberName = (uid: UniqueIdentifier | undefined) => {
    const row = members.find((member) => member.uid === uid);
    return row?.name?.trim() || t.settings.unnamedMember;
  };

  // dnd-kit announces in English by default, which a screen reader set to
  // Norwegian would read out in the wrong language.
  const reorderAnnouncements: Announcements = {
    onDragStart: ({ active }) =>
      fill(t.settings.reorder.onDragStart, { item: memberName(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? fill(t.settings.reorder.onDragOver, {
            item: memberName(active.id),
            target: memberName(over.id),
          })
        : fill(t.settings.reorder.onDragOverNoTarget, { item: memberName(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? fill(t.settings.reorder.onDragEnd, {
            item: memberName(active.id),
            target: memberName(over.id),
          })
        : fill(t.settings.reorder.onDragEndNoTarget, { item: memberName(active.id) }),
    onDragCancel: ({ active }) =>
      fill(t.settings.reorder.onDragCancel, { item: memberName(active.id) }),
  };

  const handleReorderEnd = (event: DragEndEvent) => {
    if (event.over) moveMember(event.active.id, event.over.id);
  };

  const handleSave = async () => {
    // Incomplete rows used to be skipped silently while the toast still said
    // "Saved!" — a member added without a role just vanished on the next
    // load. Now the save stops and says which row is the problem.
    const incomplete = members.find((member) => !member.name || !member.role);
    if (incomplete) {
      toast({
        variant: "destructive",
        title: t.settings.cannotSave,
        description: language === "no"
          ? incomplete.name
            ? `${incomplete.name} mangler rolle.`
            : "Et medlem mangler navn. Fyll ut raden eller fjern den."
          : incomplete.name
            ? `${incomplete.name} is missing a role.`
            : "A member is missing a name. Complete the row or remove it.",
      });
      return;
    }

    // A mid-loop failure persists every member before it and none after, so the
    // error has to name which one stopped it — a bare "could not save changes"
    // left the list looking fully saved while only part of it was written.
    // The refetch runs either way, so what is on screen is what actually
    // persisted rather than the optimistic local state.
    let failedMember: { name?: string } | null = null;
    let failure: unknown = null;

    try {
      for (const [index, member] of members.entries()) {
        // The row's position is its sort order — that is what makes a drag
        // stick, and what keeps the homepage listing the board in the order
        // this page shows it in.
        const payload = { name: member.name, role: member.role, sortOrder: index };
        try {
          if (member.id) {
            // Update existing
            await updateMutation.mutateAsync({ id: member.id, member: payload });
          } else {
            // Create new
            await createMutation.mutateAsync(payload);
          }
        } catch (error) {
          failedMember = member;
          failure = error;
          break;
        }
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=board-members"] });
    }

    if (failure) {
      const reason = getApiErrorMessage(failure, t.settings.couldNotSaveChanges);
      toast({
        variant: "destructive",
        title: t.settings.error,
        description: failedMember?.name
          ? `${failedMember.name}: ${reason}`
          : reason,
      });
      return;
    }

    toast({
      title: t.settings.saved,
      description: t.settings.boardMembersHaveBeen,
    });
  };

  // ===== KINDERGARTEN INFO MANAGEMENT =====
  const [kindergartenInfo, setKindergartenInfo] = useState<Partial<KindergartenInfo> | null>(null);

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

  // Dirty flag drives the Save button: the form is always editable, and Save
  // lights up when something actually changed — same pattern as the board tab.
  const kindergartenDirty =
    !!kindergartenInfo &&
    !!fetchedKindergartenInfo &&
    JSON.stringify(kindergartenInfo) !== JSON.stringify(fetchedKindergartenInfo);

  const saveKindergartenInfo = async () => {
    if (!kindergartenInfo) return;

    try {
      await updateKindergartenMutation.mutateAsync(kindergartenInfo);
      await queryClient.invalidateQueries({ queryKey: ["/api/secure-settings?resource=kindergarten-info"] });

      toast({
        title: t.settings.saved,
        description: t.settings.kindergartenInfoHasBeen,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.settings.error,
        description: t.settings.couldNotSaveInformation,
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
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink">
          {t.settings.settings}
        </h1>
        <p className="text-subtle mt-2">
          {language === "no"
            ? "Administrer FAU-styret og innstillinger for siden"
            : "Manage the FAU board and site settings"}
        </p>
      </div>

      {/* One tab per concern, and one shared editing pattern inside them:
          forms are always editable, and Save is enabled when something
          changed. The page used to stack four sections with three different
          save models in a single scroll. */}
      <Tabs defaultValue="board">
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="board">{t.settings.fauBoard}</TabsTrigger>
          <TabsTrigger value="kindergarten">{t.settings.kindergarten}</TabsTrigger>
          <TabsTrigger value="users">{t.settings.users}</TabsTrigger>
          <TabsTrigger value="newsletter">{t.settings.newsletter}</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
      {/* FAU Board Section */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-ink mb-2">
            {t.settings.fauBoard}
          </h2>
          <p className="text-sm text-subtle mb-4">
            {language === "no"
              ? "Definer styremedlemmer og deres roller. Dette vises på forsiden."
              : "Define board members and their roles. This is shown on the homepage."}
          </p>

          <p className="text-sm text-subtle mb-4">{t.settings.reorderHint}</p>

          {/* Name gets its own line on a phone, with the grip, role and delete
              beside it below — two inputs plus two buttons never fit on one
              row there. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleReorderEnd}
            accessibility={{
              announcements: reorderAnnouncements,
              screenReaderInstructions: { draggable: t.settings.reorder.instructions },
            }}
          >
            <div className="space-y-4">
              {members.map((member, index) => (
                <BoardMemberRow
                  key={member.uid}
                  row={member}
                  index={index}
                  onChange={updateMember}
                  onRemove={removeMember}
                  deleting={deleteMutation.isPending}
                />
              ))}
            </div>
          </DndContext>

          <Button
            variant="outline"
            onClick={addMember}
            className="mt-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.settings.addMember}
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
            {t.settings.saveChanges}
          </Button>
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="kindergarten">
      {/* Kindergarten Info Section */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-ink mb-2">
            {t.settings.kindergartenInformation}
          </h2>
          <p className="text-sm text-subtle mb-4">
            {language === "no"
              ? "Administrer kontaktinformasjon og detaljer om barnehagen som vises på forsiden."
              : "Manage contact information and kindergarten details displayed on the homepage."}
          </p>

          {kindergartenInfo && (
            <div className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="kindergarten-email">
                      {t.settings.contactEmail} *
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
                      {t.settings.address} *
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
                      {t.settings.openingHours} *
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
                      {t.settings.numberChildren} *
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
                      {t.settings.owner} *
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
                      {t.settings.directorName}
                    </Label>
                    <Input
                      id="kindergarten-styrer-name"
                      value={kindergartenInfo.styrerName || ""}
                      onChange={(e) => updateKindergartenField("styrerName", e.target.value)}
                      placeholder={t.settings.directorSName}
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-styrer-email">
                      {t.settings.directorEmail}
                    </Label>
                    <Input
                      id="kindergarten-styrer-email"
                      type="email"
                      value={kindergartenInfo.styrerEmail || ""}
                      onChange={(e) => updateKindergartenField("styrerEmail", e.target.value)}
                      placeholder={t.settings.directorExampleCom}
                    />
                  </div>

                  <div>
                    <Label htmlFor="kindergarten-description">
                      {t.settings.description} *
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

                  <div className="flex items-center gap-3 pt-4">
                    <Button
                      onClick={saveKindergartenInfo}
                      disabled={!kindergartenDirty || updateKindergartenMutation.isPending}
                    >
                      {updateKindergartenMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {t.settings.saveChanges}
                    </Button>
                    {kindergartenDirty && (
                      <Button
                        variant="outline"
                        onClick={() => setKindergartenInfo(fetchedKindergartenInfo ?? null)}
                      >
                        {t.settings.discardChanges}
                      </Button>
                    )}
                    {!kindergartenDirty && (
                      <span className="text-sm text-subtle">
                        {t.settings.noUnsavedChanges}
                      </span>
                    )}
                  </div>
                </div>
            </div>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="users">
          <StaffUsersSection />
        </TabsContent>

        <TabsContent value="newsletter">
          <NewsletterSubscribersSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
