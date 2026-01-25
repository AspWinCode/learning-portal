import { createTheme, alpha } from '@mui/material/styles';

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2563EB' }, // blue-600
    secondary: { main: '#7C3AED' }, // violet-600
    success: { main: '#16A34A' }, // green-600
    warning: { main: '#F59E0B' }, // amber-500
    error: { main: '#DC2626' }, // red-600
    background: {
      default: '#F6F7FB',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A', // slate-900
      secondary: '#475569', // slate-600
    },
    divider: alpha('#0F172A', 0.08),
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily:
      "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
    h4: { fontWeight: 750, letterSpacing: -0.4 },
    h5: { fontWeight: 750, letterSpacing: -0.3 },
    h6: { fontWeight: 700, letterSpacing: -0.2 },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  shadows: [
    'none',
    '0px 2px 10px rgba(15, 23, 42, 0.06)',
    '0px 6px 22px rgba(15, 23, 42, 0.08)',
    '0px 10px 30px rgba(15, 23, 42, 0.10)',
    ...Array(21).fill('0px 10px 30px rgba(15, 23, 42, 0.10)'),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F6F7FB',
          backgroundImage:
            'radial-gradient(800px circle at 20% 0%, rgba(37, 99, 235, 0.10), transparent 45%), radial-gradient(900px circle at 80% 10%, rgba(124, 58, 237, 0.10), transparent 50%)',
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${alpha('#0F172A', 0.08)}`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${alpha('#0F172A', 0.08)}`,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 14,
        },
        containedPrimary: {
          backgroundImage:
            'linear-gradient(180deg, rgba(37, 99, 235, 1) 0%, rgba(29, 78, 216, 1) 100%)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#2563EB', 0.35),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2563EB',
            borderWidth: 1,
            boxShadow: `0 0 0 4px ${alpha('#2563EB', 0.12)}`,
          },
        },
        notchedOutline: {
          borderColor: alpha('#0F172A', 0.14),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 650,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#0F172A', 0.03),
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          color: alpha('#0F172A', 0.8),
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover td': {
            backgroundColor: alpha('#0F172A', 0.02),
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#FFFFFF', 0.9),
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`,
          color: '#0F172A',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${alpha('#0F172A', 0.08)}`,
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.75) 100%)',
          backdropFilter: 'blur(10px)',
        },
      },
    },
  },
});


