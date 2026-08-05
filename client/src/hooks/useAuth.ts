import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  });

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
  });

  return {
    user: user as AuthUser | null,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
