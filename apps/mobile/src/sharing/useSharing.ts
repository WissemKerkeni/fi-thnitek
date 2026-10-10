import type { SharingStatus } from '@fi-thnitek/contracts';
import type { TranslationKey } from '@fi-thnitek/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { currentFix, ensureLocationPermission, flush, startTracking, stopTracking } from './tracking';

export const SHARING_KEY = ['sharing'] as const;

/** Why an action could not even reach the server. */
export class SharingSetupError extends Error {
  constructor(readonly kind: 'denied' | 'services-off' | 'no-fix') {
    super(kind);
    this.name = 'SharingSetupError';
  }
}

/** GET /v1/driver/sharing, refreshed every 15 s while mounted (the server is the source of truth). */
export function useSharingStatus(enabled = true) {
  const { api } = useAuth();
  return useQuery({
    queryKey: SHARING_KEY,
    queryFn: () => api.getSharing(),
    enabled,
    refetchInterval: 15_000,
  });
}

export function useSharingActions() {
  const { api } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const onSuccess = (status: SharingStatus) => queryClient.setQueryData(SHARING_KEY, status);
  const onError = () => void queryClient.invalidateQueries({ queryKey: SHARING_KEY });
  const notification = () => ({ title: t('sharing.notificationTitle'), body: t('sharing.notificationBody') });

  async function freshFix() {
    const permission = await ensureLocationPermission();
    if (permission !== 'granted') throw new SharingSetupError(permission);
    const fix = await currentFix();
    if (!fix) throw new SharingSetupError('no-fix');
    return fix;
  }

  return {
    start: useMutation({
      mutationFn: async (input: { headingToPlaceId: string | null; lineLabel: string | null }) => {
        const status = await api.startSharing({ fix: await freshFix(), ...input });
        await startTracking(status.tracking, notification());
        void flush();
        return status;
      },
      onSuccess,
      onError,
    }),
    setFull: useMutation({ mutationFn: (isFull: boolean) => api.setFull(isFull), onSuccess, onError }),
    updateHeading: useMutation({
      mutationFn: (headingToPlaceId: string | null) => api.updateSharing({ headingToPlaceId }),
      onSuccess,
      onError,
    }),
    takeBreak: useMutation({
      mutationFn: async (minutes: number) => {
        await flush();
        const status = await api.startBreak(minutes);
        await stopTracking();
        return status;
      },
      onSuccess,
      onError,
    }),
    resume: useMutation({
      mutationFn: async () => {
        const status = await api.resumeSharing({ fix: await freshFix() });
        await startTracking(status.tracking, notification());
        void flush();
        return status;
      },
      onSuccess,
      onError,
    }),
    stop: useMutation({
      mutationFn: async () => {
        const status = await api.stopSharing();
        await stopTracking();
        return status;
      },
      onSuccess,
      onError,
    }),
    stillWorking: useMutation({ mutationFn: () => api.confirmStillWorking(), onSuccess, onError }),
  };
}

const KNOWN_ERRORS = new Set(['FIX_REJECTED', 'COOLDOWN_ACTIVE']);

/** A message the driver can act on, in their language. */
export function sharingErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof SharingSetupError) {
    if (error.kind === 'denied') return t('sharing.permissionBody');
    return error.kind === 'services-off' ? t('sharing.gpsOff') : t('sharing.noFix');
  }
  const code = error instanceof ApiError ? error.problem?.code : undefined;
  if (code && KNOWN_ERRORS.has(code)) return t(`sharing.error_${code}` as TranslationKey);
  return t('common.error');
}

export { isDriverAccount } from '../auth/next-route';
