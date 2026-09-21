import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      await apiRequest('GET', '/api/auth?action=csrf');
      const response = await apiRequest('POST', '/api/auth?action=login', data);
      return response.json();
    },
    onSuccess: (data) => {
      // JWT token is now stored in HttpOnly cookie automatically
      // CSRF token is also stored in cookie automatically
      toast({
        title: t.modals.login.success,
        description: t.modals.login.successDesc,
        duration: 2500,
      });
      // Force refresh authentication state
      queryClient.invalidateQueries({ queryKey: ['/api/auth'] });
      queryClient.refetchQueries({ queryKey: ['/api/auth'] });
      onClose();
      setUsername('');
      setPassword('');
    },
    onError: (error: any) => {
      toast({
        title: t.modals.login.error,
        description: error.message || t.modals.login.invalidCredentials,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-h3 font-bold tracking-tight text-ink">
            {t.modals.login.title}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">
              {t.modals.login.email}
            </Label>
            <Input
              id="username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder=""
              required
            />
          </div>
          
          <div>
            <Label htmlFor="password">
              {t.modals.login.password}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loginMutation.isPending}
            >
              {t.modals.login.cancel}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? t.modals.login.loggingIn : t.modals.login.login}
            </Button>
          </div>
        </form>
        
        <div className="mt-4 text-center text-small text-subtle">
          <p>{t.modals.login.membersOnly}</p>
          <p className="mt-1 text-micro text-subtle">
            {t.modals.login.contactInfo}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
