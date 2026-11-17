// Server configuration only: never infer authorization from user-editable metadata.
export function getLoginConfig() {
  const ownerId = process.env.AUTH_OWNER_ID?.trim();
  return {
    ownerId,
    googleEnabled: process.env.AUTH_GOOGLE_ENABLED === 'true' && !!ownerId,
  };
}

export function isAllowedOwner(id: string) {
  const { ownerId } = getLoginConfig();
  return !ownerId || id === ownerId;
}

export function authOrigin(requestUrl: string) {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
    || (process.env.NODE_ENV === 'development' ? new URL(requestUrl).origin : 'https://my-film-manager.vercel.app');
}
