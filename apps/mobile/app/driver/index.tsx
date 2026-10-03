import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useVerification } from '../../src/driver/useVerification';
import { colors } from '../../src/theme/tokens';

/** Editable file → the D1 form (step 1); otherwise the D2 status screen. */
export default function DriverEntry() {
  const { data } = useVerification();
  if (data) return <Redirect href={data.canEdit ? '/driver/you' : '/driver/status'} />;
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
