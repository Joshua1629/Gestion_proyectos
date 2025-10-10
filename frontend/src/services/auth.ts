import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/auth';

export async function login(identifier: string, password: string) {
  return appFetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
}

export function saveAuth(token: string, user: any) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}

export function getToken() {
  return localStorage.getItem('token');
}