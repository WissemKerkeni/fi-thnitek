import type { CreateBlockInput, CreateReportInput } from '@fi-thnitek/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useAuth } from '../auth/AuthProvider';
import type { TranslationKey } from '@fi-thnitek/i18n';
import { ApiError } from '../lib/api';

const BLOCKS_KEY = ['blocks'] as const;

/** After a block, both people disappear from each other's map (R-027): refresh what is on screen. */
function useRefreshAfterBlock() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
    void queryClient.invalidateQueries({ queryKey: ['map'] });
    void queryClient.invalidateQueries({ queryKey: ['finder'] });
  };
}

export function useReport() {
  const { api } = useAuth();
  const refresh = useRefreshAfterBlock();
  return useMutation({
    mutationFn: (input: CreateReportInput) => api.report(input),
    onSuccess: (r) => {
      if (r.blocked) refresh();
    },
  });
}

export function useBlock() {
  const { api } = useAuth();
  const refresh = useRefreshAfterBlock();
  return useMutation({ mutationFn: (ref: CreateBlockInput) => api.block(ref), onSuccess: refresh });
}

export function useBlocks() {
  const { api } = useAuth();
  return useQuery({ queryKey: BLOCKS_KEY, queryFn: () => api.listBlocks() });
}

export function useUnblock() {
  const { api } = useAuth();
  const refresh = useRefreshAfterBlock();
  return useMutation({ mutationFn: (id: string) => api.unblock(id), onSuccess: refresh });
}

const KNOWN = new Set(['REPORT_NOT_ALLOWED', 'REPORT_LIMIT', 'NOT_FOUND']);

export function safetyErrorMessage(t: TFunction, error: unknown): string {
  const code = error instanceof ApiError ? error.problem?.code : undefined;
  if (code && KNOWN.has(code)) return t(`safety.error_${code}` as TranslationKey);
  return t('common.error');
}
