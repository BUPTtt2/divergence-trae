const MAX_LEDGER_ENTRIES = 500;
const PRICE_CNY_PER_MILLION = Object.freeze({
  'glm-4-flash-250414': { input: 0, output: 0 },
  'deepseek-v4-flash': { input: 1, output: 2 },
  'doubao-1.5-pro-32k': { input: 0.8, output: 2 },
  'doubao-1.5-pro-32k-250115': { input: 0.8, output: 2 },
  'doubao-1-5-pro-32k-250115': { input: 0.8, output: 2 },
  'doubao-seed-2-1-pro': { input: 6, output: 30 },
  'doubao-seed-2-1-turbo': { input: 3, output: 15 },
});

function configuredDoubaoPrice() {
  const inputValue = process.env.DOUBAO_INPUT_CNY_PER_MILLION;
  const outputValue = process.env.DOUBAO_OUTPUT_CNY_PER_MILLION;
  if (inputValue == null || inputValue === '' || outputValue == null || outputValue === '') return null;
  const input = Number(inputValue);
  const output = Number(outputValue);
  return Number.isFinite(input) && Number.isFinite(output) ? { input, output } : null;
}

function modelPrice(model, provider) {
  if (PRICE_CNY_PER_MILLION[model]) return PRICE_CNY_PER_MILLION[model];
  if (String(model).includes('deepseek-v4-flash')) return PRICE_CNY_PER_MILLION['deepseek-v4-flash'];
  if (String(model).includes('doubao-seed-2-1-pro')) return PRICE_CNY_PER_MILLION['doubao-seed-2-1-pro'];
  if (String(model).includes('doubao-seed-2-1-turbo')) return PRICE_CNY_PER_MILLION['doubao-seed-2-1-turbo'];
  return provider === 'doubao' || String(provider).startsWith('ark-') ? configuredDoubaoPrice() : null;
}

function estimatedCostCny(model, usage = {}, provider = '') {
  const price = modelPrice(model, provider);
  if (!price) return null;
  const input = Number(usage.prompt_tokens) || 0;
  const output = Number(usage.completion_tokens) || 0;
  return Number(((input * price.input + output * price.output) / 1_000_000).toFixed(8));
}

function publicFailure(error = {}) {
  return {
    status: Number(error.status) || 0,
    retryAfterMs: Number(error.retryAfterMs) || 0,
    code: error.code || 'provider_error',
  };
}

export function createProviderRuntime({ failureThreshold = 2, cooldownMs = 30000, clock = Date.now } = {}) {
  const providers = new Map();
  const ledger = [];
  let sink = null;

  const stateFor = (provider) => {
    if (!providers.has(provider)) providers.set(provider, { rateLimitFailures: 0, openUntil: 0 });
    return providers.get(provider);
  };

  const append = (entry) => {
    const persistedEntry = { timestamp: new Date(clock()).toISOString(), ...entry };
    ledger.push(persistedEntry);
    if (ledger.length > MAX_LEDGER_ENTRIES) ledger.splice(0, ledger.length - MAX_LEDGER_ENTRIES);
    if (sink) Promise.resolve(sink({ ...persistedEntry })).catch(() => {});
  };

  return {
    canAttempt(provider) {
      return stateFor(provider).openUntil <= clock();
    },
    recordFailure(provider, error = {}, context = {}) {
      const state = stateFor(provider);
      const failure = publicFailure(error);
      if (failure.status === 429) {
        state.rateLimitFailures += 1;
        if (state.rateLimitFailures >= failureThreshold) {
          state.openUntil = clock() + Math.max(cooldownMs, failure.retryAfterMs);
        }
      }
      append({ provider, status: 'failed', ...context, error: failure });
    },
    recordSuccess(provider, context = {}) {
      const state = stateFor(provider);
      state.rateLimitFailures = 0;
      state.openUntil = 0;
      append({
        provider,
        status: 'success',
        ...context,
        estimatedCostCny: estimatedCostCny(context.model, context.usage, provider),
      });
    },
    entries() {
      return ledger.map((entry) => ({ ...entry }));
    },
    setSink(nextSink) {
      sink = typeof nextSink === 'function' ? nextSink : null;
    },
    reset() {
      providers.clear();
      ledger.length = 0;
    },
  };
}

export const providerRuntime = createProviderRuntime();
