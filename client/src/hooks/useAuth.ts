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
      // For JWT-based auth, logout is client-side only
      localStorage.removeItem('auth_token');
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