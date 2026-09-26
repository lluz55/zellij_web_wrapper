import { parseStepToSequence } from './key-encoder';

export async function executeMacro(
  steps: string[],
  sendFn: (data: string) => void,
  specialSequences: Record<string, string> = {},
  stepDelayMs: number = 80
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const seq = parseStepToSequence(step, specialSequences);
    sendFn(seq);
    if (i < steps.length - 1 && stepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
    }
  }
}
