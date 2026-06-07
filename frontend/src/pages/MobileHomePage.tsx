import React from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  Assignment,
  BarChart,
  Book,
  Dashboard,
  EventAvailable,
  Grade,
  Logout,
  Paid,
  People,
  Person,
  School,
  WorkOutline,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../services/api';
import { PwaModule } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../utils/extractApiError';

const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <Dashboard />,
  parent_dashboard: <Person />,
  trainer_cockpit: <School />,
  contacts: <People />,
  tasks: <Assignment />,
  owner_workspace: <AccountTree />,
  students: <People />,
  lessons: <EventAvailable />,
  grades: <Grade />,
  leads: <WorkOutline />,
  sales_events: <EventAvailable />,
  payments: <Paid />,
  programs: <Book />,
  reports: <BarChart />,
};

const MobileHomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [modules, setModules] = React.useState<PwaModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    settingsApi
      .getMyPwaSettings()
      .then((data) => {
        if (!mounted) return;
        const enabled = new Set(data.enabled_modules);
        setModules(data.modules.filter((module) => enabled.has(module.key)));
      })
      .catch((err) => {
        if (mounted) setError(extractApiError(err, 'Не удалось загрузить PWA-модули'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 3 }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
        <Toolbar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              Learning Portal
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {user?.full_name || 'PWA'}
            </Typography>
          </Box>
          <IconButton onClick={handleLogout} aria-label="Выйти">
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={900}>
              PWA
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Доступные разделы зависят от PWA-настроек роли и ваших системных прав.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : modules.length ? (
            <Stack spacing={1.25}>
              {modules.map((module) => (
                <Paper
                  key={module.key}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                  }}
                >
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'primary.main',
                      bgcolor: 'primary.50',
                    }}
                  >
                    {moduleIcons[module.key] || <Dashboard />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={800} noWrap>
                      {module.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {module.description}
                    </Typography>
                  </Box>
                  <Button variant="contained" size="small" onClick={() => navigate(`${module.route}?pwa=1`)}>
                    Открыть
                  </Button>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Alert severity="info">
              Для вашей роли пока не включен ни один PWA-раздел. Настройте доступ в desktop: Настройки / PWA.
            </Alert>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default MobileHomePage;
