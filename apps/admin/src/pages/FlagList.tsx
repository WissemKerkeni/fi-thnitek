import type { AdminRiskFlag } from '@fi-thnitek/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FLAG, moderationApi, when } from '../lib/moderation';

const PAGE_SIZE = 25;

/** Risk flags (anti-abuse §3): automatic signals for a human to review; they never sanction by themselves. */
export function FlagList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const userId = search.get('userId') ?? undefined;
  const [reviewed, setReviewed] = useState<'open' | 'done'>('open');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['flags', reviewed, userId, page],
    queryFn: () => moderationApi.flags({ reviewed: reviewed === 'done', userId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const review = useMutation({
    mutationFn: (id: string) => moderationApi.reviewFlag(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['flags'] });
      void message.success('Alerte revue');
    },
    onError: () => void message.error('Impossible de marquer l’alerte.'),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Alertes</Typography.Title>
      <Segmented<'open' | 'done'>
        value={reviewed}
        onChange={(v) => {
          setReviewed(v);
          setPage(1);
        }}
        options={[
          { value: 'open', label: 'À revoir' },
          { value: 'done', label: 'Revues' },
        ]}
      />
      {list.isError ? <Alert type="error" showIcon message="Impossible de charger les alertes." /> : null}
      <Table<AdminRiskFlag>
        rowKey="id"
        loading={list.isPending}
        dataSource={list.data?.flags ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: 'Type',
            dataIndex: 'type',
            render: (t: AdminRiskFlag['type']) => <Tag color="orange">{FLAG[t]}</Tag>,
          },
          {
            title: 'Personne',
            render: (_, f) => <Link to={`/users/${f.user.id}`}>{f.user.name ?? f.user.id.slice(0, 8)}</Link>,
          },
          {
            title: 'Mesures',
            dataIndex: 'evidence',
            render: (e: AdminRiskFlag['evidence']) =>
              Object.entries(e)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(' · ') || '—',
          },
          { title: 'Créée', dataIndex: 'createdAt', render: when },
          {
            title: '',
            render: (_, f) =>
              f.reviewedAt ? (
                <Typography.Text type="secondary">revue {when(f.reviewedAt)}</Typography.Text>
              ) : (
                <Button size="small" loading={review.isPending} onClick={() => review.mutate(f.id)}>
                  Marquer revue
                </Button>
              ),
          },
        ]}
      />
    </Space>
  );
}
