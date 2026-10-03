import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { loadSavedLocale } from '../src/i18n';

/** First launch → language picker; afterwards → home. */
export default function Index() {
  const [target, setTarget] = useState<'/language' | '/home' | null>(null);

  useEffect(() => {
    void loadSavedLocale().then((saved) => setTarget(saved ? '/home' : '/language'));
  }, []);

  return target ? <Redirect href={target} /> : null;
}
