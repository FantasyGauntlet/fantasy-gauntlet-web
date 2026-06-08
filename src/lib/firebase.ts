import { initializeApp, getApps } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyA4_7e0VV_hb8Y3Y2DmliWibwc9rubR73k',
  authDomain: 'fantasy-gauntlet-ea8a8.firebaseapp.com',
  projectId: 'fantasy-gauntlet-ea8a8',
  storageBucket: 'fantasy-gauntlet-ea8a8.firebasestorage.app',
  messagingSenderId: '628619742883',
  appId: '1:628619742883:web:ae7b290233739534fd3916',
};

// Only initialize in the browser — prevents SSR errors during Next.js builds
const app = typeof window !== 'undefined'
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth);
