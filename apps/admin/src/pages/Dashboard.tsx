import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router';
import { API_URL, fetchHealth } from '../lib/api';
import { moderationApi } from '../lib/moderation';

export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => fetchHealth(), refetchInterval: 15_000 });
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => moderationApi.stats(),
    refetchInterval: 30_000,
  });
  const s = stats.data;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Tableau de bord</Typography.Title>

      {stats.isError ? (
        <Alert type="error" showIcon message="Impossible de charger les statistiques." />
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="En direct">
            <Space size="large" wrap>
              <Statistic title="Partagent" value={s?.live.sharing ?? '…'} />
              <Statistic title="En pause" value={s?.live.onBreak ?? '…'} />
              <Statistic title="Demandes ouvertes" value={s?.live.openRequests ?? '…'} />
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Aujourd’hui">
            <Space size="large" wrap>
              <Statistic title="Demandes" value={s?.today.requests ?? '…'} />
              <Statistic title="Parties (éloignées)" value={s?.today.movedAway ?? '…'} />
              <Statistic title="Expirées" value={s?.today.expired ?? '…'} />
              <Statistic title="Partages" value={s?.today.sessions ?? '…'} />
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Utilisateurs">
            <Space size="large" wrap>
              <Statistic title="Comptes" value={s?.users.total ?? '…'} />
              <Statistic title="Chauffeurs vérifiés" value={s?.users.verifiedDrivers ?? '…'} />
              <Statistic title="Nouveaux (7 j)" value={s?.users.new7d ?? '…'} />
            </Space>
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Modération">
            <Space size="large" wrap>
              <Link to="/reports">
                <Statistic title="Signalements à traiter" value={s?.moderation.openReports ?? '…'} />
              </Link>
              <Link to="/reports">
                <Statistic
                  title="dont prioritaires"
                  value={s?.moderation.highPriorityOpen ?? '…'}
                  valueStyle={s && s.moderation.highPriorityOpen > 0 ? { color: '#B3261E' } : undefined}
                />
              </Link>
              <Link to="/risk-flags">
                <Statistic title="Alertes à revoir" value={s?.moderation.unreviewedFlags ?? '…'} />
              </Link>
              <Link to="/appeals">
                <Statistic title="Contestations ouvertes" value={s?.moderation.openAppeals ?? '…'} />
              </Link>
              <Statistic title="Suspendus" value={s?.moderation.suspended ?? '…'} />
              <Statistic title="Bannis" value={s?.moderation.banned ?? '…'} />
            </Space>
          </Card>
        </Col>
      </Row>

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
