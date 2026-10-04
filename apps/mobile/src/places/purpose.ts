import type { LatLng, Place } from '@fi-thnitek/contracts';
import { useLocalSearchParams } from 'expo-router';
import { setRoutinePlace, useRoutinePlaces } from '../routines/draft';
import { useHeadingTo } from '../sharing/headingTo';
import { useChooseHeading } from '../sharing/useChooseHeading';
import { setDestination, useDestination } from './destination';

/**
 * What the place search / pick-on-map is choosing for: the passenger's destination (default), the
 * driver's "heading to", or one end of a routine route.
 */
export type PlacePurpose = 'destination' | 'heading' | 'routine-from' | 'routine-to';

export function usePlacePurpose(): PlacePurpose {
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  return purpose === 'heading' || purpose === 'routine-from' || purpose === 'routine-to'
    ? purpose
    : 'destination';
}

/** Only the passenger destination may be a bare point; the others need a known place. */
export const needsPlace = (purpose: PlacePurpose) => purpose !== 'destination';

export function titleKey(purpose: PlacePurpose) {
  return purpose === 'heading'
    ? 'sharing.headingTo'
    : purpose === 'routine-from'
      ? 'routines.from'
      : purpose === 'routine-to'
        ? 'routines.to'
        : 'places.searchTitle';
}

/** Applies a chosen place to whatever the purpose is. */
export function useChoosePlace(purpose: PlacePurpose): (place: Place) => void {
  const chooseHeading = useChooseHeading();
  return (place) => {
    if (purpose === 'heading') void chooseHeading(place).catch(() => undefined);
    else if (purpose === 'routine-from') setRoutinePlace('from', place);
    else if (purpose === 'routine-to') setRoutinePlace('to', place);
    else setDestination({ point: place.location, place, distanceM: 0 });
  };
}

/** Where pick-on-map starts: the current choice for this purpose, if any. */
export function usePurposeStart(purpose: PlacePurpose): LatLng | undefined {
  const destination = useDestination()?.point;
  const heading = useHeadingTo()?.location;
  const routine = useRoutinePlaces();
  if (purpose === 'heading') return heading;
  if (purpose === 'routine-from') return routine.from?.location;
  if (purpose === 'routine-to') return routine.to?.location;
  return destination;
}
