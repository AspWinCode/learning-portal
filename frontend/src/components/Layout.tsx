import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  TextField,
  Badge,
  InputBase,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  People,
  Group,
  Book,
  Grade,
  Description,
  Assessment,
  AccountBalanceWallet,
  LocalOffer,
  Home,
  ExitToApp,
  Telegram as TelegramIcon,
  WorkOutline,
  EventAvailable,
  ReceiptLong,
  Settings,
  PendingActions,
  Assignment,
  Add,
  NotificationsNone,
  Notifications,
  Search,
  School,
  Bolt,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { salesApi, settingsApi, telegramApi } from '../services/api';
import { getEffectiveRole, hasPermission } from '../utils/permissions';

const drawerWidth = 240;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [tgOpen, setTgOpen] = useState(false);
  const [tgError, setTgError] = useState('');
  const [tgCode, setTgCode] = useState('');
  const [tgExpiresAt, setTgExpiresAt] = useState('');
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoOpen, setLogoOpen] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [logoSaving, setLogoSaving] = useState(false);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesAlertsCount, setSalesAlertsCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  React.useEffect(() => {
    (async () => {
      try {
        const data = await settingsApi.getLogo();
        setLogoUrl(data.data_url || null);
      } catch {
        // ignore
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!hasPermission(user, 'sales.access')) return;
    (async () => {
      try {
        const d = await salesApi.getSalesDashboard();
        setSalesAlertsCount((d.kpi_need_push_overdue || 0) + (d.kpi_need_push_urgent || 0));
      } catch {
        // ignore topbar alerts errors
      }
    })();
  }, [user]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleTelegramLink = async () => {
    handleMenuClose();
    setTgError('');
    setTgCode('');
    setTgExpiresAt('');
    setTgLink(null);
    setTgOpen(true);
    try {
      const data = await telegramApi.getLinkCode();
      setTgCode(data.code);
      setTgExpiresAt(data.expires_at);
      setTgLink(data.deep_link_url || null);
    } catch (err: any) {
      setTgError(err.response?.data?.detail || 'Не удалось получить ссылку для привязки Telegram');
    }
  };

  const handleLogoOpen = () => {
    handleMenuClose();
    setLogoError('');
    setLogoPreview(logoUrl || '');
    setLogoOpen(true);
  };

  const handleLogoFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Нужен файл изображения (png/jpg/webp)');
      return;
    }
    // ограничим размер ~200KB, чтобы base64 не был слишком большим
    if (file.size > 180 * 1024) {
      setLogoError('Файл слишком большой. Пожалуйста, загрузите логотип до 180KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setLogoPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoSave = async () => {
    setLogoError('');
    if (!logoPreview || !logoPreview.startsWith('data:image/')) {
      setLogoError('Пожалуйста, выберите изображение логотипа');
      return;
    }
    setLogoSaving(true);
    try {
      const res = await settingsApi.setLogo(logoPreview);
      setLogoUrl(res.data_url || null);
      setLogoOpen(false);
    } catch (err: any) {
      setLogoError(err.response?.data?.detail || 'Не удалось сохранить логотип школы');
    } finally {
      setLogoSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const role = getEffectiveRole(user);
  const isAdminLike = role === 'admin' || role === 'owner';
  const canAccessGroups = hasPermission(user, 'groups.access');
  const canAccessPrograms = hasPermission(user, 'programs.access');
  const canAccessAbonements = hasPermission(user, 'abonements.access');
  const canAccessSalesModule = hasPermission(user, 'sales.access');
  const canAccessOwnerWorkspace = hasPermission(user, 'owner_workspace.access');
  const canAccessSettings = hasPermission(user, 'settings.access');
  const canAccessCommunications = hasPermission(user, 'communications.access');
  const canAccessReports = hasPermission(user, 'reports.access');
  const canAccessB2B = hasPermission(user, 'b2b.access');
  const canAccessOwnerCalculations = hasPermission(user, 'owner_calculations.access');
  const canAccessLessons = hasPermission(user, 'lessons.access');
  const canAccessUsers = hasPermission(user, 'users.access');
  const canAccessRoles = hasPermission(user, 'roles.access');
  const canAccessPersons = hasPermission(user, 'persons.access');

  const effectiveMenuItems = (() => {
    if (role === 'guest') return [{ text: 'Программы', icon: <Book />, path: '/programs' }];
    if (role === 'parent')
      return [
        { text: 'Главная', icon: <Home />, path: '/parent-dashboard' },
        { text: 'Программы', icon: <Book />, path: '/programs' },
        { text: 'Оценки', icon: <Grade />, path: '/grades' },
        { text: 'Характеристики', icon: <Description />, path: '/characteristics' },
      ];
    if (role === 'sales' && canAccessSalesModule)
      return [
        { text: 'Ученики', icon: <People />, path: '/students' },
        { text: 'Тренеры', icon: <People />, path: '/trainers' },
        { text: 'Уроки', icon: <EventAvailable />, path: '/lessons' },
        { text: 'Лиды', icon: <WorkOutline />, path: '/sales/leads' },
        { text: 'Воронка', icon: <Dashboard />, path: '/sales/pipeline' },
        { text: 'События', icon: <EventAvailable />, path: '/sales/events' },
        { text: 'Инструкции', icon: <Description />, path: '/sales/instructions' },
        { text: 'Пропуски', icon: <PendingActions />, path: '/sales/absences' },
        { text: 'Оплаты', icon: <ReceiptLong />, path: '/sales/debts' },
        { text: 'Справка налогового вычета', icon: <ReceiptLong />, path: '/sales/tax-deduction' },
        ...(canAccessPersons ? [{ text: 'Реестр Person', icon: <Search />, path: '/persons' }] : []),
        { text: 'Проекты', icon: <Assignment />, path: '/projects' },
        { text: 'Задачи', icon: <Assignment />, path: '/tasks' },
        { text: 'Owner задачник', icon: <Assignment />, path: '/owner-workspace/projects' },
        { text: 'Отчёты задачника', icon: <Assessment />, path: '/owner-workspace/reports' },
        { text: 'Уведомления задачника', icon: <Notifications />, path: '/owner-workspace/notifications' },
        { text: 'Настройки задачника', icon: <Settings />, path: '/owner-workspace/settings' },
      ];

    const items = [
      { text: role === 'trainer' ? 'Кокпит тренера' : 'Главная', icon: role === 'trainer' ? <Bolt /> : <Dashboard />, path: role === 'trainer' ? '/trainer-cockpit' : '/dashboard' },
      { text: 'Ученики', icon: <People />, path: '/students' },
      { text: 'Группы', icon: <Group />, path: '/groups' },
      { text: 'Уроки', icon: <EventAvailable />, path: '/lessons' },
      { text: 'Программы', icon: <Book />, path: '/programs' },
      { text: 'Оценки', icon: <Grade />, path: '/grades' },
      { text: 'Характеристики', icon: <Description />, path: '/characteristics' },
    ];

    if (role === 'trainer') {
      items.push({ text: 'Оценки тренера', icon: <Grade />, path: '/trainer-grades' });
      items.push({ text: 'Задачи', icon: <Assignment />, path: '/tasks' });
      items.push({ text: 'Проекты', icon: <Assignment />, path: '/projects' });
      items.push({ text: 'Owner задачник', icon: <Assignment />, path: '/owner-workspace/projects' });
      items.push({ text: 'Отчёты задачника', icon: <Assessment />, path: '/owner-workspace/reports' });
      items.push({ text: 'Уведомления задачника', icon: <Notifications />, path: '/owner-workspace/notifications' });
      items.push({ text: 'Настройки задачника', icon: <Settings />, path: '/owner-workspace/settings' });
    }

    if (canAccessReports && role !== 'owner') items.push({ text: 'Отчёты', icon: <Assessment />, path: '/reports' });
    if (role === 'owner') {
      // Для владельца отчёты и финансовая модель доступны с главной страницы как вкладки.
      items.push({ text: 'Финансы (журнал)', icon: <AccountBalanceWallet />, path: '/finance/overview' });
      items.push({ text: 'Проекты (финансы)', icon: <AccountBalanceWallet />, path: '/finance/projects' });
    }
    if (isAdminLike) {
      items.push({ text: 'Инструкции', icon: <Description />, path: '/sales/instructions' });
      items.push({ text: 'Пропуски', icon: <PendingActions />, path: '/sales/absences' });
      items.push({ text: 'Оплаты', icon: <ReceiptLong />, path: '/sales/debts' });
      items.push({ text: 'Совместимость программ (отработки)', icon: <Assignment />, path: '/sales/program-makeup' });
      items.push({ text: 'Задачи', icon: <Assignment />, path: '/tasks' });
      items.push({ text: 'Проекты', icon: <Assignment />, path: '/projects' });
      items.push({ text: 'Owner задачник', icon: <Assignment />, path: '/owner-workspace/projects' });
      items.push({ text: 'Отчёты задачника', icon: <Assessment />, path: '/owner-workspace/reports' });
      items.push({ text: 'Уведомления задачника', icon: <Notifications />, path: '/owner-workspace/notifications' });
      items.push({ text: 'Настройки задачника', icon: <Settings />, path: '/owner-workspace/settings' });
    }
    if (canAccessSettings) items.push({ text: 'Настройки', icon: <Settings />, path: '/sales/settings' });
    if (canAccessCommunications) items.push({ text: 'Communication Hub', icon: <Notifications />, path: '/settings/communications' });
    if (canAccessRoles) items.push({ text: 'Роли и доступы', icon: <People />, path: '/roles' });
    if (canAccessPersons) items.push({ text: 'Реестр Person', icon: <Search />, path: '/persons' });
    if (canAccessB2B) {
      items.push({ text: 'План на сегодня', icon: <Assignment />, path: '/b2b-schools/plan' });
      items.push({ text: 'Работа со школами', icon: <School />, path: '/b2b-schools' });
    }
    if (role === 'owner') {
      items.push({ text: 'Абонементы', icon: <LocalOffer />, path: '/abonements' });
      items.push({ text: 'Тренеры', icon: <People />, path: '/trainers' });
      if (canAccessOwnerCalculations) items.push({ text: 'Расчёты', icon: <ReceiptLong />, path: '/calculations' });
      items.push({ text: 'Личные финансы', icon: <AccountBalanceWallet />, path: '/personal-finance' });
    }
    // У админа отдельная страница "Тренеры" убрана — доступ через объединённый раздел Ученики/группы при необходимости
    return items;
  })();
  const permissionFilteredMenuItems = effectiveMenuItems.filter((item) => {
    if (item.path === '/groups') return canAccessGroups;
    if (item.path === '/programs') return canAccessPrograms;
    if (item.path === '/abonements') return canAccessAbonements;
    if (item.path === '/lessons') return canAccessLessons;
    if (item.path === '/trainers') return canAccessUsers;
    return true;
  });
  const permissionExpandedMenuItems = [...permissionFilteredMenuItems];
  if (canAccessGroups && !permissionExpandedMenuItems.some((item) => item.path === '/groups')) {
    permissionExpandedMenuItems.push({ text: 'Группы', icon: <Group />, path: '/groups' });
  }
  if (canAccessPrograms && !permissionExpandedMenuItems.some((item) => item.path === '/programs')) {
    permissionExpandedMenuItems.push({ text: 'Программы', icon: <Book />, path: '/programs' });
  }
  if (canAccessAbonements && !permissionExpandedMenuItems.some((item) => item.path === '/abonements')) {
    permissionExpandedMenuItems.push({ text: 'Абонементы', icon: <LocalOffer />, path: '/abonements' });
  }
  if (canAccessLessons && !permissionExpandedMenuItems.some((item) => item.path === '/lessons')) {
    permissionExpandedMenuItems.push({ text: 'Уроки', icon: <EventAvailable />, path: '/lessons' });
  }
  if (canAccessUsers && !permissionExpandedMenuItems.some((item) => item.path === '/trainers')) {
    permissionExpandedMenuItems.push({ text: 'Тренеры', icon: <People />, path: '/trainers' });
  }
  const visibleMenuItems = canAccessOwnerWorkspace
    ? permissionExpandedMenuItems
    : permissionExpandedMenuItems.filter((item) => !item.path.startsWith('/owner-workspace'));

  /** Подсветка «Owner задачник» для любого `/owner-workspace/*`, кроме отдельных пунктов уведомлений и настроек. */
  const isOwnerWorkspaceMainSection = (pathname: string) =>
    pathname.startsWith('/owner-workspace') &&
    pathname !== '/owner-workspace/reports' &&
    pathname !== '/owner-workspace/notifications' &&
    pathname !== '/owner-workspace/settings';

  const isDrawerItemSelected = (itemPath: string) => {
    if (itemPath === '/owner-workspace/reports') return location.pathname === '/owner-workspace/reports';
    if (itemPath === '/owner-workspace/notifications') return location.pathname === '/owner-workspace/notifications';
    if (itemPath === '/owner-workspace/settings') return location.pathname === '/owner-workspace/settings';
    if (itemPath === '/owner-workspace/projects') return isOwnerWorkspaceMainSection(location.pathname);
    return location.pathname === itemPath;
  };

  const appBarPageTitle =
    effectiveMenuItems.find((item) => item.path === location.pathname)?.text ??
    (isOwnerWorkspaceMainSection(location.pathname) ? 'Owner задачник' : null) ??
    'Портал управления обучением';

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Toolbar sx={{ flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {logoUrl ? (
            <Box
              component="img"
              src={logoUrl}
              alt="Логотип школы"
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                objectFit: 'contain',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                backgroundColor: '#fff',
              }}
            />
          ) : (
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                backgroundImage:
                  'linear-gradient(135deg, rgba(37,99,235,1) 0%, rgba(124,58,237,1) 100%)',
                boxShadow: '0px 10px 30px rgba(15, 23, 42, 0.18)',
              }}
            />
          )}
          <Box>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, letterSpacing: -0.2 }}>
              Портал управления обучением
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Learning Portal
            </Typography>
          </Box>
        </Box>
      </Toolbar>
      <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {visibleMenuItems.map((item) => (
          <ListItemButton
            key={item.text}
            selected={isDrawerItemSelected(item.path)}
            onClick={() => {
              navigate(item.path);
              setMobileOpen(false);
            }}
            sx={{
              mx: 1,
              my: 0.5,
              borderRadius: 2,
              '&.Mui-selected': {
                bgcolor: 'rgba(37, 99, 235, 0.10)',
                color: 'text.primary',
                '& .MuiListItemIcon-root': { color: 'primary.main' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItemButton>
        ))}
      </List>
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, flexShrink: 0 }}>
        Обновление 22.02
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', bgcolor: 'background.default', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 800 }}>
            {appBarPageTitle}
          </Typography>
          {role === 'sales' && canAccessSalesModule && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.15)',
                }}
              >
                <Search fontSize="small" />
                <InputBase
                  placeholder="Поиск лидов..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      navigate(`/sales/leads?q=${encodeURIComponent(salesSearch.trim())}`);
                    }
                  }}
                  sx={{ ml: 1, color: '#fff', minWidth: 180 }}
                />
              </Box>
              <Tooltip title="+ Лид">
                <IconButton color="inherit" onClick={() => navigate('/sales/leads?create=1')}>
                  <Add />
                </IconButton>
              </Tooltip>
              <Tooltip title="Задачи и напоминания по лидам">
                <IconButton color="inherit" onClick={() => navigate('/sales/leads?status_filter=new&overdue_only=1')}>
                  <Badge badgeContent={salesAlertsCount} color="error">
                    <NotificationsNone />
                  </Badge>
                </IconButton>
              </Tooltip>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.full_name}
            </Typography>
            <IconButton onClick={handleMenuClick} size="small">
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  backgroundImage:
                    'linear-gradient(135deg, rgba(37,99,235,1) 0%, rgba(124,58,237,1) 100%)',
                }}
              >
                {user?.full_name?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
            >
              {isAdminLike && (
                <MenuItem onClick={handleLogoOpen}>
                  <ListItemText>Логотип школы</ListItemText>
                </MenuItem>
              )}
              {role !== 'guest' && (
                <MenuItem onClick={handleTelegramLink}>
                  <ListItemIcon>
                    <TelegramIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Telegram: привязать</ListItemText>
                </MenuItem>
              )}
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <ExitToApp fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Выход</ListItemText>
                </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: 'background.paper',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: 'background.paper',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Box sx={{ maxWidth: 1240, mx: 'auto' }}>{children}</Box>
      </Box>

      <Dialog open={tgOpen} onClose={() => setTgOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Я╤А╨╕╨▓╤П╨╖╨║╨░ Telegram</DialogTitle>
        <DialogContent>
          {tgError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setTgError('')}>
              {tgError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            ╨Э╨░╨┐╨╕╤И╨╕╤В╨╡ ╨▒╨╛╤В╤Г ╨║╨╛╨╝╨░╨╜╨┤╤Г:
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, fontWeight: 700 }}>
            /start {tgCode || '...'}
          </Typography>
          {tgLink && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              ╨Ы╨╕╨▒╨╛ ╨╛╤В╨║╤А╨╛╨╣╤В╨╡ ╤Б╤Б╤Л╨╗╨║╤Г: <code>{tgLink}</code>
            </Typography>
          )}
          {tgExpiresAt && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              ╨Ъ╨╛╨┤ ╨┤╨╡╨╣╤Б╤В╨▓╤Г╨╡╤В ╨┤╨╛: {new Date(tgExpiresAt).toLocaleString('ru-RU')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTgOpen(false)}>╨Ч╨░╨║╤А╤Л╤В╤М</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={logoOpen} onClose={() => setLogoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Ы╨╛╨│╨╛╤В╨╕╨┐ ╤Б╨░╨╣╤В╨░</DialogTitle>
        <DialogContent>
          {logoError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLogoError('')}>
              {logoError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            ╨Ч╨░╨│╤А╤Г╨╖╨╕╤В╨╡ ╨╗╨╛╨│╨╛╤В╨╕╨┐ (PNG/JPG/WebP). ╨а╨╡╨║╨╛╨╝╨╡╨╜╨┤╤Г╨╡╨╝╤Л╨╣ ╤А╨░╨╖╨╝╨╡╤А: ╨║╨▓╨░╨┤╤А╨░╤В, ╨┤╨╛ ~180KB.
          </Typography>

          <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" component="label">
              ╨Т╤Л╨▒╤А╨░╤В╤М ╤Д╨░╨╣╨╗
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
              />
            </Button>
            <Button
              variant="contained"
              onClick={handleLogoSave}
              disabled={logoSaving || !logoPreview}
            >
              {logoSaving ? '╨б╨╛╤Е╤А╨░╨╜╨╡╨╜╨╕╨╡...' : '╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М'}
            </Button>
          </Box>

          {logoPreview && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                ╨Я╤А╨╡╨▓╤М╤О:
              </Typography>
              <Box
                component="img"
                src={logoPreview}
                alt="╨Я╤А╨╡╨▓╤М╤О ╨╗╨╛╨│╨╛╤В╨╕╨┐╨░"
                sx={{
                  display: 'block',
                  mt: 1,
                  maxWidth: '100%',
                  maxHeight: 120,
                  borderRadius: 2,
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#fff',
                }}
              />
            </Box>
          )}

          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="╨в╨╡╨║╤Г╤Й╨╕╨╣ ╨╗╨╛╨│╨╛╤В╨╕╨┐ (data URL)"
            value={logoUrl || ''}
            InputProps={{ readOnly: true }}
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoOpen(false)}>╨Ч╨░╨║╤А╤Л╤В╤М</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Layout;

