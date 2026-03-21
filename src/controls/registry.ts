import type { ControlType } from '../shared/types.js';
import type { ControlEvaluator } from './types.js';

const registry = new Map<ControlType, ControlEvaluator>();

/** Register a control evaluator */
export function registerControl(evaluator: ControlEvaluator): void {
  registry.set(evaluator.type, evaluator);
}

/** Get evaluator for a control type */
export function getEvaluator(type: ControlType): ControlEvaluator | undefined {
  return registry.get(type);
}

/** Get all registered evaluators */
export function getAllEvaluators(): ControlEvaluator[] {
  return Array.from(registry.values());
}
