import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.donaantonia.app',
  appName: 'Dona Antônia',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
  },
};

export default config;
