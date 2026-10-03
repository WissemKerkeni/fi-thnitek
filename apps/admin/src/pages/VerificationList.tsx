import type { VerificationQueueItem, VerificationState } from '@fi-thnitek/contracts';
import { useQuery } from '@tanstack/react-query';
import { Alert, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { verificationsApi } from '../lib/verifications';

const STATES: { value: VerificationState; label: string }[] = [
  { value: 'UNDER_REVIEW', label: 'À vérifier' },
  { value: 'CHANGES_REQUESTED', label: 'Corrections demandées' },
  { value: 'VERIFIED', label: 'Vérifiés' },
  { value: 'EXPIRED', label: 'Expirés' },
  { value: 'REJECTED', label: 'Refusés' },
  { value: 'DRAFT', label: 'Brouillons' },
];

const TYPE_LABEL = { TAXI: 'Taxi', LOUAGE: 'Louage', BUS: 'Bus' } as const;

/** Verification queue (PRD §6), oldest submission first. */
export function VerificationList() {
  const [state, setState] = useState<VerificationState>('UNDER_REVIEW');
  const navigate = useNavigate();
  const queue = useQuery({
    queryKey: ['verifications', state],
    queryFn: () => verificationsApi.queue(state),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Vérification des chauffeurs</Typography.Title>
      <Select value={state} onChange={setState} options={STATES} style={{ width: 260 }} />
      {queue.isError ? <Alert type="error" showIcon message="Impossible de charger la file." /> : null}
      <Table<VerificationQueueItem>
        rowKey="userId"
        loading={queue.isPending}
        dataSource={queue.data ?? []}
        onRow={(row) => ({
          onClick: () => void navigate(`/verifications/${row.userId}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: 'Nom', render: (_, r) => `${r.legalFirstName} ${r.legalLastName}` },
          {
            title: 'Type',
            dataIndex: 'transportType',
            render: (t: VerificationQueueItem['transportType']) => TYPE_LABEL[t],
          },
          { title: 'Plaque', dataIndex: 'plateDisplay', render: (p: string | null) => p ?? '—' },
          {
            title: 'Soumis le',
            dataIndex: 'submittedAt',
            render: (d: string) => new Date(d).toLocaleString('fr-TN'),
          },
          {
            title: 'Alertes',
            dataIndex: 'warnings',
            render: (w: number) => (w > 0 ? <Tag color="red">{w} doublon(s)</Tag> : <Tag>0</Tag>),
          },
        ]}
      />
    </Space>
  );
}
