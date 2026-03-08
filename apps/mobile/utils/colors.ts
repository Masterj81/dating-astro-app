// Theme colors for the app
export const colors = {
  // Primary
  primary: '#e94560',
  primaryDark: '#c23a51',
  
  // Background
  background: {
    dark: '#0f0f1a',
    medium: '#1a1a2e',
    light: '#16213e',
  },
  
  // Text
  text: {
    primary: '#ffffff',
    secondary: '#cccccc',
    muted: '#888888',
    disabled: '#666666',
  },
  
  // UI elements
  border: 'rgba(255, 255, 255, 0.1)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  
  // Status colors
  success: '#4ade80',
  warning: '#f59e0b',
  error: '#ef4444',
  
  // Zodiac element colors
  fire: '#ff6b6b',    // Aries, Leo, Sagittarius
  earth: '#51cf66',   // Taurus, Virgo, Capricorn
  air: '#74c0fc',     // Gemini, Libra, Aquarius
  water: '#9775fa',   // Cancer, Scorpio, Pisces
};

// Gradient presets
export const gradients = {
  background: ['#0f0f1a', '#1a1a2e', '#16213e'] as const,
  primaryButton: ['#e94560', '#c23a51'] as const,
  card: ['transparent', 'rgba(0,0,0,0.8)'] as const,
};

export default colors;
