export const colors = {
  primary: '#3f73ff',           // Vibrant blue instead of muted purple
  primaryLight: '#6c95ff',      // Lighter version for gradients/highlights
  primaryDark: '#2855d9',       // Darker version for pressed states
  secondary: '#ff5c77',         // Accent color for important actions
  background: '#f9f9fa',        // Slightly off-white background
  card: '#ffffff',              // Pure white for cards/overlays
  inputBg: '#f2f3f7',           // Light gray for input fields
  text: '#1a1c1e',              // Near black for primary text
  textSecondary: '#5b616e',     // Dark gray for secondary text
  textLight: '#ffffff',         // White text for dark backgrounds
  border: '#e2e3e7',            // Light gray for borders
  success: '#54cd85',           // Green for success states
  warning: '#ffbb54',           // Orange for warnings
  error: '#ff5a5a',             // Red for errors
  inactive: '#c5cad3',          // Gray for inactive/disabled elements
  ripple: 'rgba(0, 0, 0, 0.1)', // Touch ripple effect color
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  main: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  }
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 9999, // For circular elements
};

export const typography = {
  heading1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 'bold',
    letterSpacing: 0.25,
  },
  heading2: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 'bold',
    letterSpacing: 0.15,
  },
  heading3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  button: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
};