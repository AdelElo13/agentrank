/**
 * Domain taxonomy — hierarchical, extensible.
 * Each domain has signal words that indicate the domain.
 */

export interface DomainDef {
  readonly signals: readonly string[];
}

export const DOMAIN_TAXONOMY: Record<string, Record<string, DomainDef>> = {
  frontend: {
    'frontend.react': { signals: ['tsx', 'jsx', 'component', 'hook', 'context', 'useState', 'useEffect'] },
    'frontend.nextjs': { signals: ['next.config', 'app/', 'pages/', 'middleware', 'getServerSide', 'server component'] },
    'frontend.vue': { signals: ['vue', 'nuxt', 'composable', 'ref('] },
    'frontend.css': { signals: ['tailwind', 'css', 'scss', 'styled', 'className'] },
    'frontend.typescript': { signals: ['.ts', 'type ', 'interface ', 'generic', 'as const'] },
  },
  backend: {
    'backend.node': { signals: ['express', 'fastify', 'koa', 'server.ts', 'hono'] },
    'backend.python': { signals: ['.py', 'django', 'flask', 'fastapi', 'def ', 'import '] },
    'backend.api': { signals: ['route', 'endpoint', 'controller', 'handler', 'REST', 'GraphQL'] },
    'backend.database': { signals: ['sql', 'migration', 'schema', 'query', 'supabase', 'prisma', 'drizzle'] },
  },
  infra: {
    'infra.devops': { signals: ['docker', 'ci', 'cd', 'pipeline', 'deploy', 'github-actions'] },
    'infra.cloud': { signals: ['aws', 'gcp', 'azure', 'vercel', 'terraform'] },
  },
  security: {
    'security.auth': { signals: ['auth', 'oauth', 'jwt', 'session', 'login', 'signup', 'password'] },
    'security.appsec': { signals: ['xss', 'csrf', 'injection', 'sanitize', 'vulnerability'] },
  },
  testing: {
    'testing.unit': { signals: ['test', 'spec', 'mock', 'stub', 'vitest', 'jest', 'pytest'] },
    'testing.e2e': { signals: ['playwright', 'cypress', 'selenium', 'e2e'] },
  },
  data: {
    'data.ml': { signals: ['model', 'train', 'predict', 'tensor', 'pytorch', 'sklearn'] },
    'data.analytics': { signals: ['chart', 'graph', 'dashboard', 'metric', 'pandas'] },
  },
};

/**
 * Get all domain keys as a flat list.
 */
export function getAllDomains(): string[] {
  const domains: string[] = [];
  for (const category of Object.values(DOMAIN_TAXONOMY)) {
    for (const domain of Object.keys(category)) {
      domains.push(domain);
    }
  }
  return domains;
}

/**
 * Get the parent category of a domain.
 */
export function getDomainCategory(domain: string): string | null {
  for (const [category, domains] of Object.entries(DOMAIN_TAXONOMY)) {
    if (domain in domains) return category;
  }
  return null;
}
