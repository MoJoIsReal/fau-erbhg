import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

export default function PasswordChangeModal() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword.length < 12) {
        throw new Error(t.modals.passwordChange.tooShort);
      }
      if (newPassword !== confirmPassword) {
        throw new Error(t.modals.passwordChange.mismatch);
      }

      const response = await apiRequest("POST", "/api/user?action=change-password", {
        currentPassword,
        newPassword,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t.modals.passwordChange.success });
    },
    onError: (error: any) => {
      toast({
        title: t.modals.passwordChange.error,
        description: error?.message ?? "",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.modals.passwordChange.title}</DialogTitle>
          <DialogDescription>{t.modals.passwordChange.description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            changePasswordMutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="current-password">{t.modals.passwordChange.currentPassword}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="new-password">{t.modals.passwordChange.newPassword}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={12}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">{t.modals.passwordChange.confirmPassword}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={12}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={
              changePasswordMutation.isPending ||
              !currentPassword ||
              newPassword.length < 12 ||
              newPassword !== confirmPassword
            }
          >
            {changePasswordMutation.isPending ? t.modals.passwordChange.saving : t.modals.passwordChange.save}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
