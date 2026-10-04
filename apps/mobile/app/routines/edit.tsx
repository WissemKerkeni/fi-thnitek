import type { RoutineView, Weekday } from '@fi-thnitek/contracts';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { fromIsoDate, toIsoDate } from '../../src/driver/date-input';
import { langOf, placeNames } from '../../src/places/format';
import { resetRoutinePlaces, swapRoutinePlaces, useRoutinePlaces } from '../../src/routines/draft';
import { ALL_DAYS, stepTime, tunisParts, tunisToIso, tunisTomorrow } from '../../src/routines/format';
import { routineErrorMessage, useRoutineActions, useRoutines } from '../../src/routines/useRoutines';
import { colors, radii, sizes, spacing, typography } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Banner, Card, Chip, IconButton, SectionTitle } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';

/** D5 editor (Stitch "Trajet habituel"): from/to, one-off or weekly, days, time, seats, note, active. */
export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routines = useRoutines();
  if (id && !routines.data) return null;
  const routine = id ? routines.data?.routines.find((r) => r.id === id) : undefined;
  // Start the form from the saved routine, so render it only once that is known.
  return <Editor key={id ?? 'new'} routine={routine} />;
}

function Editor({ routine }: { routine?: RoutineView }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const places = useRoutinePlaces();
  const { save, remove } = useRoutineActions();
  const oneOff = routine?.schedule.kind === 'ONE_OFF' ? tunisParts(routine.schedule.at) : null;
  const [kind, setKind] = useState<'ONE_OFF' | 'WEEKLY'>(routine?.schedule.kind ?? 'WEEKLY');
  const [days, setDays] = useState<Weekday[]>(
    routine?.schedule.kind === 'WEEKLY' ? routine.schedule.days : ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  );
  const [time, setTime] = useState(
    routine?.schedule.kind === 'WEEKLY' ? routine.schedule.localTime : (oneOff?.time ?? '07:00'),
  );
  const initialDate = fromIsoDate(oneOff?.date ?? tunisTomorrow());
  const [day, setDay] = useState(initialDate.day);
  const [month, setMonth] = useState(initialDate.month);
  const [year, setYear] = useState(initialDate.year);
  const [seats, setSeats] = useState<number | null>(routine?.seats ?? null);
  const [note, setNote] = useState(routine?.note ?? '');
  const [active, setActive] = useState(routine?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resetRoutinePlaces({ from: routine?.from ?? null, to: routine?.to ?? null });
  }, [routine]);

  function toggleDay(d: Weekday) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : ALL_DAYS.filter((x) => x === d || prev.includes(x)),
    );
  }

  function submit() {
    setError(null);
    if (!places.from || !places.to) return setError(t('routines.error_places'));
    let schedule;
    if (kind === 'WEEKLY') {
      if (days.length === 0) return setError(t('routines.error_NO_DAYS'));
      schedule = { kind: 'WEEKLY' as const, days, localTime: time };
    } else {
      const date = toIsoDate(day, month, year);
      if (!date) return setError(t('routines.date'));
      schedule = { kind: 'ONE_OFF' as const, at: tunisToIso(date, time) };
    }
    save.mutate(
      {
        id: routine?.id ?? null,
        input: {
          fromPlaceId: places.from.id,
          toPlaceId: places.to.id,
          schedule,
          seats,
          note: note.trim() || null,
          active,
        },
      },
      { onSuccess: () => router.back(), onError: (e) => setError(routineErrorMessage(t, e)) },
    );
  }

  function confirmDelete() {
    if (!routine) return;
    Alert.alert(t('routines.deleteConfirm'), undefined, [
      { text: t('routines.cancel'), style: 'cancel' },
      {
        text: t('routines.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(routine.id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  const [hour, minute] = time.split(':');

  return (
    <Screen>
      <Stack.Screen options={{ title: routine ? t('routines.editorEdit') : t('routines.editorNew') }} />

      <Card>
        <PlaceRow
          icon="circle-outline"
          label={t('routines.from')}
          name={places.from ? placeNames(places.from, lang).name : null}
          onPress={() => router.push({ pathname: '/destination', params: { purpose: 'routine-from' } })}
        />
        <View style={styles.swapRow}>
          <View style={styles.dots} />
          <IconButton
            icon="swap-vertical"
            label={t('routines.swap')}
            variant="tonal"
            onPress={swapRoutinePlaces}
          />
        </View>
        <PlaceRow
          icon="map-marker"
          label={t('routines.to')}
          name={places.to ? placeNames(places.to, lang).name : null}
          onPress={() => router.push({ pathname: '/destination', params: { purpose: 'routine-to' } })}
        />
      </Card>

      <Card>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {(['WEEKLY', 'ONE_OFF'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === k }}
              onPress={() => setKind(k)}
              style={[styles.segmentItem, kind === k && styles.segmentOn]}
            >
              <Text variant="label" style={kind === k ? styles.segmentTextOn : styles.segmentText}>
                {k === 'WEEKLY' ? t('routines.weekly') : t('routines.oneOff')}
              </Text>
            </Pressable>
          ))}
        </View>

        {kind === 'WEEKLY' ? (
          <>
            <SectionTitle icon="calendar-week" title={t('routines.days')} />
            <View style={styles.days}>
              {ALL_DAYS.map((d) => (
                <Chip
                  key={d}
                  label={t(`routines.day_${d}`)}
                  selected={days.includes(d)}
                  accessibilityRole="switch"
                  onPress={() => toggleDay(d)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <SectionTitle icon="calendar" title={t('routines.date')} />
            <View style={styles.dateRow}>
              <DateBox value={day} onChange={setDay} placeholder={t('driver.day')} max={2} />
              <DateBox value={month} onChange={setMonth} placeholder={t('driver.month')} max={2} />
              <DateBox value={year} onChange={setYear} placeholder={t('driver.year')} max={4} wide />
            </View>
          </>
        )}

        <SectionTitle icon="clock-outline" title={t('routines.time')} />
        {/* Always 24 h, left to right, like a station clock. */}
        <View style={styles.clock}>
          <Stepper
            value={hour ?? '07'}
            label={t('routines.hour')}
            onUp={() => setTime(stepTime(time, 'hour', 1))}
            onDown={() => setTime(stepTime(time, 'hour', -1))}
          />
          <Text variant="display">:</Text>
          <Stepper
            value={minute ?? '00'}
            label={t('routines.minute')}
            onUp={() => setTime(stepTime(time, 'minute', 1))}
            onDown={() => setTime(stepTime(time, 'minute', -1))}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle icon="seat-passenger" title={t('routines.seatsOptional')} />
        <View style={styles.seats}>
          <IconButton
            icon="minus"
            label="−"
            variant="tonal"
            onPress={() => setSeats((s) => (s === null || s <= 1 ? null : s - 1))}
          />
          <Text variant="title" style={styles.seatValue}>
            {seats ?? '—'}
          </Text>
          <IconButton
            icon="plus"
            label="+"
            variant="filled"
            onPress={() => setSeats((s) => Math.min(60, (s ?? 0) + 1))}
          />
        </View>
        <TextField
          label={t('routines.note')}
          placeholder={t('routines.notePlaceholder')}
          value={note}
          onChangeText={setNote}
          maxLength={80}
        />
        <View style={styles.activeRow}>
          <Text variant="bodyStrong" style={styles.flex}>
            {t('routines.active')}
          </Text>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel={t('routines.active')}
          />
        </View>
      </Card>

      {error ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {error}
        </Banner>
      ) : null}
      <Button
        label={t('routines.save')}
        icon="content-save-outline"
        loading={save.isPending}
        onPress={submit}
      />
      {routine ? (
        <Button
          label={t('routines.delete')}
          icon="delete-outline"
          variant="danger"
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      ) : null}
    </Screen>
  );
}

function PlaceRow(props: {
  icon: 'circle-outline' | 'map-marker';
  label: string;
  name: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={styles.placeRow}
    >
      <Icon name={props.icon} color={props.icon === 'map-marker' ? colors.danger : colors.primary} />
      <View style={styles.flex}>
        <Text variant="caption" muted>
          {props.label}
        </Text>
        <Text variant="headline" style={props.name ? undefined : styles.placeholder}>
          {props.name ?? t('routines.choosePlace')}
        </Text>
      </View>
      <Icon name="chevron-right" color={colors.textMuted} />
    </Pressable>
  );
}

function Stepper(props: { value: string; label: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon="chevron-up" label={`${props.label} +`} variant="tonal" onPress={props.onUp} />
      <Text variant="display" accessibilityLabel={`${props.label} ${props.value}`}>
        {props.value}
      </Text>
      <IconButton icon="chevron-down" label={`${props.label} −`} variant="tonal" onPress={props.onDown} />
    </View>
  );
}

function DateBox(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  wide?: boolean;
}) {
  return (
    <TextInput
      maxFontSizeMultiplier={1.6}
      value={props.value}
      onChangeText={(v) => props.onChange(v.replace(/\D/g, ''))}
      placeholder={props.placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      maxLength={props.max}
      accessibilityLabel={props.placeholder}
      style={[styles.dateBox, props.wide && styles.dateBoxWide]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  placeholder: { color: colors.primary },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: spacing.md + 2,
  },
  dots: { width: 2, height: 28, backgroundColor: colors.border },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { color: colors.textMuted },
  segmentTextOn: { color: colors.primary },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    direction: 'ltr',
  },
  stepper: { alignItems: 'center', gap: spacing.xs },
  seats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  seatValue: { minWidth: 48, textAlign: 'center' },
  activeRow: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.minTouchTarget },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateBox: {
    ...typography.body,
    minHeight: sizes.minTouchTarget,
    minWidth: 64,
    borderWidth: 2,
    borderColor: colors.surfaceVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: colors.surfaceVariant,
  },
  dateBoxWide: { minWidth: 96 },
});
