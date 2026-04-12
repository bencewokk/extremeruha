export const ADMIN_TOKEN_KEY = 'admin_token'
export const ADMIN_AUTH_EVENT = 'admin-auth-changed'

export function getAdminToken(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT))
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ADMIN_TOKEN_KEY)
  window.dispatchEvent(new Event(ADMIN_AUTH_EVENT))
}
