import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Trash2, UserPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

interface StaffUser {
  id: number;
  username: string;
  name: string;
  role: string;
  createdAt?: string;
}

export default function StaffUsersSection() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "staff">("staff");

  const STAFF_KEY = "/api/secure-settings?resource=users";

  const { data: staff = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: [STAFF_KEY],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", STAFF_KEY, { username, name, role });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t.yearlyCalendar.staff.successCreate,
        description: t.yearlyCalendar.staff.emailSent,
      });
      queryClient.invalidateQueries({ queryKey: [STAFF_KEY] });
      setUsername("");
      setName("");
      setRole("staff");
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.staff.errorCreate,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const roleName = (value: string) => (
    value === "member" ? t.yearlyCalendar.staff.roleFau : t.yearlyCalendar.staff.roleKindergarten
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `${STAFF_KEY}&id=${id}`);
      if (res.status !== 204 && !res.ok) {
        throw new Error(await res.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STAFF_KEY] });
    },
  });

  return (
    <Card className="p-6 mt-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-50 mb-2">
          {t.yearlyCalendar.staff.manageTitle}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.yearlyCalendar.staff.manageDescription}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label htmlFor="staff-username">{t.yearlyCalendar.staff.username}</Label>
          <Input
            id="staff-username"
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-name">{t.yearlyCalendar.staff.name}</Label>
          <Input
            id="staff-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="staff-role">{t.yearlyCalendar.staff.role}</Label>
          <Select value={role} onValueChange={(value) => setRole(value as "member" | "staff")}>
            <SelectTrigger id="staff-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{t.yearlyCalendar.staff.roleFau}</SelectItem>
              <SelectItem value="staff">{t.yearlyCalendar.staff.roleKindergarten}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        type="button"
        className="mt-4"
        disabled={createMutation.isPending || !username || !name || !role}
        onClick={() => createMutation.mutate()}
      >
        <UserPlus className="h-4 w-4 mr-2" />
        {createMutation.isPending ? t.yearlyCalendar.staff.creating : t.yearlyCalendar.staff.create}
      </Button>

      <div className="mt-6">
        <h3 className="font-semibold text-neutral-800 dark:text-neutral-50 mb-2">{t.yearlyCalendar.staff.existingStaff}</h3>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500 dark:text-neutral-400" />
        ) : staff.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">{t.yearlyCalendar.staff.noStaff}</p>
        ) : (
          <ul className="divide-y dark:divide-neutral-800 border dark:border-neutral-800 rounded-md">
            {staff.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-50">{u.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {u.username} - {roleName(u.role)}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-red-300 dark:border-red-900/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                      disabled={deleteMutation.isPending}
                      aria-label={t.yearlyCalendar.staff.delete}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t.yearlyCalendar.staff.delete}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t.yearlyCalendar.staff.deleteConfirm}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.yearlyCalendar.modal.cancel}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => deleteMutation.mutate(u.id)}
                      >
                        {t.yearlyCalendar.staff.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
