import { createAuthClient } from '@neondatabase/neon-js/auth';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;

if (!authUrl) {
  console.warn('VITE_NEON_AUTH_URL não configurada.');
}

export const authClient = createAuthClient(authUrl ?? 'http://localhost:9999/auth', {
  fetchOptions: { credentials: 'include' },
});

export async function getApiToken(): Promise<string | null> {
  const result = await authClient.token();
  if (result.error || !result.data?.token) return null;
  return result.data.token;
}
