import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  enableAutoSessionTracking: true,
  enabled: !__DEV__,
});

export { Sentry };
