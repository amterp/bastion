import { registerControl } from './registry.js';
import { timeLimitEvaluator } from './time-limit/evaluator.js';

/** Register all built-in control evaluators */
export function initControls(): void {
  registerControl(timeLimitEvaluator);
  // Additional evaluators will be registered as they're implemented
}
