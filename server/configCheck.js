const WEAK_PASSWORDS = new Set(['change-me-now', 'dragonbane-local-password', 'admin', 'password']);

export function configProblems(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const problems = [];
  const token = env.DEVELOPMENT_TOKEN || '';
  if ((env.AUTH_MODE || 'development_token') === 'development_token' && token) {
    if (token.length < 32 || token.startsWith('replace-with')) {
      problems.push('DEVELOPMENT_TOKEN is enabled but shorter than 32 characters or still a placeholder. Use a long random value or leave it empty.');
    }
  }
  try {
    const dbPassword = decodeURIComponent(new URL(env.DATABASE_URL || '').password);
    if (WEAK_PASSWORDS.has(dbPassword) || dbPassword.startsWith('replace-with')) {
      problems.push('The database password in DATABASE_URL is a documented default. Set POSTGRES_PASSWORD to a long random value.');
    }
  } catch {
    // A missing or unparsable DATABASE_URL is reported by the database layer.
  }
  return problems;
}

export function assertSafeConfig(env = process.env) {
  const problems = configProblems(env);
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
  }
}

export function assertSafeBootstrapPassword(password, env = process.env) {
  if (env.NODE_ENV === 'production' && (WEAK_PASSWORDS.has(password) || password.startsWith('replace-with'))) {
    throw new Error('ADMIN_PASSWORD is a documented default. Set a unique password before the first production start.');
  }
}
