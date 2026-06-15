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
import { getEffectiveRole, hasPermission } from '../utils/permissions';

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

const PWA_SETTINGS_TIMEOUT_MS = 7000;

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('PWA settings request timed out')), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });

const getFallbackModules = (user: ReturnType<typeof useAuth>['user']): PwaModule[] => {
  const effectiveRole = getEffectiveRole(user);
  const candidates: PwaModule[] = [
    { key: 'dashboard', label: 'Главная', description: 'Сводка и основные показатели', route: '/dashboard' },
    { key: 'parent_dashboard', label: 'Кабинет родителя', description: 'Обучение, оплаты и сообщения', route: '/mobile/parent-dashboard', required_permission: 'parent_dashboard.access' },
    { key: 'trainer_cockpit', label: 'Кокпит тренера', description: 'Занятия и рабочий день тренера', route: '/mobile/trainer-cockpit', required_permission: 'trainer_cockpit.access' },
    { key: 'tasks', label: 'Задачи', description: 'Рабочие задачи и напоминания', route: '/mobile/tasks', required_permission: 'tasks.access' },
    { key: 'students', label: 'Ученики', description: 'Карточки и история учеников', route: '/mobile/students', required_permission: 'students.access' },
    { key: 'lessons', label: 'Уроки', description: 'Расписание и занятия', route: '/mobile/lessons', required_permission: 'lessons.access' },
    { key: 'programs', label: 'Программы', description: 'Учебные программы', route: '/mobile/programs', required_permission: 'programs.access' },
    { key: 'grades', label: 'Оценки', description: 'Оценки и прогресс', route: '/trainer-grades', required_permission: 'grades.access' },
    { key: 'leads', label: 'Лиды', description: 'Продажи и воронка', route: '/mobile/leads', required_permission: 'sales.access' },
    { key: 'payments', label: 'Оплаты', description: 'Платежи и задолженности', route: '/finance/payments', required_permission: 'sales.access' },
    { key: 'finance_journal', label: 'Журнал', description: 'Финансовый журнал и операции', route: '/finance/overview', required_permission: 'finance.access' },
    { key: 'owner_workspace', label: 'Рабочее пространство', description: 'Проекты, контакты и задачи', route: '/mobile/contacts', required_permission: 'owner_workspace.access' },
  ];

  return candidates.filter((module) => {
    if (module.key === 'dashboard') {
      return ['admin', 'owner', 'trainer', 'parent'].includes(effectiveRole || '');
    }
    return !module.required_permission || hasPermission(user, module.required_permission);
  });
};

const MobileHomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [modules, setModules] = React.useState<PwaModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    try {
      sessionStorage.setItem('pwa_mode', '1');
    } catch {
      // ignore storage errors
    }
    let mounted = true;
    withTimeout(settingsApi.getMyPwaSettings(), PWA_SETTINGS_TIMEOUT_MS)
      .then((data) => {
        if (!mounted) return;
        const enabled = new Set(data.enabled_modules);
        const apiModules = data.modules.filter((module) => enabled.has(module.key));
        setModules(apiModules.length ? apiModules : getFallbackModules(user));
      })
      .catch((err) => {
        if (mounted) setModules(getFallbackModules(user));
        if (mounted) setError(extractApiError(err, 'Не удалось загрузить PWA-модули'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(20px + env(safe-area-inset-bottom))' }}>
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

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
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
                    p: { xs: 1.25, sm: 1.5 },
                    borderRadius: 2,
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                    minHeight: 76,
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
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => navigate(module.route)}
                    sx={{ flexShrink: 0 }}
                  >
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
