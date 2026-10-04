import type { RoutineInput, RoutineList, RoutineView } from '@fi-thnitek/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';

export const ROUTINES_KEY = ['routines'] as const;

export function useRoutines() {
  const { api } = useAuth();
  return useQuery({ queryKey: ROUTINES_KEY, queryFn: () => api.listRoutines() });
}

/** Writes refresh the list and the sharing status (its "heading to" suggestion may change). */
export function useRoutineActions() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const replace = (view: RoutineView) => {
    queryClient.setQueryData<RoutineList>(ROUTINES_KEY, (list) =>
      list ? { ...list, routines: list.routines.map((r) => (r.id === view.id ? view : r)) } : list,
    );
    void queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['sharing'] });
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['sharing'] });
  };
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id: string | null; input: RoutineInput }) =>
        id ? api.updateRoutine(id, input) : api.createRoutine(input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteRoutine(id), onSuccess: refresh }),
    stillRunning: useMutation({
      mutationFn: ({ id, running }: { id: string; running: boolean }) => api.answerStillRunning(id, running),
      onSuccess: replace,
    }),
  };
}

const KNOWN = new Set(['SAME_PLACES', 'IN_THE_PAST', 'NO_DAYS']);

export function routineErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problem?.code === 'ROUTINE_LIMIT') return t('routines.error_ROUTINE_LIMIT');
    const detail = error.problem?.detail?.split(', ')[0];
    if (detail && KNOWN.has(detail)) return t(`routines.error_${detail}` as 'routines.error_SAME_PLACES');
  }
  return t('common.error');
}
