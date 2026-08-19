import { getArtworkStorageCapability } from './artworkStorageService.js';
import { getDistributedRateLimitCapability } from './distributedRateLimitService.js';
import { getExternalProviderCapabilities } from './externalProviderRegistry.js';
import { resolveSeedreamModels } from './destinyArtworkService.js';

export function buildInfrastructureStatus(env = process.env) {
  const models = resolveSeedreamModels({ model: env.SEEDREAM_ENDPOINT_ID || env.SEEDREAM_MODEL, fallbackModels: env.SEEDREAM_FALLBACK_MODELS });
  return {
    generatedAt: new Date().toISOString(),
    database: { enabled: Boolean(env.DATABASE_URL), provider: 'postgresql', reason: env.DATABASE_URL ? null : 'DATABASE_URL_MISSING' },
    artworkStorage: getArtworkStorageCapability({ token: env.BLOB_READ_WRITE_TOKEN }),
    distributedRateLimit: getDistributedRateLimitCapability(env),
    seedream: {
      enabled: Boolean(env.ARK_API_KEY && models.length > 0),
      provider: 'volcengine_ark',
      modelCount: models.length,
      models,
      reason: env.ARK_API_KEY && models.length > 0 ? null : 'ARK_API_KEY_OR_MODELS_MISSING',
    },
    providers: getExternalProviderCapabilities(env),
  };
}

export default buildInfrastructureStatus;
