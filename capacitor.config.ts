import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fantasygauntlet.app',
  appName: 'Fantasy Gauntlet',
  webDir: 'public',
  server: {
    url: 'https://www.fantasygauntlet.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    captureInput: true,
  },
};

export default config;
