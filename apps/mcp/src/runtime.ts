import { createRemoteJWKSet } from 'jose';
import { loadConfig, type Config } from './config.js';
import { createSupabaseDb, createUserClient } from './db.js';
import { createFetchHandler } from './handler.js';

export function buildHandler(env: Record<string, string | undefined>, config: Config = loadConfig(env)) {
  const key = createRemoteJWKSet(config.jwksUrl, { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
  return createFetchHandler({
    config,
    key,
    createDb: (token) => createSupabaseDb(createUserClient(config, token)),
  });
}
