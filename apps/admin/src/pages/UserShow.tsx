import type { AdminSanction, AdminSanctionType } from '@fi-thnitek/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { SANCTION, moderationApi, when } from '../lib/moderation';
import { StatusTag } from './UserList';

interface SanctionForm {
  type: AdminSanctionType;
  reason: string;
  days?: number;
}

/**
 * One person (R-073, anti-abuse §1.3): reports, flags, blocks, sanctions in force. Warnings, suspensions
 * and bans are decided here with a reason, which the person sees with the contact form. Audited.
 */
export function UserShow() {
  const { userId = '' } = useParams();
  const [search] = useSearchParams();
  const reportId = search.get('report');
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SanctionForm>();
  const [type, setType] = useState<AdminSanctionType>('WARNING');
  const [revokeReason, setRevokeReason] = useState('');

  const user = useQuery({ queryKey: ['user', userId], queryFn: () => moderationApi.user(userId) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['user', userId] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
  const sanction = useMutation({
    mutationFn: (v: SanctionForm) =>
      moderationApi.sanction(userId, {
        type: v.type,
        reason: v.reason,
        days: v.type === 'SUSPENSION' ? (v.days ?? 7) : null,
        reportId,
      }),
    onSuccess: (d) => {
      queryClient.setQueryData(['user', userId], d);
      refresh();
      form.resetFields();
      void message.success('Sanction appliquée');
    },
    onError: () => void message.error('Impossible d’appliquer la sanction.'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => moderationApi.revokeSanction(id, revokeReason),
    onSuccess: () => {
      refresh();
      setRevokeReason('');
      void message.success('Sanction levée');
    },
    onError: () => void message.error('Impossible de lever la sanction (motif de 5 caractères minimum).'),
  });

  const u = user.data;
  if (user.isError) return <Alert type="error" showIcon message="Utilisateur introuvable." />;
  if (!u) return <Typography.Text type="secondary">Chargement…</Typography.Text>;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>
        {u.name ?? 'Sans nom'} <StatusTag status={u.status} />
      </Typography.Title>
      {reportId ? (
        <Alert type="info" showIcon message="Sanction liée au signalement : il sera marqué traité." />
      ) : null}
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="Identifiant">{u.id}</Descriptions.Item>
        <Descriptions.Item label="Inscrit">{when(u.createdAt)}</Descriptions.Item>
        <Descriptions.Item label="Dossier chauffeur">{u.driverStatus ?? 'Passager'}</Descriptions.Item>
        <Descriptions.Item label="Signalements reçus">
          <Link to={`/reports?userId=${u.id}`}>{u.reportsAgainst}</Link>
        </Descriptions.Item>
        <Descriptions.Item label="Signalements envoyés">{u.reportsFiled}</Descriptions.Item>
        <Descriptions.Item label="Bloqué par">{u.blockedBy} personne(s)</Descriptions.Item>
        <Descriptions.Item label="Alertes à revoir">
          <Link to={`/risk-flags?userId=${u.id}`}>{u.openFlags}</Link>
        </Descriptions.Item>
        <Descriptions.Item label="Activité 30 j">
          {u.requestsLast30d} demande(s) · {u.sessionsLast30d} partage(s)
        </Descriptions.Item>
      </Descriptions>

      <Card title="Sanctions">
        <Table<AdminSanction>
          rowKey="id"
          size="small"
          dataSource={u.sanctions}
          pagination={false}
          locale={{ emptyText: 'Aucune sanction' }}
          columns={[
            { title: 'Type', dataIndex: 'type', render: (t: AdminSanction['type']) => SANCTION[t] },
            { title: 'Motif', dataIndex: 'reason' },
            { title: 'Début', dataIndex: 'startsAt', render: when },
            { title: 'Fin', dataIndex: 'endsAt', render: (v: string | null) => (v ? when(v) : '—') },
            { title: 'Par', render: (_, s) => s.createdBy?.name ?? 'Automatique' },
            {
              title: 'État',
              render: (_, s) =>
                s.revokedAt ? (
                  <Tag>Levée</Tag>
                ) : s.active ? (
                  <Tag color="red">En cours</Tag>
                ) : (
                  <Tag>Terminée</Tag>
                ),
            },
            {
              title: '',
              render: (_, s) =>
                s.active ? (
                  <Popconfirm
                    title="Lever cette sanction ?"
                    description={
                      <Input
                        placeholder="Motif (obligatoire)"
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                      />
                    }
                    okText="Lever"
                    cancelText="Annuler"
                    onConfirm={() => revoke.mutate(s.id)}
                  >
                    <Button size="small">Lever</Button>
                  </Popconfirm>
                ) : null,
            },
          ]}
        />
      </Card>

      {u.status !== 'DELETED' ? (
        <Card title="Nouvelle sanction">
          <Form<SanctionForm>
            form={form}
            layout="vertical"
            initialValues={{ type: 'WARNING', days: 7 }}
            onValuesChange={(changed: Partial<SanctionForm>) => {
              if (changed.type) setType(changed.type);
            }}
            onFinish={(v) => sanction.mutate(v)}
          >
            <Form.Item name="type" label="Type">
              <Radio.Group
                options={(['WARNING', 'SUSPENSION', 'BAN'] as const).map((value) => ({
                  value,
                  label: SANCTION[value],
                }))}
              />
            </Form.Item>
            {type === 'SUSPENSION' ? (
              <Form.Item name="days" label="Durée (jours)" rules={[{ required: true }]}>
                <InputNumber min={1} max={365} />
              </Form.Item>
            ) : null}
            <Form.Item
              name="reason"
              label="Motif (visible par la personne)"
              rules={[{ required: true, min: 5, max: 500 }]}
            >
              <Input.TextArea maxLength={500} />
            </Form.Item>
            <Typography.Paragraph type="secondary">
              Une suspension ou un bannissement déconnecte la personne partout, arrête son partage (sans
              attente) et retire sa demande en cours.
            </Typography.Paragraph>
            <Popconfirm
              title={`Appliquer : ${SANCTION[type]} ?`}
              okText="Appliquer"
              cancelText="Annuler"
              onConfirm={() => form.submit()}
            >
              <Button danger={type !== 'WARNING'} type="primary" loading={sanction.isPending}>
                Appliquer
              </Button>
            </Popconfirm>
          </Form>
        </Card>
      ) : null}
    </Space>
  );
}
