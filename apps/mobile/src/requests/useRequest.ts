import type { CreateRequestInput, CurrentRequest, PassengerTracking } from '@fi-thnitek/contracts';
import type { TranslationKey } from '@fi-thnitek/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { SharingSetupError } from '../sharing/useSharing';
import { ensureLocationPermission, flush, startTracking, stopTracking } from '../sharing/tracking';

export const REQUEST_KEY = ['request'] as const;

/** The passenger cadence maps onto the shared tracker: one fix every `intervalS`, moving or not. */
export function passengerCadence(t: PassengerTracking) {
  return {
    movingIntervalS: t.intervalS,
    stationaryIntervalS: t.intervalS,
    distanceFilterM: t.distanceFilterM,
    bufferMaxMin: t.bufferMaxMin,
  };
}

/** GET /v1/requests/current, refreshed every 10 s while mounted (the server closes requests). */
export function useCurrentRequest(enabled = true) {
  const { api } = useAuth();
  return useQuery({
    queryKey: REQUEST_KEY,
    queryFn: () => api.currentRequest(),
    enabled,
    refetchInterval: 10_000,
  });
}

export function useRequestActions() {
  const { api } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const onSuccess = (current: CurrentRequest) => queryClient.setQueryData(REQUEST_KEY, current);
  const onError = () => void queryClient.invalidateQueries({ queryKey: REQUEST_KEY });
  const notification = () => ({
    title: t('requests.notificationTitle'),
    body: t('requests.notificationBody'),
  });

  return {
    /** R-032: posting starts the foreground location service; if that fails, the request is cancelled. */
    post: useMutation({
      mutationFn: async (input: CreateRequestInput) => {
        const permission = await ensureLocationPermission();
        if (permission !== 'granted') throw new SharingSetupError(permission);
        const current = await api.createRequest(input);
        try {
          await startTracking(passengerCadence(current.tracking), notification());
        } catch (error) {
          await api.cancelRequest().catch(() => undefined);
          throw error;
        }
        void flush();
        return current;
      },
      onSuccess,
      onError,
    }),
    cancel: useMutation({
      mutationFn: async () => {
        const current = await api.cancelRequest();
        await stopTracking();
        return current;
      },
      onSuccess,
      onError,
    }),
    renew: useMutation({ mutationFn: () => api.renewRequest(), onSuccess, onError }),
  };
}

const KNOWN = new Set(['REQUEST_ALREADY_OPEN', 'REQUEST_LIMIT', 'REQUEST_NOT_ALLOWED', 'RENEW_NOT_ALLOWED']);

export function requestErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof SharingSetupError) {
    if (error.kind === 'denied') return t('sharing.permissionBody');
    return error.kind === 'services-off' ? t('sharing.gpsOff') : t('sharing.noFix');
  }
  const code = error instanceof ApiError ? error.problem?.code : undefined;
  if (code && KNOWN.has(code)) return t(`requests.error_${code}` as TranslationKey);
  return t('common.error');
}
