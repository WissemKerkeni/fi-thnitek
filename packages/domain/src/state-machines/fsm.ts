/**
 * Minimal, dependency-free finite-state machine helper.
 * Lifecycles (driver verification, sharing sessions, passenger requests) are declared as tables of
 * `from → event → to`; terminal states are declared with no events (`CLOSED: {}`).
 * The API applies them inside conditional updates (CLAUDE.md rule 5).
 */

export type TransitionTable<S extends string, E extends string> = {
  readonly [From in S]?: { readonly [Ev in E]?: S };
};

export class InvalidStateTransitionError<S extends string = string, E extends string = string> extends Error {
  readonly code = 'INVALID_STATE_TRANSITION' as const;

  constructor(
    readonly machine: string,
    readonly from: S,
    readonly event: E | undefined,
    readonly to?: S,
  ) {
    super(
      event === undefined
        ? `${machine}: no transition from ${from} to ${to}`
        : `${machine}: event ${event} is not allowed from ${from}`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export interface Machine<S extends string, E extends string> {
  readonly name: string;
  readonly transitions: TransitionTable<S, E>;
  /** True when `event` is defined from `from`. */
  can(from: S, event: E): boolean;
  /** Events defined from `from`, in declaration order. */
  allowedEvents(from: S): E[];
  /** Target state of `event` from `from`; throws {@link InvalidStateTransitionError} if undefined. */
  transition(from: S, event: E): S;
  /** Throws {@link InvalidStateTransitionError} unless some event leads from `from` to `to`. */
  assertTransition(from: S, to: S): void;
}

export function defineMachine<S extends string, E extends string>(
  name: string,
  table: TransitionTable<S, E>,
): Machine<S, E> {
  // Every target must itself be declared (terminal states as `STATE: {}`), so typos fail at startup.
  for (const [from, events] of Object.entries<Partial<Record<E, S>> | undefined>(table)) {
    for (const [event, to] of Object.entries<S | undefined>(events ?? {})) {
      if (to !== undefined && !Object.hasOwn(table, to)) {
        throw new Error(`${name}: transition ${from} --${event}--> ${to} targets an unknown state`);
      }
    }
  }

  const frozen = Object.freeze(
    Object.fromEntries(
      Object.entries<Partial<Record<E, S>> | undefined>(table).map(([from, events]) => [
        from,
        Object.freeze({ ...events }),
      ]),
    ),
  ) as TransitionTable<S, E>;

  const targetOf = (from: S, event: E): S | undefined => frozen[from]?.[event];

  return {
    name,
    transitions: frozen,
    can: (from, event) => targetOf(from, event) !== undefined,
    allowedEvents: (from) => Object.keys(frozen[from] ?? {}) as E[],
    transition(from, event) {
      const to = targetOf(from, event);
      if (to === undefined) throw new InvalidStateTransitionError<S, E>(name, from, event);
      return to;
    },
    assertTransition(from, to) {
      const ok = Object.values<S | undefined>(frozen[from] ?? {}).includes(to);
      if (!ok) throw new InvalidStateTransitionError<S, E>(name, from, undefined, to);
    },
  };
}
