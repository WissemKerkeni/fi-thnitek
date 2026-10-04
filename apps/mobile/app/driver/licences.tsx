import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DocumentList } from '../../src/driver/DocumentList';
import { StepHeader } from '../../src/driver/StepHeader';
import { useVerification } from '../../src/driver/useVerification';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';

/** D1 step 2 "Licences": driving licence and the professional card / operator authorisation. */
export default function StepLicences() {
  const { t } = useTranslation();
  const { data: file, refresh } = useVerification();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.title') }} />
      <StepHeader step={2} />
      {file ? (
        <DocumentList
          file={file}
          types={['DRIVING_LICENCE', 'PROFESSIONAL_CARD', 'OPERATOR_AUTHORISATION']}
          onUploaded={() => void refresh()}
        />
      ) : null}
      <Button icon="arrow-right" label={t('driver.next')} onPress={() => router.push('/driver/vehicle')} />
      <Button label={t('driver.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
