importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA4_7e0VV_hb8Y3Y2DmliWibwc9rubR73k',
  authDomain: 'fantasy-gauntlet-ea8a8.firebaseapp.com',
  projectId: 'fantasy-gauntlet-ea8a8',
  storageBucket: 'fantasy-gauntlet-ea8a8.firebasestorage.app',
  messagingSenderId: '628619742883',
  appId: '1:628619742883:web:ae7b290233739534fd3916',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title ?? 'Fantasy Gauntlet';
  const body  = payload.notification?.body  ?? '';
  self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.data?.type ?? 'general',
    data: payload.data ?? {},
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const leagueId = e.notification.data?.leagueId;
  const url = leagueId ? `/leagues/${leagueId}` : '/dashboard';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) {
        if ('focus' in w) { w.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
