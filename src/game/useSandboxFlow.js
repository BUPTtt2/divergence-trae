import useDeliberationFlow from './useDeliberationFlow';

export const SANDBOX_RUNTIME = 'agent';

export default function useSandboxFlow(options = {}) {
  return useDeliberationFlow(options.initialQuestion || '');
}
