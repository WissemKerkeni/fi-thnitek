import type { AdminClientErrorGroup } from '@fi-thnitek/contracts';
import { AdminClientErrorList } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { adminSession } from '../lib/admin-session';
import { when } from '../lib/moderation';

/**
 * Phase 9 crash monitoring (ADR-223): crashes from the phones, grouped, scrubbed of personal data on
 * the phone and again on the server. No account and no position is attached.
 */
export function ClientErrorList() {
  const [days, setDays] = useState(7);
  const list = useQuery({
    queryKey: ['client-errors', days],
    queryFn: () => adminSession.request('GET', `/admin/client-errors?days=${days}`, AdminClientErrorList),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Erreurs de l’application</Typography.Title>
      <Segmented<number>
        value={days}
        onChange={setDays}
        options={[
          { value: 1, label: '24 h' },
          { value: 7, label: '7 jours' },
          { value: 30, label: '30 jours' },
        ]}
      />
      {list.isError ? <Alert type="error" showIcon message="Impossible de charger les erreurs." /> : null}
      <Table<AdminClientErrorGroup>
        rowKey="fingerprint"
        loading={list.isPending}
        dataSource={list.data?.groups ?? []}
        pagination={false}
        locale={{ emptyText: 'Aucune erreur sur la période' }}
        expandable={{
          expandedRowRender: (g) => (
            <Typography.Paragraph>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{g.stack ?? '(pas de pile)'}</pre>
            </Typography.Paragraph>
          ),
        }}
        columns={[
          {
            title: 'Erreur',
            render: (_, g) => (
              <Space direction="vertical" size={0}>
                <Space>
                  {g.fatal ? <Tag color="red">Plantage</Tag> : <Tag>Non bloquante</Tag>}
                  <Typography.Text strong>{g.name}</Typography.Text>
                </Space>
                <Typography.Text>{g.message}</Typography.Text>
              </Space>
            ),
          },
          { title: 'Écran', dataIndex: 'screen', render: (v: string | null) => v ?? '—' },
          { title: 'Occurrences', dataIndex: 'count', width: 110 },
          { title: 'Appareils', dataIndex: 'installs', width: 100 },
          { title: 'Versions', dataIndex: 'appVersions', render: (v: string[]) => v.join(', ') },
          { title: 'Dernière', dataIndex: 'lastAt', render: when },
        ]}
      />
    </Space>
  );
}
