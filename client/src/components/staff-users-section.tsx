import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [password, setPassword] = useState("");

  const { data: staff = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/admin/staff-users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/staff-users", { username, name, password });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.yearlyCalendar.staff.successCreate });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-users"] });
      setUsername("");
      setName("");
      setPassword("");
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.staff.errorCreate,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/staff-users?id=${id}`);
      if (res.status !== 204 && !res.ok) {
        throw new Error(await res.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-users"] });
    },
  });

  return (
    <Card className="p-6 mt-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-800 mb-2">
          {t.yearlyCalendar.staff.manageTitle}
        </h2>
        <p className="text-sm text-neutral-600">{t.yearlyCalendar.staff.manageDescription}</p>
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
          <Label htmlFor="staff-password">{t.yearlyCalendar.staff.password}</Label>
          <Input
            id="staff-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.yearlyCalendar.staff.passwordHint}
          />
        </div>
      </div>
      <Button
        type="button"
        className="mt-4"
        disabled={createMutation.isPending || !username || !name || password.length < 8}
        onClick={() => createMutation.mutate()}
      >
        <UserPlus className="h-4 w-4 mr-2" />
        {createMutation.isPending ? t.yearlyCalendar.staff.creating : t.yearlyCalendar.staff.create}
      </Button>

      <div className="mt-6">
        <h3 className="font-semibold text-neutral-800 mb-2">{t.yearlyCalendar.staff.existingStaff}</h3>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        ) : staff.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">{t.yearlyCalendar.staff.noStaff}</p>
        ) : (
          <ul className="divide-y border rounded-md">
            {staff.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <div className="font-medium text-neutral-900">{u.name}</div>
                  <div className="text-xs text-neutral-500">{u.username}</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (window.confirm(t.yearlyCalendar.staff.deleteConfirm)) {
                      deleteMutation.mutate(u.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  aria-label={t.yearlyCalendar.staff.delete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
