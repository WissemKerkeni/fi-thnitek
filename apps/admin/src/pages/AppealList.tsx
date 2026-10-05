import type { AdminAppeal } from '@fi-thnitek/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import { SANCTION, moderationApi, when } from '../lib/moderation';

const PAGE_SIZE = 25;

/** R-073: messages from suspended or banned people. Lift the sanction from the person's page if needed. */
export function AppealList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['appeals', status, page],
    queryFn: () => moderationApi.appeals({ status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const close = useMutation({
    mutationFn: (id: string) => moderationApi.closeAppeal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void message.success('Message clôturé');
    },
    onError: () => void message.error('Impossible de clôturer.'),
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Contestations</Typography.Title>
      <Segmented<'OPEN' | 'CLOSED'>
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'OPEN', label: 'Ouvertes' },
          { value: 'CLOSED', label: 'Clôturées' },
        ]}
      />
      {list.isError ? (
        <Alert type="error" showIcon message="Impossible de charger les contestations." />
      ) : null}
      <Table<AdminAppeal>
        rowKey="id"
        loading={list.isPending}
        dataSource={list.data?.appeals ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: 'Personne',
            render: (_, a) => <Link to={`/users/${a.user.id}`}>{a.user.name ?? a.user.id.slice(0, 8)}</Link>,
          },
          {
            title: 'Sanction',
            render: (_, a) =>
              a.sanction ? (
                <Space direction="vertical" size={0}>
                  <Tag color={a.sanction.active ? 'red' : 'default'}>{SANCTION[a.sanction.type]}</Tag>
                  <Typography.Text type="secondary">{a.sanction.reason}</Typography.Text>
                </Space>
              ) : (
                '—'
              ),
          },
          { title: 'Message', dataIndex: 'message', width: '40%' },
          { title: 'Reçu', dataIndex: 'createdAt', render: when },
          {
            title: '',
            render: (_, a) =>
              a.status === 'OPEN' ? (
                <Button size="small" loading={close.isPending} onClick={() => close.mutate(a.id)}>
                  Clôturer
                </Button>
              ) : (
                <Typography.Text type="secondary">{when(a.handledAt)}</Typography.Text>
              ),
          },
        ]}
      />
    </Space>
  );
}
