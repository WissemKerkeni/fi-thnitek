import type { AdminSession, SessionEndReason, SessionEventType } from '@fi-thnitek/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Drawer,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useState } from 'react';
import { sessionsApi } from '../lib/sessions';

const PAGE_SIZE = 25;

const END_REASON: Record<SessionEndReason, string> = {
  MANUAL_STOP: 'Arrêt manuel',
  LOCATION_OFF: 'Localisation coupée',
  PING_GAP: 'Plus de position',
  SPOOF_SUSPECTED: 'Position suspecte',
  MAX_DURATION: '12 h sans réponse',
  BREAK_NOT_RESUMED: 'Pause non reprise',
  SUSPENDED: 'Suspendu',
  ADMIN: 'Arrêté par un admin',
};

const EVENT: Record<SessionEventType, string> = {
  STARTED: 'Début',
  FULL_ON: 'Complet',
  FULL_OFF: 'Places disponibles',
  BREAK_STARTED: 'Pause',
  RESUMED: 'Reprise',
  HEADING_CHANGED: 'Destination modifiée',
  STILL_WORKING_PROMPTED: '« Toujours en service ? »',
  STILL_WORKING_CONFIRMED: 'Confirmé en service',
  ENDED: 'Fin',
};

const TYPE_LABEL = { TAXI: 'Taxi', LOUAGE: 'Louage', BUS: 'Bus' } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-TN') : '—');

function StateTag({ s }: { s: AdminSession }) {
  if (s.state === 'ENDED') return <Tag>{s.endReason ? END_REASON[s.endReason] : 'Terminé'}</Tag>;
  if (s.state === 'ON_BREAK') return <Tag color="gold">En pause</Tag>;
  return <Tag color="green">{s.isFull ? 'Partage · complet' : 'Partage'}</Tag>;
}

/** Sharing sessions (R-050…R-059): who shares now, how sessions ended, cooldowns. */
export function SessionList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'ended' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const active = filter === 'all' ? undefined : filter === 'active';

  const list = useQuery({
    queryKey: ['sessions', filter, page],
    queryFn: () => sessionsApi.list(active, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const detail = useQuery({
    queryKey: ['session', openId],
    queryFn: () => sessionsApi.detail(openId!),
    enabled: openId !== null,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const end = useMutation({
    mutationFn: (id: string) => sessionsApi.end(id),
    onSuccess: (d) => {
      queryClient.setQueryData(['session', d.id], d);
      refresh();
      void message.success('Session terminée (sans attente)');
    },
    onError: () => void message.error('Impossible de terminer la session.'),
  });
  const clear = useMutation({
    mutationFn: (driverUserId: string) => sessionsApi.clearCooldown(driverUserId),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      void message.success('Attente levée');
    },
    onError: () => void message.error('Impossible de lever l’attente.'),
  });

  const d = detail.data;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Sessions de partage</Typography.Title>
      <Segmented<'active' | 'ended' | 'all'>
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        options={[
          { value: 'active', label: 'En cours' },
          { value: 'ended', label: 'Terminées' },
          { value: 'all', label: 'Toutes' },
        ]}
      />
      {list.isError ? <Alert type="error" showIcon message="Impossible de charger les sessions." /> : null}
      <Table<AdminSession>
        rowKey="id"
        loading={list.isPending}
        dataSource={list.data?.sessions ?? []}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          { title: 'Chauffeur', dataIndex: 'driverName' },
          {
            title: 'Type',
            dataIndex: 'transportType',
            render: (t: AdminSession['transportType']) => TYPE_LABEL[t],
          },
          { title: 'Plaque', dataIndex: 'plateDisplay' },
          { title: 'État', render: (_, s) => <StateTag s={s} /> },
          { title: 'Début', dataIndex: 'startedAt', render: when },
          { title: 'Dernière position', dataIndex: 'lastFixAt', render: when },
          { title: 'Pauses', dataIndex: 'breaksCount', width: 80 },
          {
            title: 'Attente',
            dataIndex: 'driverCooldownUntil',
            render: (v: string | null) => (v ? <Tag color="red">jusqu’à {when(v)}</Tag> : '—'),
          },
        ]}
      />

      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        width={480}
        title="Session"
        destroyOnHidden
      >
        {d ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Text strong>
              {d.driverName} · {TYPE_LABEL[d.transportType]} · {d.plateDisplay}
            </Typography.Text>
            <StateTag s={d} />
            <Typography.Text type="secondary">
              Début {when(d.startedAt)} · fin {when(d.endedAt)} ·{' '}
              {d.cooldownApplied ? 'attente appliquée' : 'sans attente'}
            </Typography.Text>
            <Timeline
              items={d.events.map((e) => ({
                children: `${when(e.at)} — ${EVENT[e.type]}${
                  typeof e.meta.minutes === 'number' ? ` (${e.meta.minutes} min)` : ''
                }${typeof e.meta.reason === 'string' ? ` (${END_REASON[e.meta.reason as SessionEndReason] ?? e.meta.reason})` : ''}`,
              }))}
            />
            {d.state !== 'ENDED' ? (
              <Popconfirm
                title="Terminer cette session ?"
                description="Le chauffeur disparaît de la carte, sans attente d’une heure."
                okText="Terminer"
                cancelText="Annuler"
                onConfirm={() => end.mutate(d.id)}
              >
                <Button danger loading={end.isPending}>
                  Terminer la session
                </Button>
              </Popconfirm>
            ) : null}
            {d.driverCooldownUntil ? (
              <Popconfirm
                title="Lever l’attente de ce chauffeur ?"
                description="Par exemple si la batterie s’est vidée."
                okText="Lever"
                cancelText="Annuler"
                onConfirm={() => clear.mutate(d.driverUserId)}
              >
                <Button loading={clear.isPending}>
                  Lever l’attente (jusqu’à {when(d.driverCooldownUntil)})
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">Chargement…</Typography.Text>
        )}
      </Drawer>
    </Space>
  );
}
