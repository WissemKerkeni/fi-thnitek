import type { AdminUserRow } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { STATUS, moderationApi, when } from '../lib/moderation';

const PAGE_SIZE = 25;

export function StatusTag({ status }: { status: AdminUserRow['status'] }) {
  const color = { ACTIVE: 'green', SUSPENDED: 'orange', BANNED: 'red', DELETED: 'default' }[status];
  return <Tag color={color}>{STATUS[status]}</Tag>;
}

/** People (PRD §6): search by name or id, then open the moderation view. */
export function UserList() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminUserRow['status'] | undefined>(undefined);
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['users', q, status, page],
    queryFn: () => moderationApi.users({ q, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Utilisateurs</Typography.Title>
      <Space wrap>
        <Input.Search
          allowClear
          placeholder="Nom ou identifiant"
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          style={{ width: 320 }}
        />
        <Select
          allowClear
          placeholder="Statut"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          style={{ width: 180 }}
          options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))}
        />
      </Space>
      {list.isError ? (
        <Alert type="error" showIcon message="Impossible de charger les utilisateurs." />
      ) : null}
      <Table<AdminUserRow>
        rowKey="id"
        loading={list.isPending}
        dataSource={list.data?.users ?? []}
        onRow={(row) => ({ onClick: () => void navigate(`/users/${row.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          { title: 'Nom', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
          {
            title: 'Statut',
            dataIndex: 'status',
            render: (s: AdminUserRow['status']) => <StatusTag status={s} />,
          },
          {
            title: 'Chauffeur',
            dataIndex: 'driverStatus',
            render: (v: string | null) => (v ? <Tag>{v}</Tag> : 'Passager'),
          },
          { title: 'Inscrit', dataIndex: 'createdAt', render: when },
        ]}
      />
    </Space>
  );
}
