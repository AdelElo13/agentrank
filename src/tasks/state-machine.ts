import type { TaskState } from '../types.ts';

/**
 * Valid state transitions for the task lifecycle.
 * No other transitions are allowed.
 */
const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  created: ['active'],
  active: ['abandoned', 'evaluating', 'timeout'],
  evaluating: ['evaluated', 'pending_evidence'],
  pending_evidence: ['evaluated', 'revised'],
  evaluated: ['revised'],
  revised: [], // terminal
  abandoned: [], // terminal
  timeout: ['evaluated'], // auto-evaluation attempted
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Attempt a state transition. Returns the new state or throws.
 */
export function transition(current: TaskState, target: TaskState): TaskState {
  if (!isValidTransition(current, target)) {
    throw new Error(
      `Invalid state transition: ${current} → ${target}. ` +
      `Valid transitions from ${current}: [${VALID_TRANSITIONS[current].join(', ')}]`,
    );
  }
  return target;
}

/**
 * Check if a state is terminal (no further transitions).
 */
export function isTerminal(state: TaskState): boolean {
  return VALID_TRANSITIONS[state]?.length === 0;
}

/**
 * Get valid next states from current state.
 */
export function validNextStates(state: TaskState): readonly TaskState[] {
  return VALID_TRANSITIONS[state] ?? [];
}
