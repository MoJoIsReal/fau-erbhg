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
    mutationFn: (data: { username: string; password: string }) =>
      apiRequest('POST', '/api/auth/login', data),
    onSuccess: () => {
      toast({
        title: t.modals.login.success,
        description: t.modals.login.successDesc,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
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
          <DialogTitle className="text-2xl text-center text-[#FF6B35]">
            {t.modals.login.title}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username" className="text-[#2C5F41]">
              {t.modals.login.email}
            </Label>
            <Input
              id="username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder=""
              required
              className="border-[#4A90A4] focus:border-[#FF6B35]"
            />
          </div>
          
          <div>
            <Label htmlFor="password" className="text-[#2C5F41]">
              {t.modals.login.password}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-[#4A90A4] focus:border-[#FF6B35]"
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
              className="flex-1 bg-[#FF6B35] hover:bg-[#FF5722] text-white"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? t.modals.login.loggingIn : t.modals.login.login}
            </Button>
          </div>
        </form>
        
        <div className="text-sm text-gray-600 text-center mt-4">
          <p>{t.modals.login.membersOnly}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t.modals.login.contactInfo}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}