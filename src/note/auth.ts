const COOKIE_ENV_KEYS = ['NOTE_COOKIE', 'NOTE_SESSION_COOKIE'] as const;

export function readCookieFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of COOKIE_ENV_KEYS) {
    const value = env[key];
    if (value?.trim()) return value.trim();
  }

  throw new Error(
    `Missing note.com cookie. Set ${COOKIE_ENV_KEYS.join(' or ')} before starting note-mcp.`,
  );
}

export function hasCookie(env: NodeJS.ProcessEnv = process.env): boolean {
  return COOKIE_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
}
