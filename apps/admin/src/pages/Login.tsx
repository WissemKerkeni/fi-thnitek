import { useLogin } from '@refinedev/core';
import { Alert, Card, Flex, Spin, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, renderGoogleButton } from '../lib/google';

/** Google sign-in for allow-listed admins (Google Identity Services). */
export function Login() {
  const { mutate: login, isPending } = useLogin<{ idToken: string }>();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return;
    renderGoogleButton(buttonRef.current, (idToken) => login({ idToken })).catch(() => setLoadError(true));
  }, [login]);

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Typography.Title level={3}>Fi thnitek · Administration</Typography.Title>
        <Typography.Paragraph type="secondary">
          Réservé aux comptes Google autorisés (ADMIN_EMAILS).
        </Typography.Paragraph>
        {!GOOGLE_CLIENT_ID ? (
          <Alert type="warning" showIcon message="VITE_GOOGLE_CLIENT_ID n'est pas configuré." />
        ) : loadError ? (
          <Alert type="error" showIcon message="Impossible de charger la connexion Google." />
        ) : (
          <Spin spinning={isPending}>
            <div ref={buttonRef} style={{ minHeight: 44 }} />
          </Spin>
        )}
      </Card>
    </Flex>
  );
}
