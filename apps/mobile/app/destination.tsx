import type { Place } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { setDestination } from '../src/places/destination';
import { useChooseHeading } from '../src/sharing/useChooseHeading';
import { langOf, placeNames } from '../src/places/format';
import { useDebouncedValue } from '../src/places/useDebouncedValue';
import { colors, radii, sizes, spacing, typography } from '../src/theme/tokens';
import { Text } from '../src/ui/Text';

const MIN_CHARS = 2;

/**
 * Destination search (R-011): accent/hamza-insensitive suggestions in AR and FR, or pick on the map.
 * With `purpose=heading` it picks a driver's "heading to" instead (R-051).
 */
export default function DestinationScreen() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const heading = useLocalSearchParams<{ purpose?: string }>().purpose === 'heading';
  const chooseHeading = useChooseHeading();
  const lang = langOf(i18n.language);
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 250);
  const ready = q.length >= MIN_CHARS;

  const results = useQuery({
    queryKey: ['places', 'search', q],
    queryFn: () => api.searchPlaces({ q, limit: 12 }),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  function choose(place: Place) {
    if (heading) void chooseHeading(place).catch(() => undefined);
    else setDestination({ point: place.location, place, distanceM: 0 });
    router.back();
  }

  const places = ready ? (results.data?.places ?? []) : [];
  const empty = !ready
    ? t('places.typeMore')
    : results.isError
      ? t('common.error')
      : results.isSuccess && places.length === 0
        ? t('places.noResults')
        : null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: heading ? t('sharing.headingTo') : t('places.searchTitle') }} />
      <View style={styles.header}>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          placeholder={t('map.searchPlaceholder')}
          accessibilityLabel={t('places.searchLabel')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/pick-on-map', params: heading ? { purpose: 'heading' } : {} })
          }
          style={styles.pickRow}
        >
          <Text style={styles.pickIcon}>📍</Text>
          <Text variant="bodyStrong" style={styles.pickText}>
            {t('places.pickOnMap')}
          </Text>
        </Pressable>
      </View>
      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          ready && results.isFetching ? (
            <ActivityIndicator color={colors.primary} style={styles.spinner} />
          ) : null
        }
        ListEmptyComponent={
          empty ? (
            <Text muted style={styles.empty}>
              {empty}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const { name, other } = placeNames(item, lang);
          const kind = t(`places.kind.${item.kind}`);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${kind}`}
              onPress={() => choose(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text variant="bodyStrong" style={styles.rowText}>
                {name}
              </Text>
              <Text muted style={styles.rowText}>
                {other ? `${kind} · ${other}` : kind}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface },
  input: {
    ...typography.body,
    minHeight: sizes.primaryButtonHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    color: colors.text,
    textAlign: 'auto',
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.minTouchTarget },
  pickIcon: { fontSize: 18 },
  pickText: { color: colors.primary },
  list: { paddingVertical: spacing.sm },
  spinner: { marginVertical: spacing.sm },
  empty: { padding: spacing.md, textAlign: 'center' },
  row: {
    minHeight: sizes.minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.primaryContainer },
  rowText: { textAlign: 'auto' },
});
