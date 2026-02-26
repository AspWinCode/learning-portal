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
  AccountBalance,
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
  Search,
  FilterList,
  School,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { salesApi, settingsApi, telegramApi } from '../services/api';

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
    if (user?.role !== 'sales') return;
    (async () => {
      try {
        const d = await salesApi.getSalesDashboard();
        setSalesAlertsCount((d.kpi_need_push_overdue || 0) + (d.kpi_need_push_urgent || 0));
      } catch {
        // ignore topbar alerts errors
      }
    })();
  }, [user?.role]);

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

  const role = user?.role;
  const isAdminLike = role === 'admin' || role === 'owner';

  const effectiveMenuItems = (() => {
    if (role === 'guest') return [{ text: 'Программы', icon: <Book />, path: '/programs' }];
    if (role === 'parent')
      return [
        { text: 'Главная', icon: <Home />, path: '/parent-dashboard' },
        { text: 'Программы', icon: <Book />, path: '/programs' },
        { text: 'Оценки', icon: <Grade />, path: '/grades' },
        { text: 'Характеристики', icon: <Description />, path: '/characteristics' },
      ];
    if (role === 'sales')
      return [
        { text: 'Дашборд продаж', icon: <Dashboard />, path: '/sales/dashboard' },
        { text: 'Ученики', icon: <People />, path: '/students' },
        { text: 'Уроки', icon: <EventAvailable />, path: '/lessons' },
        { text: 'Ручные уроки', icon: <EventAvailable />, path: '/sales/manual-lessons' },
        { text: 'Лиды', icon: <WorkOutline />, path: '/sales/leads' },
        { text: 'Воронка', icon: <Dashboard />, path: '/sales/pipeline' },
        { text: 'Фоллоу-апы', icon: <PendingActions />, path: '/sales/follow-ups' },
        { text: 'События', icon: <EventAvailable />, path: '/sales/events' },
        { text: 'Позвать снова на мероприятие', icon: <EventAvailable />, path: '/sales/reinvite-event' },
        { text: 'Решили сразу', icon: <EventAvailable />, path: '/sales/agreed' },
        { text: 'Дожать на обучение', icon: <PendingActions />, path: '/sales/post-visit' },
        { text: 'Счета', icon: <ReceiptLong />, path: '/sales/invoices' },
        { text: 'Отчёты', icon: <Assessment />, path: '/sales/reports' },
        { text: 'Инструкции', icon: <Description />, path: '/sales/instructions' },
        { text: 'Пропуски', icon: <PendingActions />, path: '/sales/absences' },
        { text: 'Оплаты', icon: <ReceiptLong />, path: '/sales/debts' },
        { text: 'Справка налогового вычета', icon: <ReceiptLong />, path: '/sales/tax-deduction' },
        { text: 'Проекты', icon: <Assignment />, path: '/projects' },
        { text: 'Задачи', icon: <Assignment />, path: '/tasks' },
        { text: 'Настройки Sales', icon: <Settings />, path: '/sales/settings' },
      ];

    const items = [
      { text: 'Главная', icon: <Dashboard />, path: '/dashboard' },
      { text: 'Ученики', icon: <People />, path: '/students' },
      { text: 'Группы', icon: <Group />, path: '/groups' },
      { text: 'Уроки', icon: <EventAvailable />, path: '/lessons' },
      { text: 'Программы', icon: <Book />, path: '/programs' },
      { text: 'Оценки', icon: <Grade />, path: '/grades' },
      { text: 'Характеристики', icon: <Description />, path: '/characteristics' },
    ];

    if (isAdminLike) items.push({ text: 'Отчёты', icon: <Assessment />, path: '/reports' });
    if (role === 'owner') items.push({ text: 'Финансовая модель', icon: <AccountBalance />, path: '/financial-model' });
    if (isAdminLike) {
      items.push({ text: 'Инструкции', icon: <Description />, path: '/sales/instructions' });
      items.push({ text: 'Пропуски', icon: <PendingActions />, path: '/sales/absences' });
      items.push({ text: 'Оплаты', icon: <ReceiptLong />, path: '/sales/debts' });
      items.push({ text: 'Совместимость программ (отработки)', icon: <Assignment />, path: '/sales/program-makeup' });
      items.push({ text: 'Задачи', icon: <Assignment />, path: '/tasks' });
      items.push({ text: 'Проекты', icon: <Assignment />, path: '/projects' });
    }
    if (isAdminLike) items.push({ text: 'Настройки Sales', icon: <Settings />, path: '/sales/settings' });
    if (role === 'owner') {
      items.push({ text: 'План на сегодня', icon: <Assignment />, path: '/b2b-schools/plan' });
      items.push({ text: 'B2B (школы)', icon: <School />, path: '/b2b-schools' });
      items.push({ text: 'Новая B2B-школа', icon: <Add />, path: '/b2b-schools/new' });
      items.push({ text: 'Абонементы', icon: <LocalOffer />, path: '/abonements' });
      items.push({ text: 'Тренеры', icon: <People />, path: '/trainers' });
      items.push({ text: 'Расчёты', icon: <ReceiptLong />, path: '/calculations' });
    }
    return items;
  })();

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
        {effectiveMenuItems.map((item) => (
          <ListItemButton
            key={item.text}
            selected={location.pathname === item.path}
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
            {effectiveMenuItems.find((item) => item.path === location.pathname)?.text || 'Портал управления обучением'}
          </Typography>
          {role === 'sales' && (
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
                <IconButton color="inherit" onClick={() => navigate('/sales/follow-ups?period=overdue')}>
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
              {user?.role !== 'guest' && (
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

