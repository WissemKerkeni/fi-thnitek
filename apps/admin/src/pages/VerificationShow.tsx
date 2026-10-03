import type { AdminVerificationDetail, DecisionRequest, DocumentView } from '@fi-thnitek/contracts';
import { useGetIdentity } from '@refinedev/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AdminApiError } from '../lib/session';
import { verificationsApi } from '../lib/verifications';

const DOC_LABEL: Record<DocumentView['type'], string> = {
  CIN_FRONT: 'CIN (recto)',
  CIN_BACK: 'CIN (verso)',
  SELFIE: 'Selfie',
  DRIVING_LICENCE: 'Permis de conduire',
  PROFESSIONAL_CARD: 'Carte professionnelle',
  VEHICLE_REGISTRATION: 'Carte grise',
  INSURANCE: 'Assurance',
  OPERATING_CARD: "Carte d'exploitation",
  OPERATOR_AUTHORISATION: "Autorisation de l'exploitant",
  VEHICLE_PHOTO: 'Photo du véhicule',
};
const STATUS_COLOR = { PENDING: 'gold', ACCEPTED: 'green', REJECTED: 'red' } as const;

type DocNote = { status: 'ACCEPTED' | 'REJECTED'; reason?: string };

/** Review page: identity (audited CIN reveal), vehicle, documents (60-s signed links), warnings, decision. */
export function VerificationShow() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const detail = useQuery({
    queryKey: ['verification', userId],
    queryFn: () => verificationsApi.detail(userId),
  });
  const [notes, setNotes] = useState<Record<string, DocNote>>({});
  const [reason, setReason] = useState('');

  const decide = useMutation({
    mutationFn: (decision: DecisionRequest['decision']) =>
      verificationsApi.decide(userId, {
        decision,
        ...(reason.trim() && { reason: reason.trim() }),
        documents: Object.entries(notes).map(([documentId, n]) => ({ documentId, ...n })),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['verification', userId], data);
      void queryClient.invalidateQueries({ queryKey: ['verifications'] });
      void message.success('Décision enregistrée — le chauffeur est notifié.');
      void navigate('/verifications');
    },
    onError: (error) => {
      const code = error instanceof AdminApiError ? error.code : undefined;
      void message.error(
        code === 'VALIDATION_FAILED'
          ? 'Un motif est requis (et aucun document refusé pour valider).'
          : code === 'VERIFICATION_INCOMPLETE'
            ? 'Le dossier est incomplet.'
            : 'La décision a échoué.',
      );
    },
  });

  if (detail.isPending) return <Spin />;
  if (detail.isError) return <Alert type="error" showIcon message="Dossier introuvable." />;
  const file: AdminVerificationDetail = detail.data;
  const reviewable = file.state === 'UNDER_REVIEW';

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>
        {file.legalFirstName} {file.legalLastName} <Tag>{file.state}</Tag>
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Chaque consultation de ce dossier et de ses documents est enregistrée dans le journal d'audit."
      />
      {file.warnings.length > 0 ? (
        <Alert
          type="error"
          showIcon
          message="Doublons détectés"
          description={file.warnings.map((w, i) => (
            <div key={i}>
              {w.kind === 'DOCUMENT' ? `Document « ${DOC_LABEL[w.documentType!]} »` : w.kind} identique à un
              autre compte ({w.otherUserId.slice(0, 8)}…)
            </div>
          ))}
        />
      ) : null}

      <Descriptions bordered column={1} size="small" title="Identité et véhicule">
        <Descriptions.Item label="Type">{file.transportType}</Descriptions.Item>
        <Descriptions.Item label="CIN">{file.cin}</Descriptions.Item>
        <Descriptions.Item label="Véhicule">
          {file.vehicle
            ? `${file.vehicle.plateDisplay} · ${file.vehicle.model} · ${file.vehicle.color} · ${file.vehicle.seats} places`
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Soumis le">
          {file.submittedAt ? new Date(file.submittedAt).toLocaleString('fr-TN') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Documents manquants">
          {file.missingDocuments.length ? file.missingDocuments.map((d) => DOC_LABEL[d]).join(', ') : 'Aucun'}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap align="start">
        {file.documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            note={notes[doc.id]}
            editable={reviewable}
            onNote={(n) => setNotes((all) => ({ ...all, [doc.id]: n }))}
          />
        ))}
      </Space>

      {reviewable ? (
        <Card title="Décision">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input.TextArea
              rows={3}
              maxLength={500}
              placeholder="Motif (obligatoire pour demander des corrections ou refuser)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Space wrap>
              <Button type="primary" loading={decide.isPending} onClick={() => decide.mutate('APPROVE')}>
                Valider
              </Button>
              <Button loading={decide.isPending} onClick={() => decide.mutate('REQUEST_CHANGES')}>
                Demander des corrections
              </Button>
              <Button danger loading={decide.isPending} onClick={() => decide.mutate('REJECT')}>
                Refuser
              </Button>
            </Space>
          </Space>
        </Card>
      ) : null}
    </Space>
  );
}

function DocumentCard(props: {
  doc: DocumentView;
  note?: DocNote;
  editable: boolean;
  onNote: (n: DocNote) => void;
}) {
  const { doc, note, editable, onNote } = props;
  const [open, setOpen] = useState(false);
  const url = useQuery({
    queryKey: ['document-url', doc.id],
    queryFn: () => verificationsApi.documentUrl(doc.id),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <Card
      size="small"
      style={{ width: 280 }}
      title={DOC_LABEL[doc.type]}
      extra={<Tag color={STATUS_COLOR[doc.status]}>{doc.status}</Tag>}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {doc.expiresOn ? <Typography.Text>Expire le {doc.expiresOn}</Typography.Text> : null}
        {doc.rejectionReason ? <Typography.Text type="danger">{doc.rejectionReason}</Typography.Text> : null}
        <Button block onClick={() => setOpen(true)}>
          Voir le document
        </Button>
        {editable ? (
          <>
            <Radio.Group
              value={note?.status ?? null}
              onChange={(e) => onNote({ status: e.target.value as DocNote['status'], reason: note?.reason })}
              options={[
                { label: 'Conforme', value: 'ACCEPTED' },
                { label: 'À refaire', value: 'REJECTED' },
              ]}
            />
            {note?.status === 'REJECTED' ? (
              <Input
                maxLength={300}
                placeholder="Motif pour le chauffeur"
                value={note.reason}
                onChange={(e) => onNote({ status: 'REJECTED', reason: e.target.value })}
              />
            ) : null}
          </>
        ) : null}
      </Space>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={720} destroyOnHidden>
        {url.data ? <WatermarkedImage src={url.data.url} /> : <Spin />}
      </Modal>
    </Card>
  );
}

/** On-screen watermark with the reviewing admin and time (deterrent; the view itself is audited). */
function WatermarkedImage({ src }: { src: string }) {
  const { data: identity } = useGetIdentity<{ name: string }>();
  const stamp = `${identity?.name ?? 'admin'} · ${new Date().toLocaleString('fr-TN')} · confidentiel`;
  return (
    <div style={{ position: 'relative', userSelect: 'none' }} onContextMenu={(e) => e.preventDefault()}>
      <img src={src} alt="" style={{ width: '100%', display: 'block' }} draggable={false} />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'space-around',
          justifyContent: 'space-around',
          pointerEvents: 'none',
          color: 'rgba(180, 35, 24, 0.35)',
          fontWeight: 700,
          transform: 'rotate(-20deg)',
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i}>{stamp}</span>
        ))}
      </div>
    </div>
  );
}
