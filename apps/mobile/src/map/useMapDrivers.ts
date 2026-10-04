import type { BBox } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { bboxKey } from './viewport';

/** R-021: poll every 5 s, only while the map screen is visible. */
const POLL_MS = 5_000;

export function useMapDrivers(bbox: BBox | null, enabled = true) {
  const { api } = useAuth();
  const focused = useIsFocused();
  return useQuery({
    queryKey: ['map', 'drivers', bbox ? bboxKey(bbox) : null],
    queryFn: () => api.mapDrivers({ bbox: bbox! }),
    enabled: enabled && focused && bbox !== null,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
    // A driver account that stopped sharing gets 403 SHARING_REQUIRED: no point retrying.
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
}
