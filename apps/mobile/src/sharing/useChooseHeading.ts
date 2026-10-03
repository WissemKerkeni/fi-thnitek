import type { Place, SharingStatus } from '@fi-thnitek/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { setHeadingTo } from './headingTo';
import { SHARING_KEY, useSharingActions } from './useSharing';

/** Picks the "heading to" place: remembered for the next start, and sent at once while sharing. */
export function useChooseHeading(): (place: Place | null) => Promise<void> {
  const queryClient = useQueryClient();
  const { updateHeading } = useSharingActions();
  return async (place) => {
    setHeadingTo(place);
    if (queryClient.getQueryData<SharingStatus>(SHARING_KEY)?.session) {
      await updateHeading.mutateAsync(place?.id ?? null);
    }
  };
}
