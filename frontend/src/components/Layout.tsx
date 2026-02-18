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
      setTgError(err.response?.data?.detail || '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨┐╨╛╨╗╤Г╤З╨╕╤В╤М ╨║╨╛╨┤ ╨┤╨╗╤П Telegram');
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
      setLogoError('╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╤Д╨░╨╣╨╗ ╨╕╨╖╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╤П (png/jpg/webp)');
      return;
    }
    // ╨Ю╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╨╡ ~200KB ╨┤╨╗╤П ╤Г╨┤╨╛╨▒╤Б╤В╨▓╨░ (╨▓ base64 ╨▒╤Г╨┤╨╡╤В ╨▒╨╛╨╗╤М╤И╨╡)
    if (file.size > 180 * 1024) {
      setLogoError('╨д╨░╨╣╨╗ ╤Б╨╗╨╕╤И╨║╨╛╨╝ ╨▒╨╛╨╗╤М╤И╨╛╨╣. ╨а╨╡╨║╨╛╨╝╨╡╨╜╨┤╤Г╨╡╨╝╤Л╨╣ ╤А╨░╨╖╨╝╨╡╤А ╨┤╨╛ 180KB.');
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
      setLogoError('╨б╨╜╨░╤З╨░╨╗╨░ ╨▓╤Л╨▒╨╡╤А╨╕╤В╨╡ ╨╕╨╖╨╛╨▒╤А╨░╨╢╨╡╨╜╨╕╨╡');
      return;
    }
    setLogoSaving(true);
    try {
      const res = await settingsApi.setLogo(logoPreview);
      setLogoUrl(res.data_url || null);
      setLogoOpen(false);
    } catch (err: any) {
      setLogoError(err.response?.data?.detail || '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╗╨╛╨│╨╛╤В╨╕╨┐');
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
    if (role === 'guest') return [{ text: '╨Я╤А╨╛╨│╤А╨░╨╝╨╝╤Л', icon: <Book />, path: '/programs' }];
    if (role === 'parent')
      return [
        { text: '╨Ь╨╛╨╣ ╨┤╨░╤И╨▒╨╛╤А╨┤', icon: <Home />, path: '/parent-dashboard' },
        { text: '╨Я╤А╨╛╨│╤А╨░╨╝╨╝╤Л', icon: <Book />, path: '/programs' },
        { text: '╨Ю╤Ж╨╡╨╜╨║╨╕', icon: <Grade />, path: '/grades' },
        { text: '╨е╨░╤А╨░╨║╤В╨╡╤А╨╕╤Б╤В╨╕╨║╨╕', icon: <Description />, path: '/characteristics' },
      ];
    if (role === 'sales')
      return [
        { text: '╨Э╨░ ╤Б╨╡╨│╨╛╨┤╨╜╤П', icon: <Dashboard />, path: '/sales/dashboard' },
        { text: '╨Т╨╛╤А╨╛╨╜╨║╨░', icon: <Dashboard />, path: '/sales/pipeline' },
        { text: '╨Ы╨╕╨┤╤Л', icon: <WorkOutline />, path: '/sales/leads' },
        { text: '╨д╨╛╨╗╨╗╨╛╤Г-╨░╨┐╤Л', icon: <PendingActions />, path: '/sales/follow-ups' },
        { text: '╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П', icon: <EventAvailable />, path: '/sales/events' },
        { text: '╨Ш╨╜╨▓╨╛╨╣╤Б╤Л', icon: <ReceiptLong />, path: '/sales/invoices' },
        { text: '╨Ю╤В╤З╤С╤В╤Л', icon: <Assessment />, path: '/sales/reports' },
        { text: '╨Ч╨░╨┤╨░╤З╨╕', icon: <Assignment />, path: '/tasks' },
        { text: '╨б╨┐╤А╨░╨▓╨╛╤З╨╜╨╕╨║╨╕ Sales', icon: <Settings />, path: '/sales/settings' },
      ];

    const items = [
      { text: '╨Ф╨░╤И╨▒╨╛╤А╨┤', icon: <Dashboard />, path: '/dashboard' },
      { text: '╨г╤З╨╡╨╜╨╕╨║╨╕', icon: <People />, path: '/students' },
      { text: '╨У╤А╤Г╨┐╨┐╤Л', icon: <Group />, path: '/groups' },
      { text: '╨Я╤А╨╛╨│╤А╨░╨╝╨╝╤Л', icon: <Book />, path: '/programs' },
      { text: '╨Ю╤Ж╨╡╨╜╨║╨╕', icon: <Grade />, path: '/grades' },
      { text: '╨е╨░╤А╨░╨║╤В╨╡╤А╨╕╤Б╤В╨╕╨║╨╕', icon: <Description />, path: '/characteristics' },
    ];

    if (isAdminLike) items.push({ text: '╨Ю╤В╤З╨╡╤В╤Л', icon: <Assessment />, path: '/reports' });
    if (role === 'owner') items.push({ text: '╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨░╤П ╨╝╨╛╨┤╨╡╨╗╤М', icon: <AccountBalance />, path: '/financial-model' });
    if (isAdminLike) items.push({ text: '╨Я╤А╨╛╨┤╨░╨╢╨╕: ╨Э╨░ ╤Б╨╡╨│╨╛╨┤╨╜╤П', icon: <Dashboard />, path: '/sales/dashboard' });
    if (isAdminLike) items.push({ text: '╨Ч╨░╨┤╨░╤З╨╕', icon: <Assignment />, path: '/tasks' });
    if (isAdminLike) items.push({ text: '╨б╨┐╤А╨░╨▓╨╛╤З╨╜╨╕╨║╨╕ Sales', icon: <Settings />, path: '/sales/settings' });
    if (role === 'owner') {
      items.push({ text: '╨Т╨╛╤А╨╛╨╜╨║╨╕', icon: <FilterList />, path: '/owner-funnels' });
      items.push({ text: 'B2B (╤И╨║╨╛╨╗╤Л)', icon: <School />, path: '/b2b-schools' });
      items.push({ text: '╨б╨╛╨╖╨┤╨░╤В╤М ╤И╨║╨╛╨╗╤Г (B2B)', icon: <Add />, path: '/b2b-schools/new' });
      items.push({ text: '╨Р╨▒╨╛╨╜╨╡╨╝╨╡╨╜╤В╤Л', icon: <LocalOffer />, path: '/abonements' });
      items.push({ text: '╨в╤А╨╡╨╜╨╡╤Р╤Л', icon: <People />, path: '/trainers' });
    }
    return items;
  })();

  const drawer = (
    <div>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {logoUrl ? (
            <Box
              component="img"
              src={logoUrl}
              alt="╨Ы╨╛╨│╨╛╤В╨╕╨┐"
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
              ╨Я╨╛╤А╤В╨░╨╗ ╨╛╨▒╤Г╤З╨╡╨╜╨╕╤П
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Learning Portal
            </Typography>
          </Box>
        </Box>
      </Toolbar>
      <List>
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
    </div>
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
            {effectiveMenuItems.find((item) => item.path === location.pathname)?.text || '╨Я╨╛╤А╤В╨░╨╗ ╨╛╨▒╤Г╤З╨╡╨╜╨╕╤П'}
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
                  placeholder="╨Я╨╛╨╕╤Б╨║ ╨╗╨╕╨┤╨░..."
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
              <Tooltip title="+ ╨Ы╨╕╨┤">
                <IconButton color="inherit" onClick={() => navigate('/sales/leads?create=1')}>
                  <Add />
                </IconButton>
              </Tooltip>
              <Tooltip title="╨Я╤А╨╛╤Б╤А╨╛╤З╨║╨╕ ╨╕ ╤Б╤А╨╛╤З╨╜╤Л╨╡ ╨╖╨░╨┤╨░╤З╨╕">
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
                  <ListItemText>╨Ы╨╛╨│╨╛╤В╨╕╨┐ ╤Б╨░╨╣╤В╨░</ListItemText>
                </MenuItem>
              )}
              {user?.role !== 'guest' && (
                <MenuItem onClick={handleTelegramLink}>
                  <ListItemIcon>
                    <TelegramIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Telegram: ╨┐╤А╨╕╨▓╤П╨╖╨░╤В╤М</ListItemText>
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <ExitToApp fontSize="small" />
                </ListItemIcon>
                <ListItemText>╨Т╤Л╤Е╨╛╨┤</ListItemText>
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

