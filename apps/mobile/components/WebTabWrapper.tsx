import { useIsFocused } from '@react-navigation/native';
import { Platform } from 'react-native';
import { ReactNode } from 'react';
import { WEB_TAB_BAR_HEIGHT } from '../constants/webLayout';

interface WebTabWrapperProps {
  children: ReactNode;
  background?: string;
  padding?: number | string;
  paddingTop?: number | string;
  overflowY?: 'auto' | 'hidden' | 'scroll';
  centered?: boolean;
  bottom?: number;
  style?: React.CSSProperties;
}

/**
 * Wrapper component for tab screens on web.
 * Uses position: fixed to work around parent container clipping issues.
 * Only renders content when the tab is focused to prevent covering other tabs.
 */
export default function WebTabWrapper({
  children,
  background = '#0f0f1a',
  padding,
  paddingTop,
  overflowY = 'auto',
  centered = false,
  bottom = WEB_TAB_BAR_HEIGHT,
  style,
}: WebTabWrapperProps) {
  const isFocused = useIsFocused();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  if (!isFocused) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom,
        background,
        overflowY,
        zIndex: 1,
        ...(padding !== undefined && { padding }),
        ...(paddingTop !== undefined && { paddingTop }),
        ...(centered && {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
