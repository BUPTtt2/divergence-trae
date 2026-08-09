import useGameFlow from './useGameFlow';
import useDeliberationFlow from './useDeliberationFlow';
import { resolveSandboxRuntime } from './sandboxRuntime';

export const SANDBOX_RUNTIME = resolveSandboxRuntime(import.meta.env?.VITE_SANDBOX_RUNTIME);

function useAgentRuntimeFlow(options = {}) {
  return useDeliberationFlow(options.initialQuestion || '');
}

const useSelectedRuntimeFlow = SANDBOX_RUNTIME === 'legacy'
  ? useGameFlow
  : useAgentRuntimeFlow;

export default function useSandboxFlow(options = {}) {
  return useSelectedRuntimeFlow(options);
}
