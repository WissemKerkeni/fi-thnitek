import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui/kit';

/** The "Report a problem" button of a history row (R-070). */
export function ReportLink({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return <IconButton icon="flag-outline" label={t('safety.reportTitle')} variant="tonal" onPress={onPress} />;
}
