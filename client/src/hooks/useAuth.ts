import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface AuthUser {
  userId: number;
  username: string;
  name: string;
  role: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/user'],
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Clear HttpOnly cookie and CSRF token by setting them to expired
      document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'csrf-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/user'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      // Force page reload to clear all cached data
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