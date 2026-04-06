import { describe, it, expect } from 'vitest';
import { isValidTransition, transition, isTerminal, validNextStates } from '../../src/tasks/state-machine.ts';

describe('State Machine', () => {
  it('allows valid transitions', () => {
    expect(isValidTransition('created', 'active')).toBe(true);
    expect(isValidTransition('active', 'evaluating')).toBe(true);
    expect(isValidTransition('active', 'abandoned')).toBe(true);
    expect(isValidTransition('active', 'timeout')).toBe(true);
    expect(isValidTransition('evaluating', 'evaluated')).toBe(true);
    expect(isValidTransition('evaluating', 'pending_evidence')).toBe(true);
    expect(isValidTransition('pending_evidence', 'evaluated')).toBe(true);
    expect(isValidTransition('evaluated', 'revised')).toBe(true);
    expect(isValidTransition('timeout', 'evaluated')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(isValidTransition('created', 'evaluated')).toBe(false);
    expect(isValidTransition('abandoned', 'active')).toBe(false);
    expect(isValidTransition('evaluated', 'active')).toBe(false);
    expect(isValidTransition('revised', 'evaluated')).toBe(false);
  });

  it('transition() returns new state', () => {
    expect(transition('created', 'active')).toBe('active');
    expect(transition('active', 'evaluating')).toBe('evaluating');
  });

  it('transition() throws on invalid', () => {
    expect(() => transition('created', 'evaluated')).toThrow('Invalid state transition');
  });

  it('identifies terminal states', () => {
    expect(isTerminal('revised')).toBe(true);
    expect(isTerminal('abandoned')).toBe(true);
    expect(isTerminal('active')).toBe(false);
    expect(isTerminal('evaluating')).toBe(false);
  });

  it('lists valid next states', () => {
    expect(validNextStates('active')).toEqual(['abandoned', 'evaluating', 'timeout']);
    expect(validNextStates('revised')).toEqual([]);
  });
});
