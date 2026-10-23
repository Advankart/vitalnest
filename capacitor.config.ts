import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.advankart.vitalnest',
  appName: 'VitalNest',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { iconColor: '#0f766e' },
    SplashScreen: { backgroundColor: '#0f766e' },
  },
};

export default config;
