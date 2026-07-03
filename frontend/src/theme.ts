import { createTheme, alpha } from '@mui/material/styles';

// ── Design tokens (TirSkix Academy, июль 2026) ────────────────────────────────

// Violet accent ramp
const VIOLET_600 = '#7F23CC';  // fill-accent light / brand primary
const VIOLET_800 = '#57188B';  // fill-accent-hover / text-accent light

// Ink (warm graphite)
const INK_900 = '#1C1B22';    // text-primary light
const INK_600 = '#5F5E5A';    // text-secondary light
const INK_100 = '#E7E5DE';    // border light
const INK_50  = '#F1F0EC';    // surface-2 / fill-secondary

// Sidebar — тёмный фирменный (тёплый графит ink-900)
export const SIDEBAR_BG       = '#1C1B22';        // ink-900
export const SIDEBAR_BORDER   = '#2A2833';        // --border dark
export const SIDEBAR_ITEM_HO  = 'rgba(255,255,255,0.06)';
export const SIDEBAR_ITEM_SEL = 'rgba(171,103,229,0.20)'; // violet-400 подложка
export const SIDEBAR_ICON     = 'rgba(255,255,255,0.45)';
export const SIDEBAR_ICON_SEL = '#CFA8F0';        // violet-200 — иконка активного пункта
export const SIDEBAR_TEXT     = 'rgba(255,255,255,0.75)';
export const SIDEBAR_TEXT_SEL = '#E7D3F8';        // violet-100
export const SIDEBAR_TEXT_DIM = 'rgba(255,255,255,0.35)';

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: VIOLET_600, dark: VIOLET_800, contrastText: '#FFFFFF' },
    secondary: { main: VIOLET_800 },
    success:   { main: '#1D9E75', light: '#E1F5EE', dark: '#085041', contrastText: '#FFFFFF' },
    warning:   { main: '#BA7517', light: '#FAEEDA', dark: '#633806', contrastText: '#FFFFFF' },
    error:     { main: '#E24B4A', light: '#FCEBEB', dark: '#791F1F', contrastText: '#FFFFFF' },
    info:      { main: '#378ADD', light: '#E6F1FB', dark: '#0C447C', contrastText: '#FFFFFF' },
    background: {
      default: '#FAFAF8',   // --surface-0
      paper:   '#FFFFFF',   // --surface-1
    },
    text: {
      primary:   INK_900,
      secondary: INK_600,
      disabled:  '#8B8980',
    },
    divider: INK_100,
  },
  shape: { borderRadius: 8 },  // --radius-md
  typography: {
    fontFamily: '"Manrope", "Segoe UI", system-ui, sans-serif',
    h1: { fontWeight: 700, fontSize: '2.5rem' },
    h2: { fontWeight: 700, fontSize: '1.75rem' },
    h3: { fontWeight: 600, fontSize: '1.25rem' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    body1: {
      fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
      fontSize: '0.9375rem',  // 15px
      lineHeight: 1.6,
    },
    body2: {
      fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
      fontSize: '0.8125rem',  // 13px
    },
    caption: {
      fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
      fontSize: '0.75rem',
    },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shadows: [
    'none',                                          // 0
    '0 1px 2px rgba(28, 27, 34, 0.04)',              // 1 shadow-xs
    '0 2px 8px rgba(28, 27, 34, 0.06)',              // 2 shadow-sm
    '0 8px 24px rgba(28, 27, 34, 0.08)',             // 3 shadow-md
    '0 16px 40px rgba(28, 27, 34, 0.10)',            // 4 shadow-lg
    ...Array(20).fill('0 8px 24px rgba(28, 27, 34, 0.08)'),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        body: {
          backgroundColor: '#FAFAF8',
          backgroundImage: 'none',  // убираем градиентный оверлей — плоский стиль
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${INK_100}` },
        rounded: { borderRadius: 12 },  // --radius-lg для карточек
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${INK_100}`,
          borderRadius: 12,
          boxShadow: 'none',
          transition: 'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': { boxShadow: '0 1px 2px rgba(28, 27, 34, 0.04)' },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { '&:last-child': { paddingBottom: 16 } },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 8,
          paddingInline: 18,
          minHeight: 40,
          fontFamily: '"Manrope", "Segoe UI", system-ui, sans-serif',
          fontWeight: 600,
          fontSize: '0.875rem',
          transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:active': { transform: 'scale(0.98)' },
        },
        containedPrimary: {
          background: VIOLET_600,
          color: '#FFFFFF',
          '&:hover': { background: VIOLET_800 },
          '&.Mui-disabled': { background: INK_100, color: '#8B8980' },
        },
        outlinedPrimary: {
          borderColor: '#CFA8F0',
          color: VIOLET_800,
          '&:hover': { backgroundColor: '#F5EEFC', borderColor: '#CFA8F0' },
        },
        textPrimary: {
          color: INK_600,
          '&:hover': { backgroundColor: INK_50, color: INK_900 },
        },
        sizeSmall: { borderRadius: 6, paddingInline: 12, minHeight: 32, fontSize: '0.8125rem' },
        sizeLarge: { borderRadius: 8, paddingInline: 24, minHeight: 48 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          transition: 'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#D3D1C7',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#CFA8F0',
            borderWidth: 1,
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(127, 35, 204, 0.25)',
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E24B4A',
          },
          '&.Mui-error.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(226, 75, 74, 0.15)',
          },
        },
        notchedOutline: { borderColor: INK_100 },
        input: { paddingBlock: 9 },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontSize: '0.875rem',
          color: INK_600,
          '&.Mui-focused': { color: VIOLET_600 },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.75rem',
        },
        sizeSmall: { height: 22 },
        colorPrimary: {
          backgroundColor: '#F5EEFC',
          color: VIOLET_800,
        },
        colorSuccess: {
          backgroundColor: '#E1F5EE',
          color: '#085041',
        },
        colorWarning: {
          backgroundColor: '#FAEEDA',
          color: '#633806',
        },
        colorError: {
          backgroundColor: '#FCEBEB',
          color: '#791F1F',
        },
        colorInfo: {
          backgroundColor: '#E6F1FB',
          color: '#0C447C',
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: `1px solid ${INK_100}`,
          boxShadow: '0 16px 40px rgba(28, 27, 34, 0.10)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: '"Manrope", "Segoe UI", system-ui, sans-serif',
          fontWeight: 700,
          fontSize: '1.125rem',
          color: INK_900,
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: { backgroundColor: INK_50 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontFamily: '"Manrope", "Segoe UI", system-ui, sans-serif',
          fontWeight: 700,
          fontSize: '0.8rem',
          color: INK_600,
        },
        body: {
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontSize: '0.875rem',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': { borderBottom: 0 },
          '&:hover td': { backgroundColor: '#F5EEFC' },
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#FFFFFF', 0.92),
          backdropFilter: 'saturate(180%) blur(16px)',
          borderBottom: `1px solid ${INK_100}`,
          color: INK_900,
          boxShadow: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: SIDEBAR_BG,
          borderRight: 'none',
          backgroundImage: 'none',
          boxShadow: 'none',
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontSize: '0.875rem',
        },
        standardSuccess: { backgroundColor: '#E1F5EE', color: '#085041' },
        standardWarning: { backgroundColor: '#FAEEDA', color: '#633806' },
        standardError:   { backgroundColor: '#FCEBEB', color: '#791F1F' },
        standardInfo:    { backgroundColor: '#E6F1FB', color: '#0C447C' },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 44,
          color: INK_600,
          transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': { color: INK_900 },
          '&.Mui-selected': { color: VIOLET_800, fontWeight: 600 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: VIOLET_600, height: 2 },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: INK_900,
          color: '#FAFAF8',
          borderRadius: 6,
          fontFamily: '"Open Sans", "Segoe UI", system-ui, sans-serif',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 10px',
          maxWidth: 220,
        },
        arrow: { color: INK_900 },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, height: 6, backgroundColor: INK_50 },
        bar: { backgroundColor: VIOLET_600, borderRadius: 999 },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { borderRadius: 6, backgroundColor: INK_50 },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: INK_100 },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': { backgroundColor: INK_50 },
          '&.Mui-selected': {
            backgroundColor: '#F5EEFC',
            color: VIOLET_800,
            '&:hover': { backgroundColor: '#EDE0F8' },
          },
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          backgroundColor: VIOLET_600,
          color: '#FFFFFF',
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: VIOLET_600,
            '& + .MuiSwitch-track': { backgroundColor: VIOLET_600 },
          },
        },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: '#D3D1C7',
          '&.Mui-checked': { color: VIOLET_600 },
        },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: {
          color: '#D3D1C7',
          '&.Mui-checked': { color: VIOLET_600 },
        },
      },
    },
  },
});
