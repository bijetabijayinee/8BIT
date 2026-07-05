import type { StaffUser } from '../types/careflow';

const SESSION_KEY = 'careflow-session';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface AuthSession {
  token: string;
  expiresAt: string;
  staff: StaffUser;
}

export function getSession(): AuthSession | null {
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return null;
  }
  try {
    const session = JSON.parse(stored) as AuthSession;
    if (!session.token || !session.staff || new Date(session.expiresAt) <= new Date()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export async function login(staffCode: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffCode, password }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = 'Invalid staff code or password.';
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message?.trim()) {
        message = parsed.message.trim();
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  const session = (await response.json()) as AuthSession;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY);
}

/** Clears the session and returns to the login screen (used on 401 responses). */
export function handleSessionExpired() {
  logout();
  window.location.hash = '#/home';
  window.location.reload();
}
