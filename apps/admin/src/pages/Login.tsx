import { useLogin } from '@refinedev/core';
import { Alert, Button, Card, Flex, Typography } from 'antd';

export function Login() {
  const { mutate: login, isPending } = useLogin();

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Typography.Title level={3}>Fi thnitek · Administration</Typography.Title>
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Connexion provisoire"
          description="La connexion Google réservée aux administrateurs arrive en phase 2."
        />
        <Button type="primary" size="large" block loading={isPending} onClick={() => login({})}>
          Entrer
        </Button>
      </Card>
    </Flex>
  );
}
