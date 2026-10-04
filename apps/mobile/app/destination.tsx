import type { Place } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { titleKey, useChoosePlace, usePlacePurpose } from '../src/places/purpose';
import { langOf, placeNames } from '../src/places/format';
import { useDebouncedValue } from '../src/places/useDebouncedValue';
import { colors, radii, sizes, spacing, typography } from '../src/theme/tokens';
import { Icon, type IconName } from '../src/ui/Icon';
import { Text } from '../src/ui/Text';

const MIN_CHARS = 2;

const KIND_ICON: Record<Place['kind'], IconName> = {
  GOVERNORATE: 'map-outline',
  DELEGATION: 'map-marker-outline',
  CITY: 'city-variant-outline',
  NEIGHBOURHOOD: 'home-group',
  LOUAGE_STATION: 'van-passenger',
  BUS_STATION: 'bus-stop',
  AIRPORT: 'airplane',
  LANDMARK: 'star-outline',
};

/**
 * Destination search (R-011): accent/hamza-insensitive suggestions in AR and FR, or pick on the map.
 * With a `purpose` it picks a driver's "heading to" (R-051) or a routine's ends (R-065) instead.
 */
export default function DestinationScreen() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const purpose = usePlacePurpose();
  const choosePlace = useChoosePlace(purpose);
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
    choosePlace(place);
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
      <Stack.Screen options={{ title: t(titleKey(purpose)) }} />
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Icon name="magnify" color={colors.primary} />
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
          {text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.clearDestination')}
              onPress={() => setText('')}
              hitSlop={spacing.sm}
            >
              <Icon name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/pick-on-map', params: purpose === 'destination' ? {} : { purpose } })
          }
          style={styles.pickRow}
        >
          <View style={styles.pickIcon}>
            <Icon name="map-marker-radius" color={colors.primary} />
          </View>
          <Text variant="bodyStrong" style={[styles.pickText, styles.flex1]}>
            {t('places.pickOnMap')}
          </Text>
          <Icon name="chevron-right" color={colors.textMuted} />
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
            <View style={styles.empty}>
              <Icon
                name={ready ? 'map-search-outline' : 'keyboard-outline'}
                size={40}
                color={colors.textMuted}
              />
              <Text muted style={styles.center}>
                {empty}
              </Text>
            </View>
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
              <View style={styles.kindIcon}>
                <Icon name={KIND_ICON[item.kind]} color={colors.primary} />
              </View>
              <View style={styles.flex1}>
                <Text variant="bodyStrong">{name}</Text>
                <Text variant="caption" muted>
                  {other ? `${kind} · ${other}` : kind}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.primaryButtonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  input: { ...typography.body, flex: 1, color: colors.text, textAlign: 'auto' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.minTouchTarget },
  pickIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
  pickText: { color: colors.primary },
  list: { padding: spacing.md, gap: spacing.sm },
  spinner: { marginVertical: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.sm + 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.primaryContainer },
  kindIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
});
