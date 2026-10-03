export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    ux_mode: 'popup';
  }): void;
  renderButton(el: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services failed to load'));
    document.head.appendChild(script);
  });
  return loading;
}

/** Renders Google's "Sign in with Google" button; `onIdToken` receives the ID token (JWT). */
export async function renderGoogleButton(
  el: HTMLElement,
  onIdToken: (idToken: string) => void,
): Promise<void> {
  await loadScript();
  const id = window.google?.accounts.id;
  if (!id) throw new Error('Google Identity Services unavailable');
  id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onIdToken(r.credential), ux_mode: 'popup' });
  id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'fr', width: 320 });
}
