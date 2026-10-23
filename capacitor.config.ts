import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.advankart.vitalnest',
  appName: 'VitalNest',
  webDir: 'dist',
  // The app shell loads the live website, so every web update reaches phones automatically
  // (no reinstall). offline.html (bundled) is shown only if the site can't be reached on first launch.
  server: { url: 'https://vitalnest.vercel.app', errorPath: 'offline.html' },
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { iconColor: '#0f766e' },
    SplashScreen: { backgroundColor: '#0f766e' },
  },
};

export default config;
