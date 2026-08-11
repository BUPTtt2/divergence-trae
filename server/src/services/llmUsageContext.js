import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function withLLMUsageContext(context, operation) {
  return storage.run({ ...(storage.getStore() || {}), ...(context || {}) }, operation);
}

export function getLLMUsageContext() {
  return storage.getStore() || {};
}

export default { withLLMUsageContext, getLLMUsageContext };

