import { createTheme, alpha } from '@mui/material/styles';

// ── Design tokens ────────────────────────────────────────────────────────────
export const SIDEBAR_BG         = '#0F172A';   // slate-900
export const SIDEBAR_ITEM_HO    = 'rgba(255,255,255,0.06)';
export const SIDEBAR_ITEM_SEL   = 'rgba(99,102,241,0.22)';
export const SIDEBAR_ICON       = 'rgba(255,255,255,0.45)';
export const SIDEBAR_ICON_SEL   = '#A5B4FC';   // indigo-300
export const SIDEBAR_TEXT       = 'rgba(255,255,255,0.80)';
export const SIDEBAR_TEXT_SEL   = '#E0E7FF';   // indigo-100
export const SIDEBAR_TEXT_DIM   = 'rgba(255,255,255,0.35)';

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary:    { main: '#4F46E5' },   // indigo-600
    secondary:  { main: '#7C3AED' },   // violet-600
    success:    { main: '#16A34A' },
    warning:    { main: '#F59E0B' },
    error:      { main: '#DC2626' },
    background: {
      default: '#F5F5F7',              // apple neutral
      paper:   '#FFFFFF',
    },
    text: {
      primary:   '#0F172A',            // slate-900
      secondary: '#64748B',            // slate-500
    },
    divider: alpha('#0F172A', 0.07),
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      "Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, 'Apple Color Emoji', sans-serif",
    h4: { fontWeight: 800, letterSpacing: 0 },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    subtitle1: { fontWeight: 600, letterSpacing: 0 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  shadows: [
    'none',
    '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
    '0 4px 12px rgba(15,23,42,0.08)',
    '0 8px 24px rgba(15,23,42,0.10)',
    ...Array(21).fill('0 8px 24px rgba(15,23,42,0.10)'),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        body: {
          backgroundColor: '#F5F5F7',
          backgroundImage: [
            'radial-gradient(ellipse 60% 40% at 10% -5%, rgba(79,70,229,0.08) 0%, transparent 55%)',
            'radial-gradient(ellipse 50% 35% at 90% 5%,  rgba(124,58,237,0.07) 0%, transparent 50%)',
          ].join(', '),
          backgroundAttachment: 'fixed',
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: `1px solid ${alpha('#0F172A', 0.07)}` },
        rounded: { borderRadius: 12 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${alpha('#0F172A', 0.07)}`,
          borderRadius: 12,
          transition: 'box-shadow 0.15s ease',
          '&:hover': { boxShadow: '0 4px 16px rgba(15,23,42,0.09)' },
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
        root: { borderRadius: 8, paddingInline: 14, minHeight: 36 },
        containedPrimary: {
          background: 'linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)',
          '&:hover': { background: 'linear-gradient(180deg, #818CF8 0%, #6366F1 100%)' },
        },
        outlinedPrimary: {
          borderColor: alpha('#4F46E5', 0.35),
          '&:hover': { borderColor: '#4F46E5', backgroundColor: alpha('#4F46E5', 0.04) },
        },
        sizeSmall: { borderRadius: 6, paddingInline: 10, minHeight: 30 },
        sizeLarge: { borderRadius: 10, paddingInline: 20, minHeight: 44 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          transition: 'box-shadow 0.15s ease',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#4F46E5', 0.4),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4F46E5',
            borderWidth: 1,
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha('#4F46E5', 0.14)}`,
          },
        },
        notchedOutline: { borderColor: alpha('#0F172A', 0.12) },
        input: { paddingBlock: 9 },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600, fontSize: '0.75rem' },
        sizeSmall: { height: 22 },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, border: `1px solid ${alpha('#0F172A', 0.07)}` },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: '1.05rem' },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: { backgroundColor: alpha('#0F172A', 0.025) },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, fontSize: '0.8rem', color: '#475569' },
        body: { fontSize: '0.875rem' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': { borderBottom: 0 },
          '&:hover td': { backgroundColor: alpha('#4F46E5', 0.025) },
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#FFFFFF', 0.88),
          backdropFilter: 'saturate(180%) blur(16px)',
          borderBottom: `1px solid ${alpha('#0F172A', 0.06)}`,
          color: '#0F172A',
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
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: '0.875rem' },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 44 },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1E293B',
          borderRadius: 6,
          fontSize: '0.75rem',
        },
        arrow: { color: '#1E293B' },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, height: 6 },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
  },
});
