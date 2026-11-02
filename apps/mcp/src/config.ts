export class ConfigError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface Config {
  /** Supabase loyiha origin, oxirida "/" yo'q */
  supabaseUrl: string;
  /** Publishable (anon) kalit */
  publishableKey: string;
  /** OAuth issuer = JWT `iss` */
  issuer: string;
  jwksUrl: URL;
  /** MCP serverning ommaviy origin'i */
  publicUrl: string;
  /** `client_id` claim'i yo'q tokenga ruxsat (faqat lokal dev) */
  allowFirstPartyToken: boolean;
  /** Bo'sh emas bo'lsa — faqat shu client_id'lar */
  allowedClientIds: string[];
  isProduction: boolean;
}

type Env = Record<string, string | undefined>;

function isLocalHost(u: URL): boolean {
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
}

function parseOrigin(name: string, raw: string | undefined, problems: string[]): string {
  const v = (raw ?? '').trim();
  if (!v) {
    problems.push(`${name} berilmagan`);
    return '';
  }
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocalHost(u))) {
      problems.push(`${name} https bo'lishi kerak`);
    }
    return u.origin;
  } catch {
    problems.push(`${name} noto'g'ri URL`);
    return '';
  }
}

/** service_role / secret kalit serverga kiritilsa — ishga tushmaydi. */
export function looksLikeServiceKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as { role?: unknown };
      return payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export function loadConfig(env: Env): Config {
  const problems: string[] = [];
  const supabaseUrl = parseOrigin('SUPABASE_URL', env.SUPABASE_URL, problems);
  const publicUrl = parseOrigin('MCP_PUBLIC_URL', env.MCP_PUBLIC_URL, problems);
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (publishableKey.length < 20) problems.push('SUPABASE_PUBLISHABLE_KEY berilmagan');
  else if (looksLikeServiceKey(publishableKey)) {
    problems.push('SUPABASE_PUBLISHABLE_KEY service_role/secret kalitga o\'xshaydi: faqat publishable (anon) kalit ruxsat etiladi');
  }

  const isProduction = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';
  const allowFirstPartyToken = (env.MCP_ALLOW_FIRST_PARTY_TOKEN ?? '').trim().toLowerCase() === 'true';
  if (allowFirstPartyToken && isProduction) {
    problems.push('MCP_ALLOW_FIRST_PARTY_TOKEN productionda ishlatilmaydi (faqat lokal dev)');
  }
  const allowedClientIds = (env.MCP_ALLOWED_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (problems.length > 0) throw new ConfigError('MCP server sozlamalari noto\'g\'ri', problems);

  const issuer = `${supabaseUrl}/auth/v1`;
  return {
    supabaseUrl,
    publishableKey,
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    publicUrl,
    allowFirstPartyToken,
    allowedClientIds,
    isProduction,
  };
}
