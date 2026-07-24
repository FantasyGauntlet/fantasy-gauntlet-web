'use client';

import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from './firebase';
import { api } from './api';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
let registeredToken: string | null = null;

export async function initPush(): Promise<void> {
  if (typeof window === 'undefined' || !messaging || !VAPID_KEY) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token || token === registeredToken) return;

    await api.post('/users/me/device-tokens', { token });
    registeredToken = token;
  } catch (err) {
    console.warn('[push] init failed:', err);
  }
}

export async function cleanupPush(): Promise<void> {
  if (!registeredToken) return;
  try {
    await api.delete(`/users/me/device-tokens/${registeredToken}`);
  } catch {}
  registeredToken = null;
}

export type ForegroundPayload = { title: string; body: string; data: Record<string, string> };

export function listenForeground(cb: (p: ForegroundPayload) => void): () => void {
  if (!messaging) return () => {};
  return onMessage(messaging, payload => {
    cb({
      title: payload.notification?.title ?? 'Fantasy Gauntlet',
      body:  payload.notification?.body  ?? '',
      data:  (payload.data ?? {}) as Record<string, string>,
    });
  });
}
