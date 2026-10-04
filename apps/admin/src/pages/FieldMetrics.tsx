import { AdminFieldMetrics, type Spread } from '@fi-thnitek/contracts';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, DatePicker, Descriptions, Row, Space, Statistic, Table, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { adminSession } from '../lib/admin-session';
import { CATEGORY } from '../lib/moderation';

const spread = (s: Spread, unit: string) =>
  s.n === 0 ? '—' : `médiane ${s.p50 ?? '—'} ${unit} · 90 % ≤ ${s.p90 ?? '—'} ${unit} (n = ${s.n})`;

const REQUEST_STATUS: Record<string, string> = {
  OPEN: 'Ouvertes',
  MOVED_AWAY: 'Parties (éloignées)',
  EXPIRED: 'Expirées',
  CANCELLED: 'Annulées',
  LOCATION_LOST: 'Position perdue',
  NO_GPS_FIX: 'Pas de GPS',
  REMOVED: 'Retirées',
};

/**
 * Phase 9, threshold tuning from field data: aggregates over a period, each shown next to the
 * thresholds it relates to. No people, no positions.
 */
export function FieldMetrics() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);
  const metrics = useQuery({
    queryKey: ['field-metrics', range[0].toISOString(), range[1].toISOString()],
    queryFn: () =>
      adminSession.request(
        'GET',
        `/admin/field-metrics?from=${encodeURIComponent(range[0].toISOString())}&to=${encodeURIComponent(range[1].toISOString())}`,
        AdminFieldMetrics,
      ),
  });
  const m = metrics.data;
  const rows = (o: Record<string, number>, labels: Record<string, string> = {}) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ key: k, label: labels[k] ?? k, n }));

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Mesures terrain</Typography.Title>
      <DatePicker.RangePicker
        showTime
        value={range}
        onChange={(v) => {
          if (v?.[0] && v[1]) setRange([v[0], v[1]]);
        }}
      />
      {metrics.isError ? <Alert type="error" showIcon message="Impossible de charger les mesures." /> : null}
      {m ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={`Demandes (${m.requests.total})`}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item
                  label={`Délai avant visibilité (seuil ${String(m.thresholds.anchor_timeout_s)} s)`}
                >
                  {spread(m.requests.anchorDelayS, 's')}
                </Descriptions.Item>
                <Descriptions.Item
                  label={`Précision du point d’ancrage (seuil ${String(m.thresholds.anchor_max_accuracy_m)} m)`}
                >
                  {spread(m.requests.anchorAccuracyM, 'm')}
                </Descriptions.Item>
                <Descriptions.Item label="Attente avant de partir (éloignées)">
                  {spread(m.requests.waitBeforeMovedAwayMin, 'min')}
                </Descriptions.Item>
                <Descriptions.Item label="Demandes prolongées">{m.requests.renewed}</Descriptions.Item>
              </Descriptions>
              <Table
                size="small"
                pagination={false}
                dataSource={rows(m.requests.byStatus, REQUEST_STATUS)}
                columns={[
                  { title: 'Issue', dataIndex: 'label' },
                  { title: 'Nombre', dataIndex: 'n', width: 100 },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={`Partages (${m.sessions.total})`}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Durée">{spread(m.sessions.durationMin, 'min')}</Descriptions.Item>
                <Descriptions.Item label="Pauses par partage">
                  {m.sessions.breaksPerSession?.toFixed(2) ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={`Attentes appliquées (${String(m.thresholds.cooldown_min)} min)`}>
                  {m.sessions.cooldownsApplied}
                </Descriptions.Item>
              </Descriptions>
              <Table
                size="small"
                pagination={false}
                dataSource={rows(m.sessions.byEndReason)}
                columns={[
                  { title: 'Fin', dataIndex: 'label' },
                  { title: 'Nombre', dataIndex: 'n', width: 100 },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Prises en charge">
              <Space size="large" wrap>
                <Statistic title="Enregistrements" value={m.pickups.total} />
                <Statistic title="Demandes avec chauffeur proche" value={m.pickups.movedAwayWithDriver} />
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                Distance minimale (seuil {String(m.thresholds.pickup_radius_m)} m) :{' '}
                {spread(m.pickups.distanceM, 'm')}
              </Typography.Paragraph>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Signalements">
              <Table
                size="small"
                pagination={false}
                dataSource={rows(m.reports.byCategory, CATEGORY)}
                locale={{ emptyText: 'Aucun signalement' }}
                columns={[
                  { title: 'Catégorie', dataIndex: 'label' },
                  { title: 'Nombre', dataIndex: 'n', width: 100 },
                ]}
              />
            </Card>
          </Col>
        </Row>
      ) : null}
    </Space>
  );
}
