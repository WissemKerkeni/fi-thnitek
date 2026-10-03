import type { AdminPlace, PlaceInput, PlaceKind } from '@fi-thnitek/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { placesApi } from '../lib/places';

const KIND_LABEL: Record<PlaceKind, string> = {
  GOVERNORATE: 'Gouvernorat',
  DELEGATION: 'Délégation',
  CITY: 'Ville',
  NEIGHBOURHOOD: 'Quartier',
  LOUAGE_STATION: 'Station louage',
  BUS_STATION: 'Gare routière',
  AIRPORT: 'Aéroport',
  LANDMARK: 'Lieu connu',
};
const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));
const PAGE_SIZE = 25;

interface FormValues {
  kind: PlaceKind;
  nameAr: string;
  nameFr: string;
  aliases: string[];
  lat: number;
  lng: number;
  governorateCode?: string | null;
  popularity?: number | null;
}

const toInput = (v: FormValues): PlaceInput => ({
  kind: v.kind,
  nameAr: v.nameAr,
  nameFr: v.nameFr,
  aliases: v.aliases,
  location: { lat: v.lat, lng: v.lng },
  governorateCode: v.governorateCode?.trim() || null,
  ...(v.popularity != null && { popularity: v.popularity }),
});

const toForm = (p: AdminPlace): FormValues => ({
  kind: p.kind,
  nameAr: p.nameAr,
  nameFr: p.nameFr,
  aliases: p.aliases,
  lat: p.location.lat,
  lng: p.location.lng,
  governorateCode: p.governorateCode,
  popularity: p.popularity,
});

/** Places (R-010): search, fix names/aliases/positions, add missing stations. */
export function PlaceList() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminPlace | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();

  const list = useQuery({
    queryKey: ['places', q, page],
    queryFn: () => placesApi.list(q, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing === 'new' || !editing
        ? placesApi.create(toInput(values))
        : placesApi.update(editing.id, toInput(values)),
    onSuccess: () => {
      void message.success('Lieu enregistré');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['places'] });
    },
    onError: () => void message.error('Enregistrement impossible : vérifiez les champs.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => placesApi.remove(id),
    onSuccess: () => {
      void message.success('Lieu supprimé');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['places'] });
    },
    onError: () => void message.error('Suppression impossible.'),
  });

  function open(target: AdminPlace | 'new') {
    setEditing(target);
    form.resetFields();
    form.setFieldsValue(target === 'new' ? { kind: 'LOUAGE_STATION', aliases: [] } : toForm(target));
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>Lieux</Typography.Title>
      <Space wrap>
        <Input.Search
          allowClear
          placeholder="Nom en arabe ou en français"
          onSearch={(value) => {
            setQ(value);
            setPage(1);
          }}
          style={{ width: 320 }}
        />
        <Button type="primary" onClick={() => open('new')}>
          Ajouter un lieu
        </Button>
      </Space>
      {list.isError ? <Alert type="error" showIcon message="Impossible de charger les lieux." /> : null}
      <Table<AdminPlace>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.places ?? []}
        onRow={(row) => ({ onClick: () => open(row), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: list.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          { title: 'Nom (fr)', dataIndex: 'nameFr' },
          { title: 'Nom (ar)', dataIndex: 'nameAr', render: (v: string) => <span dir="rtl">{v}</span> },
          { title: 'Type', dataIndex: 'kind', render: (k: PlaceKind) => KIND_LABEL[k] },
          { title: 'Popularité', dataIndex: 'popularity', width: 110 },
          {
            title: 'Source',
            dataIndex: 'source',
            render: (s: string) => (
              <Tag color={s.startsWith('admin:') ? 'gold' : undefined}>{s.split(':')[0]}</Tag>
            ),
          },
        ]}
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        width={480}
        title={editing === 'new' ? 'Nouveau lieu' : 'Modifier le lieu'}
        destroyOnHidden
        extra={
          editing && editing !== 'new' ? (
            <Popconfirm
              title="Supprimer ce lieu ?"
              okText="Supprimer"
              cancelText="Annuler"
              onConfirm={() => remove.mutate(editing.id)}
            >
              <Button danger loading={remove.isPending}>
                Supprimer
              </Button>
            </Popconfirm>
          ) : null
        }
      >
        {editing && editing !== 'new' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Source : ${editing.source}. Une fois modifié, ce lieu n'est plus écrasé par les imports.`}
          />
        ) : null}
        <Form<FormValues> form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
            <Select options={KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="nameAr" label="Nom (arabe)" rules={[{ required: true, max: 120 }]}>
            <Input dir="rtl" />
          </Form.Item>
          <Form.Item name="nameFr" label="Nom (français)" rules={[{ required: true, max: 120 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="aliases" label="Autres noms (Entrée pour ajouter)">
            <Select mode="tags" open={false} tokenSeparators={[';']} />
          </Form.Item>
          <Space>
            <Form.Item name="lat" label="Latitude" rules={[{ required: true }]}>
              <InputNumber min={30} max={38} step={0.0001} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="lng" label="Longitude" rules={[{ required: true }]}>
              <InputNumber min={7} max={12} step={0.0001} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item
              name="governorateCode"
              label="Code gouvernorat"
              rules={[{ pattern: /^TN-\d{2}$/, message: 'Format TN-11' }]}
            >
              <Input placeholder="TN-11" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="popularity" label="Popularité (0–100)">
              <InputNumber min={0} max={100} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Button type="primary" htmlType="submit" loading={save.isPending} block>
            Enregistrer
          </Button>
        </Form>
      </Drawer>
    </Space>
  );
}
