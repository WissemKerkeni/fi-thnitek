import type { MyVerification } from '@fi-thnitek/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';

export const VERIFICATION_KEY = ['driver', 'verification'] as const;

/** The caller's driver file, refreshed when the screen is opened (push brings decisions in between). */
export function useVerification() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: VERIFICATION_KEY, queryFn: () => api.getMyVerification() });
  const setData = useCallback(
    (data: MyVerification) => queryClient.setQueryData(VERIFICATION_KEY, data),
    [queryClient],
  );
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: VERIFICATION_KEY }),
    [queryClient],
  );
  return { ...query, setData, refresh };
}
