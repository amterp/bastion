import { registerControl } from './registry.js';
import { timeLimitEvaluator } from './time-limit/evaluator.js';
import { navFrequencyEvaluator } from './nav-frequency/evaluator.js';
import { speedBumpEvaluator } from './speed-bump/evaluator.js';
import { degradationEvaluator } from './degradation/evaluator.js';

/** Register all built-in control evaluators */
export function initControls(): void {
  registerControl(timeLimitEvaluator);
  registerControl(navFrequencyEvaluator);
  registerControl(speedBumpEvaluator);
  registerControl(degradationEvaluator);
}
