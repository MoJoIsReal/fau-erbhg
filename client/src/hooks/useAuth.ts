import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, setUnauthorizedHandler } from '@/lib/queryClient';

interface AuthUser {
  userId: number;
  username: string;
  name: string;
  role: string;
  passwordChangeRequired?: boolean;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth'],
    retry: false,
    // The session is 2 hours. Without a refetch trigger this query never runs
    // again after mount, so the client could not notice its own expiry: the
    // header kept showing a signed-in user while every other request 401'd.
    refetchOnWindowFocus: true,
    refetchInterval: 15 * 60 * 1000,
  });

  // Any 401 from anywhere clears the cached identity, which flips
  // isAuthenticated to false and sends the route guards to the login prompt.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (queryClient.getQueryData(['/api/auth']) != null) {
        queryClient.setQueryData(['/api/auth'], null);
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Call logout API to clear HttpOnly cookies properly
      await apiRequest('POST', '/api/auth?action=logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/auth'] });
      // Force page reload to clear all cached data
      window.location.href = '/';
    },
    // Logging out must never be blocked by the server. An expired csrf-token
    // cookie makes the handler answer 403 — exactly when the user still thinks
    // they are signed in — and with no onError the click did nothing at all:
    // no redirect, no message, session not revoked. Clearing locally and
    // navigating is the same thing the success path does, and it is what the
    // user asked for. No toast: the navigation below unmounts it before it
    // could ever be read.
    onError: () => {
      queryClient.setQueryData(['/api/auth'], null);
      window.location.href = '/';
    },
  });

  return {
    user: user as AuthUser | null,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
