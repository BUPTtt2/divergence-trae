-- 记录 LLM 自动前缀缓存的命中/未命中 token（DeepSeek: prompt_cache_hit_tokens，
-- 火山方舟/豆包: prompt_tokens_details.cached_tokens），用于观察缓存省钱效果
ALTER TABLE llm_usage_events
  ADD COLUMN IF NOT EXISTS cache_hit_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_miss_tokens INTEGER NOT NULL DEFAULT 0;
