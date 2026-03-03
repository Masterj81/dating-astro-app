import { useIsFocused } from '@react-navigation/native';
import { Platform } from 'react-native';
import { ReactNode } from 'react';

interface WebTabWrapperProps {
  children: ReactNode;
}

/**
 * Wrapper component for tab screens on web.
 * Uses position: fixed to work around parent container clipping issues.
 * Only renders content when the tab is focused to prevent covering other tabs.
 */
export default function WebTabWrapper({ children }: WebTabWrapperProps) {
  const isFocused = useIsFocused();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  if (!isFocused) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 64,
      left: 0,
      right: 0,
      bottom: 60,
      overflow: 'auto',
      zIndex: 1,
    }}>
      {children}
    </div>
  );
}
