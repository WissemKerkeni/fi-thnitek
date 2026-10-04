import { useEffect, useRef, useState } from 'react';

interface Positioned {
  id: string;
  lat: number;
  lng: number;
}

const STEPS = 10;
const STEP_MS = 80;

/**
 * R-021: markers glide to their new position between polls instead of jumping (10 steps over ~0.8 s).
 * New markers appear in place; removed ones disappear at once.
 */
export function useAnimatedPositions<T extends Positioned>(items: readonly T[]): T[] {
  const [shown, setShown] = useState<T[]>(() => [...items]);
  const from = useRef(new Map<string, { lat: number; lng: number }>());

  useEffect(() => {
    const start = from.current;
    let step = 0;
    const tick = () => {
      step += 1;
      const k = step / STEPS;
      setShown(
        items.map((item) => {
          const prev = start.get(item.id);
          if (!prev || k >= 1) return item;
          return {
            ...item,
            lat: prev.lat + (item.lat - prev.lat) * k,
            lng: prev.lng + (item.lng - prev.lng) * k,
          };
        }),
      );
    };
    tick();
    const id = setInterval(() => {
      if (step >= STEPS) return clearInterval(id);
      tick();
    }, STEP_MS);
    from.current = new Map(items.map((i) => [i.id, { lat: i.lat, lng: i.lng }]));
    return () => clearInterval(id);
  }, [items]);

  return shown;
}
