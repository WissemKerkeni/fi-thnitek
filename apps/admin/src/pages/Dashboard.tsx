import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { API_URL, fetchHealth } from '../lib/api';

export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => fetchHealth(), refetchInterval: 15_000 });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Tableau de bord</Typography.Title>
      <Card
        title="État de l'API"
        extra={
          <Button onClick={() => void health.refetch()} loading={health.isFetching}>
            Actualiser
          </Button>
        }
      >
        {health.isError ? (
          <Alert type="error" showIcon message="API injoignable" description={API_URL} />
        ) : (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Statut">
              {health.data ? (
                <Tag color={health.data.status === 'up' ? 'green' : 'red'}>{health.data.status}</Tag>
              ) : (
                '…'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Base de données">
              {health.data?.checks.database ?? '…'}
            </Descriptions.Item>
            <Descriptions.Item label="Version">{health.data?.version ?? '…'}</Descriptions.Item>
            <Descriptions.Item label="Vérifié à">{health.data?.time ?? '…'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>
    </Space>
  );
}
