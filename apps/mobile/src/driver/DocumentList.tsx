import type { DocumentType, MyVerification } from '@fi-thnitek/contracts';
import { DocumentSlot } from './DocumentSlot';

/** The required documents of this step, in order; the newest upload per type is shown. */
export function DocumentList({
  file,
  types,
  onUploaded,
}: {
  file: MyVerification;
  types: readonly DocumentType[];
  onUploaded: () => void;
}) {
  const required = types.filter((type) => file.requiredDocuments.includes(type));
  return (
    <>
      {required.map((type) => (
        <DocumentSlot
          key={type}
          type={type}
          current={file.documents.find((d) => d.type === type)}
          onUploaded={onUploaded}
        />
      ))}
    </>
  );
}
