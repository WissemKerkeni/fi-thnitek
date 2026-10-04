import type { AdminPickupRecord } from '@fi-thnitek/contracts';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, DatePicker, Form, Input, Segmented, Space, Table, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router';
import { moderationApi, when } from '../lib/moderation';

interface ByRequest {
  requestId: string;
}
interface ByDriver {
  driverUserId: string;
  range: [Dayjs, Dayjs];
}

/**
 * R-039 / NFR-06: the silent pick-up records, by request or by driver over a period. Admin-only; every
 * search is written to the audit log.
 */
export function PickupSearch() {
  const { message } = App.useApp();
  const [mode, setMode] = useState<'request' | 'driver'>('request');
  const search = useMutation({
    mutationFn: (v: ByRequest | ByDriver) =>
      'requestId' in v
        ? moderationApi.pickups({ requestId: v.requestId.trim() })
        : moderationApi.pickups({
            driverUserId: v.driverUserId.trim(),
            from: v.range[0].toISOString(),
            to: v.range[1].toISOString(),
          }),
    onError: () => void message.error('Recherche impossible (identifiant invalide ?).'),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Prises en charge</Typography.Title>
      <Alert
        type="warning"
        showIcon
        message="Données sensibles"
        description="Ces enregistrements servent uniquement à traiter un signalement. Chaque recherche est enregistrée dans le journal d’audit."
      />
      <Segmented<'request' | 'driver'>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'request', label: 'Par demande' },
          { value: 'driver', label: 'Par chauffeur et période' },
        ]}
      />
      {mode === 'request' ? (
        <Form<ByRequest> layout="inline" onFinish={(v) => search.mutate(v)}>
          <Form.Item name="requestId" rules={[{ required: true }]}>
            <Input placeholder="Identifiant de la demande" style={{ width: 360 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={search.isPending}>
            Rechercher
          </Button>
        </Form>
      ) : (
        <Form<ByDriver> layout="inline" onFinish={(v) => search.mutate(v)}>
          <Form.Item name="driverUserId" rules={[{ required: true }]}>
            <Input placeholder="Identifiant du chauffeur" style={{ width: 320 }} />
          </Form.Item>
          <Form.Item name="range" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={search.isPending}>
            Rechercher
          </Button>
        </Form>
      )}
      {search.data ? (
        <Table<AdminPickupRecord>
          rowKey={(r) => `${r.requestId}-${r.driver.id}`}
          dataSource={search.data.records}
          pagination={false}
          locale={{ emptyText: 'Aucune prise en charge enregistrée' }}
          columns={[
            { title: 'Heure', dataIndex: 'recordedAt', render: when },
            {
              title: 'Chauffeur',
              render: (_, r) => (
                <Link to={`/users/${r.driver.id}`}>{r.driver.name ?? r.driver.id.slice(0, 8)}</Link>
              ),
            },
            { title: 'Plaque', dataIndex: 'plateDisplay' },
            {
              title: 'Passager',
              render: (_, r) => (
                <Link to={`/users/${r.passenger.id}`}>{r.passenger.name ?? r.passenger.id.slice(0, 8)}</Link>
              ),
            },
            { title: 'Distance min.', render: (_, r) => `${r.minDistanceM} m` },
            { title: 'Demande', dataIndex: 'requestId', render: (v: string) => v.slice(0, 8) },
          ]}
        />
      ) : null}
    </Space>
  );
}
