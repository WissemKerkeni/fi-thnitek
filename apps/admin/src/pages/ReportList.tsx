import type { AdminPickupRecord, AdminReport, AdminReportDetail } from '@fi-thnitek/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CATEGORY, SOURCE, moderationApi, when } from '../lib/moderation';

const PAGE_SIZE = 25;
const STATUS_LABEL = { OPEN: 'Ouvert', ACTIONED: 'Traité', DISMISSED: 'Classé' } as const;

export function PriorityTag({ r }: { r: Pick<AdminReport, 'priority'> }) {
  return r.priority === 'HIGH' ? <Tag color="red">Prioritaire</Tag> : <Tag>Normal</Tag>;
}

function PersonLink({ p }: { p: { id: string; name: string | null } | null }) {
  if (!p) return <Typography.Text type="secondary">À identifier (prises en charge)</Typography.Text>;
  return <Link to={`/users/${p.id}`}>{p.name ?? p.id.slice(0, 8)}</Link>;
}

/**
 * The reports queue (anti-abuse §3–4): UNSAFE and HARASSMENT first (review target < 24 h). The drawer
 * shows the linked request or session and, on demand, the pick-up records (each look is audited).
 */
export function ReportList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const userId = search.get('userId') ?? undefined;
  const [status, setStatus] = useState<'OPEN' | 'ACTIONED' | 'DISMISSED'>('OPEN');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pickups, setPickups] = useState<AdminPickupRecord[] | null>(null);

  const list = useQuery({
    queryKey: ['reports', status, userId, page],
    queryFn: () => moderationApi.reports({ status, userId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ['report', openId],
    queryFn: () => moderationApi.report(openId!),
    enabled: openId !== null,
  });

  const resolve = useMutation({
    mutationFn: (v: { id: string; status: 'ACTIONED' | 'DISMISSED' }) =>
      moderationApi.resolve(v.id, { status: v.status, note }),
    onSuccess: (d) => {
      queryClient.setQueryData(['report', d.id], d);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      setNote('');
      void message.success('Signalement mis à jour');
    },
    onError: () => void message.error('Impossible de mettre à jour le signalement.'),
  });
  const loadPickups = useMutation({
    mutationFn: (d: AdminReportDetail) =>
      d.requestId
        ? moderationApi.pickups({ requestId: d.requestId, reportId: d.id })
        : moderationApi.pickups({
            driverUserId: d.session!.driver.id,
            // Around the time the driver gave (or the whole session).
            from: new Date(
              new Date(d.approxAt ?? d.session!.startedAt).getTime() - 30 * 60_000,
            ).toISOString(),
            to: new Date(
              new Date(d.approxAt ?? d.session!.endedAt ?? d.createdAt).getTime() + 30 * 60_000,
            ).toISOString(),
            reportId: d.id,
          }),
    onSuccess: (r) => setPickups(r.records),
    onError: () => void message.error('Impossible de charger les prises en charge.'),
  });

  const d = detail.data;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Signalements</Typography.Title>
      {userId ? (
        <Alert type="info" showIcon message={<Link to="/reports">Une seule personne · tout afficher</Link>} />
      ) : null}
      <Segmented<'OPEN' | 'ACTIONED' | 'DISMISSED'>
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'OPEN', label: 'À traiter' },
          { value: 'ACTIONED', label: 'Traités' },
          { value: 'DISMISSED', label: 'Classés' },
        ]}
      />
      {list.isError ? (
        <Alert type="error" showIcon message="Impossible de charger les signalements." />
      ) : null}
      <Table<AdminReport>
        rowKey="id"
        loading={list.isPending}
        dataSource={list.data?.reports ?? []}
        onRow={(row) => ({
          onClick: () => {
            setOpenId(row.id);
            setPickups(null);
          },
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          { title: 'Priorité', render: (_, r) => <PriorityTag r={r} />, width: 120 },
          { title: 'Catégorie', dataIndex: 'category', render: (c: AdminReport['category']) => CATEGORY[c] },
          { title: 'Origine', dataIndex: 'source', render: (s: AdminReport['source']) => SOURCE[s] },
          { title: 'Signalé par', render: (_, r) => r.reporter.name ?? '—' },
          { title: 'Concerne', render: (_, r) => r.target?.name ?? 'À identifier' },
          { title: 'Reçu', dataIndex: 'createdAt', render: when },
        ]}
      />

      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        width={560}
        title="Signalement"
        destroyOnHidden
      >
        {d ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <PriorityTag r={d} />
              <Tag>{CATEGORY[d.category]}</Tag>
              <Tag>{STATUS_LABEL[d.status]}</Tag>
            </Space>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Origine">{SOURCE[d.source]}</Descriptions.Item>
              <Descriptions.Item label="Signalé par">
                <PersonLink p={d.reporter} />
              </Descriptions.Item>
              <Descriptions.Item label="Concerne">
                <PersonLink p={d.target} />
                {d.target ? ` · ${d.targetReports30d} autre(s) signalement(s) en 30 j` : null}
              </Descriptions.Item>
              <Descriptions.Item label="Reçu">{when(d.createdAt)}</Descriptions.Item>
              {d.approxAt ? (
                <Descriptions.Item label="Heure indiquée">{when(d.approxAt)}</Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Détails">{d.description || '—'}</Descriptions.Item>
              {d.request ? (
                <Descriptions.Item label="Demande">
                  <PersonLink p={d.request.passenger} /> → {d.request.destinationName ?? 'point sur la carte'}{' '}
                  · {d.request.status} · {when(d.request.createdAt)}
                </Descriptions.Item>
              ) : null}
              {d.session ? (
                <Descriptions.Item label="Partage">
                  <PersonLink p={d.session.driver} /> · {d.session.plateDisplay ?? ''} ·{' '}
                  {when(d.session.startedAt)} → {when(d.session.endedAt)}
                </Descriptions.Item>
              ) : null}
              {d.handledAt ? (
                <Descriptions.Item label="Traité">
                  {d.handledBy?.name ?? '—'} · {when(d.handledAt)}{' '}
                  {d.resolutionNote ? `· ${d.resolutionNote}` : ''}
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            {d.request || d.session ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button onClick={() => loadPickups.mutate(d)} loading={loadPickups.isPending}>
                  Voir les prises en charge
                </Button>
                <Typography.Text type="secondary">
                  Chaque consultation est enregistrée dans le journal d’audit.
                </Typography.Text>
                {pickups ? (
                  <Table<AdminPickupRecord>
                    size="small"
                    rowKey={(r) => `${r.requestId}-${r.driver.id}`}
                    dataSource={pickups}
                    pagination={false}
                    locale={{ emptyText: 'Aucune prise en charge enregistrée' }}
                    columns={[
                      { title: 'Chauffeur', render: (_, r) => <PersonLink p={r.driver} /> },
                      { title: 'Plaque', dataIndex: 'plateDisplay' },
                      { title: 'Passager', render: (_, r) => <PersonLink p={r.passenger} /> },
                      { title: 'Distance min.', render: (_, r) => `${r.minDistanceM} m` },
                      { title: 'Heure', dataIndex: 'recordedAt', render: when },
                    ]}
                  />
                ) : null}
              </Space>
            ) : null}

            {d.status === 'OPEN' ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Note interne (facultatif)"
                />
                <Space>
                  <Button
                    type="primary"
                    loading={resolve.isPending}
                    onClick={() => resolve.mutate({ id: d.id, status: 'ACTIONED' })}
                  >
                    Marquer traité
                  </Button>
                  <Button
                    loading={resolve.isPending}
                    onClick={() => resolve.mutate({ id: d.id, status: 'DISMISSED' })}
                  >
                    Classer sans suite
                  </Button>
                  {d.target ? (
                    <Link to={`/users/${d.target.id}?report=${d.id}`}>
                      <Button danger>Sanctionner…</Button>
                    </Link>
                  ) : null}
                </Space>
              </Space>
            ) : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">Chargement…</Typography.Text>
        )}
      </Drawer>
    </Space>
  );
}
