import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiErrorText } from "@/lib/queryClient";
import { FormError } from '@/components/site/form-error';
import { returnFocus } from '@/lib/return-focus';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Shown under the form until the user edits a field or tries again.
  const [error, setError] = useState<string | null>(null);
  // "Forgot password?" swaps the form for one that mails a reset link. Its
  // answer is the same whether or not the address has an account.
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');
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
    onError: (failure: unknown) => {
      setError(apiErrorText(failure, t, t.modals.login.invalidCredentials));
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: { username: string }) => {
      await apiRequest('GET', '/api/auth?action=csrf');
      await apiRequest('POST', '/api/auth?action=forgot-password', data);
    },
    onSuccess: () => setMode('sent'),
    onError: (failure: unknown) => {
      setError(apiErrorText(failure, t, t.apiErrors.generic));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ username, password });
  };

  const showMode = (next: typeof mode) => {
    setError(null);
    setMode(next);
  };

  const close = () => {
    setError(null);
    setMode('login');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent onCloseAutoFocus={returnFocus} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-h3 font-bold tracking-tight text-ink">
            {mode === 'login' ? t.modals.login.title : t.modals.login.forgotTitle}
          </DialogTitle>
          {mode !== 'login' && (
            <DialogDescription className="text-center">
              {mode === 'forgot' ? t.modals.login.forgotDescription : t.modals.login.forgotSent}
            </DialogDescription>
          )}
        </DialogHeader>

        {mode === 'forgot' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              forgotMutation.mutate({ username });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="forgot-username">
                {t.modals.login.email}
              </Label>
              <Input
                id="forgot-username"
                autoComplete="username"
                type="email"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "forgot-error" : undefined}
              />
            </div>
            <FormError id="forgot-error">{error}</FormError>
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => showMode('login')}
                className="flex-1"
                disabled={forgotMutation.isPending}
              >
                {t.modals.login.backToLogin}
              </Button>
              <Button type="submit" className="flex-1" disabled={forgotMutation.isPending}>
                {forgotMutation.isPending ? t.modals.login.forgotSending : t.modals.login.forgotSend}
              </Button>
            </div>
          </form>
        )}

        {mode === 'sent' && (
          <Button type="button" variant="outline" onClick={() => showMode('login')} className="w-full">
            {t.modals.login.backToLogin}
          </Button>
        )}

        {mode === 'login' && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">
                  {t.modals.login.email}
                </Label>
                <Input
                  id="username"
                  autoComplete="username"
                  type="email"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(null); }}
                  placeholder=""
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              <div>
                <Label htmlFor="password">
                  {t.modals.login.password}
                </Label>
                <Input
                  id="password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              <FormError id="login-error">{error}</FormError>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => showMode('forgot')}
                  className="min-h-11 text-small font-semibold text-brand underline-offset-4 hover:underline"
                >
                  {t.modals.login.forgotLink}
                </button>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
