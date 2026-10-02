import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError, defineMachine } from './fsm.js';

// Fixture: the driver sharing lifecycle from docs/domain-model.md (§ Sharing).
type State = 'NOT_SHARING' | 'SHARING' | 'ON_BREAK';
type Event = 'START' | 'TOGGLE_FULL' | 'START_BREAK' | 'RESUME' | 'BREAK_NOT_RESUMED' | 'END';

const sharing = defineMachine<State, Event>('sharing_session', {
  NOT_SHARING: { START: 'SHARING' },
  SHARING: { TOGGLE_FULL: 'SHARING', START_BREAK: 'ON_BREAK', END: 'NOT_SHARING' },
  ON_BREAK: { RESUME: 'SHARING', BREAK_NOT_RESUMED: 'NOT_SHARING' },
});

describe('defineMachine', () => {
  it('returns the target state for a defined transition', () => {
    expect(sharing.transition('NOT_SHARING', 'START')).toBe('SHARING');
    expect(sharing.transition('SHARING', 'START_BREAK')).toBe('ON_BREAK');
    expect(sharing.transition('ON_BREAK', 'RESUME')).toBe('SHARING');
  });

  it('supports self-transitions', () => {
    expect(sharing.transition('SHARING', 'TOGGLE_FULL')).toBe('SHARING');
  });

  it('reports whether an event is allowed without throwing', () => {
    expect(sharing.can('SHARING', 'END')).toBe(true);
    // A break cannot be ended early: there is no END from ON_BREAK.
    expect(sharing.can('ON_BREAK', 'END')).toBe(false);
  });

  it('lists the allowed events from a state', () => {
    expect(sharing.allowedEvents('ON_BREAK')).toEqual(['RESUME', 'BREAK_NOT_RESUMED']);
    expect(sharing.allowedEvents('NOT_SHARING')).toEqual(['START']);
  });

  it('throws a typed error for an undefined transition', () => {
    let caught: unknown;
    try {
      sharing.transition('ON_BREAK', 'END');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidStateTransitionError);
    const error = caught as InvalidStateTransitionError;
    expect(error.code).toBe('INVALID_STATE_TRANSITION');
    expect(error.machine).toBe('sharing_session');
    expect(error.from).toBe('ON_BREAK');
    expect(error.event).toBe('END');
    expect(error.message).toBe('sharing_session: event END is not allowed from ON_BREAK');
  });

  it('assertTransition checks a from → to pair against any event', () => {
    expect(() => sharing.assertTransition('SHARING', 'ON_BREAK')).not.toThrow();
    expect(() => sharing.assertTransition('NOT_SHARING', 'ON_BREAK')).toThrow(InvalidStateTransitionError);
  });

  it('does not let callers mutate the transition table', () => {
    const table = sharing.transitions as Record<string, Record<string, string>>;
    expect(() => {
      table.ON_BREAK!.END = 'NOT_SHARING';
    }).toThrow(TypeError);
    expect(sharing.can('ON_BREAK', 'END')).toBe(false);
  });

  it('rejects a table that targets an unknown state', () => {
    expect(() => defineMachine<'A' | 'B', 'GO'>('broken', { A: { GO: 'C' as 'B' } })).toThrow(
      'broken: transition A --GO--> C targets an unknown state',
    );
  });
});
