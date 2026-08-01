import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Collapse,
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
  BottomNavigation,
  BottomNavigationAction,
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
  Folder,
  NotificationsNone,
  Notifications,
  Search,
  School,
  Bolt,
  Lock,
  Link,
  Mic,
  ChevronLeft,
  ChevronRight,
  ExpandLess,
  ExpandMore,
  RssFeed,
  RocketLaunch,
  SwapHoriz,
  Tune,
  WebAsset,
  DesktopWindows,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { salesApi, settingsApi, telegramApi } from '../services/api';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import EditNoteIcon from '@mui/icons-material/EditNote';
import {
  SIDEBAR_BG, SIDEBAR_BORDER, SIDEBAR_ITEM_HO, SIDEBAR_ITEM_SEL,
  SIDEBAR_ICON, SIDEBAR_ICON_SEL,
  SIDEBAR_TEXT, SIDEBAR_TEXT_SEL, SIDEBAR_TEXT_DIM,
} from '../theme';

const DRAWER_OPEN = 240;
const DRAWER_MINI = 64;
const SIDEBAR_SCROLL_STORAGE_KEY = 'sb_scroll_top';

// Группы меню: id → массив путей
const NAV_GROUPS: Array<{ id: string; label: string; paths: Set<string> }> = [
  { id: 'home', label: '🏠 Главная', paths: new Set(['/dashboard', '/parent-dashboard', '/b2b-schools/plan']) },
  { id: 'education', label: '🎓 Обучение', paths: new Set(['/trainer-cockpit', '/students', '/groups', '/lessons', '/programs', '/grades', '/characteristics', '/trainer-grades', '/trainers', '/methodists']) },
  { id: 'ops', label: '📋 Учебные операции', paths: new Set(['/operations/absences', '/operations/program-makeup', '/operations/instructions', '/operations/manual-lessons', '/projects']) },
  { id: 'finance', label: '💰 Финансы', paths: new Set(['/finance/overview', '/abonements', '/finance/payments', '/calculations', '/finance/tax-deduction']) },
  { id: 'workspace', label: '✅ Задачи и проекты', paths: new Set(['/tasks', '/owner-workspace/projects', '/owner-workspace/links', '/disk', '/passwords', '/transcription', '/notes', '/agile']) },
  { id: 'b2b', label: '🤝 Контрагенты и B2B', paths: new Set(['/owner-workspace/counterparties', '/b2b-schools']) },
  { id: 'system', label: '⚙️ Администрирование', paths: new Set(['/admin/settings', '/settings/communications', '/roles', '/reports']) },
];

interface LayoutProps {
  children: React.ReactNode;
}

const pageTitleVariants = new Set(['h1', 'h2', 'h3', 'h4', 'h5']);

const normalizeTitle = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const getPlainText = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getPlainText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return getPlainText(node.props.children);
  return '';
};

const removeDuplicateContentTitle = (
  node: React.ReactNode,
  appBarTitle: string,
  removed: { current: boolean },
  depth = 0,
): React.ReactNode => {
  if (removed.current || !node) return node;

  if (Array.isArray(node)) {
    return node.map((child) => removeDuplicateContentTitle(child, appBarTitle, removed, depth));
  }

  if (!React.isValidElement<{ children?: React.ReactNode; variant?: string }>(node)) return node;

  const variant = node.props.variant;
  const titleMatches =
    typeof variant === 'string' &&
    pageTitleVariants.has(variant) &&
    normalizeTitle(getPlainText(node.props.children)) === normalizeTitle(appBarTitle);

  if (titleMatches) {
    removed.current = true;
    return null;
  }

  if (depth >= 3 || !node.props.children) return node;

  const nextChildren = removeDuplicateContentTitle(node.props.children, appBarTitle, removed, depth + 1);
  return nextChildren === node.props.children ? node : React.cloneElement(node, undefined, nextChildren);
};

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sb_collapsed') === '1'; } catch { return false; }
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sb_groups') || '{}'); } catch { return {}; }
  });
  const navListRef = React.useRef<HTMLElement | null>(null);
  const drawerWidth = sidebarCollapsed ? DRAWER_MINI : DRAWER_OPEN;

  const saveSidebarScroll = React.useCallback((node = navListRef.current) => {
    if (!node) return;
    try { sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(node.scrollTop)); } catch {}
  }, []);

  const restoreSidebarScroll = React.useCallback((node = navListRef.current) => {
    if (!node) return;
    try {
      const savedScroll = Number(sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY) || 0);
      if (savedScroll > 0) {
        node.scrollTop = savedScroll;
      }
    } catch {}
  }, []);

  const handleNavScrollRef = React.useCallback((node: HTMLElement | null) => {
    navListRef.current = node;
    if (!node) return;
    requestAnimationFrame(() => restoreSidebarScroll(node));
  }, [restoreSidebarScroll]);

  const toggleSidebar = () => setSidebarCollapsed(v => {
    const next = !v;
    try { localStorage.setItem('sb_collapsed', next ? '1' : '0'); } catch {}
    return next;
  });
  const toggleGroup = (id: string) => setExpandedGroups(prev => {
    const next = { ...prev, [id]: prev[id] === false };
    try { localStorage.setItem('sb_groups', JSON.stringify(next)); } catch {}
    return next;
  });
  const isGroupOpen = (id: string) => expandedGroups[id] !== false;

  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const isStandalonePwa =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
  const hasPwaQuery = new URLSearchParams(location.search).get('pwa') === '1';
  const hasStoredPwaMode = (() => {
    try {
      return sessionStorage.getItem('pwa_mode') === '1';
    } catch {
      return false;
    }
  })();
  const isPwaNavigation = hasPwaQuery || isStandalonePwa || hasStoredPwaMode;
  const [pwaAllowedRoutes, setPwaAllowedRoutes] = React.useState<Set<string> | null>(null);
  const [notesEnabledRoles, setNotesEnabledRoles] = React.useState<string[]>(['owner']);

  React.useEffect(() => {
    (async () => {
      try {
        const data = await settingsApi.getLogo();
        setLogoUrl(data.data_url || null);
      } catch {
        // ignore
      }
    })();
    (async () => {
      try {
        const data = await settingsApi.getNotesEnabledRoles();
        setNotesEnabledRoles(data.enabled_roles);
      } catch {
        // ignore — default to owner only
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

  React.useEffect(() => {
    if (!isPwaNavigation) {
      setPwaAllowedRoutes(null);
      return;
    }
    try {
      sessionStorage.setItem('pwa_mode', '1');
    } catch {
      // ignore storage errors
    }
    let mounted = true;
    settingsApi
      .getMyPwaSettings()
      .then((data) => {
        if (!mounted) return;
        const enabled = new Set(data.enabled_modules);
        setPwaAllowedRoutes(new Set(data.modules.filter((module) => enabled.has(module.key)).map((module) => module.route)));
      })
      .catch(() => {
        if (mounted) setPwaAllowedRoutes(new Set());
      });
    return () => {
      mounted = false;
    };
  }, [isPwaNavigation]);

  React.useEffect(() => {
    if (!isPwaNavigation || !pwaAllowedRoutes) return;
    if (location.pathname === '/mobile' || pwaAllowedRoutes.has(location.pathname)) return;
    navigate('/mobile', { replace: true });
  }, [isPwaNavigation, location.pathname, navigate, pwaAllowedRoutes]);

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
  const canAccessSeoModule = hasPermission(user, 'seo.access');
  const canAccessOwnerWorkspace = hasPermission(user, 'owner_workspace.access');
  const canAccessSettings = hasPermission(user, 'settings.access');
  const canAccessCommunications = hasPermission(user, 'communications.access');
  const canAccessReports = hasPermission(user, 'reports.access');
  const canAccessB2B = hasPermission(user, 'b2b.access');
  const canAccessOwnerCalculations = hasPermission(user, 'owner_calculations.access');
  const canAccessLessons = hasPermission(user, 'lessons.access');
  const canAccessUsers = hasPermission(user, 'users.access');
  const canAccessRoles = hasPermission(user, 'roles.access');
  const canAccessPasswords = hasPermission(user, 'passwords.access');
  const canAccessNotes = notesEnabledRoles.includes(role ?? '') || role === 'owner' || role === 'admin';
  const canAccessAgile = hasPermission(user, 'agile.access');

  const effectiveMenuItems = (() => {
    if (role === 'developer')
      return [
        { text: 'IT-проекты', icon: <RocketLaunch />, path: '/agile' },
        { text: 'Задачи', icon: <Assignment />, path: '/tasks' },
        { text: 'Проекты', icon: <Assignment />, path: '/projects' },
        { text: 'Таск трекер', icon: <Assignment />, path: '/owner-workspace/projects' },
        { text: 'Диск', icon: <Folder />, path: '/disk' },
        ...(canAccessPasswords ? [{ text: 'Пароли', icon: <Lock />, path: '/passwords' }] : []),
        ...(canAccessNotes ? [{ text: 'Заметки', icon: <EditNoteIcon />, path: '/notes' }] : []),
      ];
    if (role === 'guest') return [{ text: 'Программы', icon: <Book />, path: '/programs' }];
    if (role === 'parent')
      return [
        { text: 'Главная', icon: <Home />, path: '/parent-dashboard' },
        { text: 'Программы', icon: <Book />, path: '/programs' },
        { text: 'Оценки', icon: <Grade />, path: '/grades' },
        { text: 'Характеристики', icon: <Description />, path: '/characteristics' },
        ...(canAccessNotes ? [{ text: 'Заметки', icon: <EditNoteIcon />, path: '/notes' }] : []),
      ];
    if (role === 'sales' && canAccessSalesModule)
      return [
        { text: 'Ученики', icon: <People />, path: '/students' },
        { text: 'Тренеры', icon: <People />, path: '/trainers' },
        { text: 'Уроки', icon: <EventAvailable />, path: '/lessons' },
        { text: 'Лиды', icon: <WorkOutline />, path: '/sales/leads' },
        { text: 'Воронка', icon: <Dashboard />, path: '/sales/pipeline' },
        { text: 'События', icon: <EventAvailable />, path: '/sales/events' },
        { text: 'Инструкции', icon: <Description />, path: '/operations/instructions' },
        { text: 'Пропуски', icon: <PendingActions />, path: '/operations/absences' },
        { text: 'Оплаты', icon: <ReceiptLong />, path: '/finance/payments' },
        { text: 'Справка налогового вычета', icon: <ReceiptLong />, path: '/finance/tax-deduction' },
        { text: 'Проекты', icon: <Assignment />, path: '/projects' },
        { text: 'Задачи', icon: <Assignment />, path: '/tasks' },
        { text: 'Таск трекер', icon: <Assignment />, path: '/owner-workspace/projects' },
        { text: 'Диск', icon: <Folder />, path: '/disk' },
        ...(canAccessPasswords ? [{ text: 'Пароли', icon: <Lock />, path: '/passwords' }] : []),
        ...(canAccessNotes ? [{ text: 'Заметки', icon: <EditNoteIcon />, path: '/notes' }] : []),
      ];
    if (role === 'seo_manager' && canAccessSeoModule)
      return [
        { text: 'Страницы сайта', icon: <Description />, path: '/seo/pages' },
        { text: 'Блог', icon: <RssFeed />, path: '/blog/posts' },
        { text: 'Контент сайта', icon: <WebAsset />, path: '/cms/editor' },
        { text: 'Визуальный редактор', icon: <DesktopWindows />, path: '/seo/visual-editor' },
        { text: 'Редиректы', icon: <SwapHoriz />, path: '/seo/redirects' },
        { text: 'Настройки сайта', icon: <Tune />, path: '/seo/site-settings' },
        { text: 'Публикация сайта', icon: <RocketLaunch />, path: '/seo/publish' },
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
      items.push({ text: 'Таск трекер', icon: <Assignment />, path: '/owner-workspace/projects' });
      items.push({ text: 'Полезные ссылки', icon: <Link />, path: '/owner-workspace/links' });
      items.push({ text: 'Диск', icon: <Folder />, path: '/disk' });
      if (canAccessPasswords) items.push({ text: 'Пароли', icon: <Lock />, path: '/passwords' });
      if (canAccessNotes) items.push({ text: 'Заметки', icon: <EditNoteIcon />, path: '/notes' });
    }

    if (canAccessReports && role !== 'owner') items.push({ text: 'Отчёты', icon: <Assessment />, path: '/reports' });
    if (role === 'owner') {
      // Для владельца финансовые представления сгруппированы в один раздел меню.
      items.push({ text: 'Журнал', icon: <AccountBalanceWallet />, path: '/finance/overview' });
      if (canAccessAbonements) items.push({ text: 'Абонементы', icon: <LocalOffer />, path: '/abonements' });
      items.push({ text: 'Оплаты', icon: <ReceiptLong />, path: '/finance/payments' });
      if (canAccessOwnerCalculations) items.push({ text: 'Расчёты', icon: <ReceiptLong />, path: '/calculations' });
    }
    if (isAdminLike) {
      items.push({ text: 'Инструкции', icon: <Description />, path: '/operations/instructions' });
      items.push({ text: 'Пропуски', icon: <PendingActions />, path: '/operations/absences' });
      if (!items.some((item) => item.path === '/finance/payments')) {
        items.push({ text: 'Оплаты', icon: <ReceiptLong />, path: '/finance/payments' });
      }
items.push({ text: 'Задачи', icon: <Assignment />, path: '/tasks' });
      items.push({ text: 'Проекты', icon: <Assignment />, path: '/projects' });
      items.push({ text: 'Таск трекер', icon: <Assignment />, path: '/owner-workspace/projects' });
      items.push({ text: 'Полезные ссылки', icon: <Link />, path: '/owner-workspace/links' });
      items.push({ text: 'Диск', icon: <Folder />, path: '/disk' });
      if (role === 'owner') items.push({ text: 'Транскрибация', icon: <Mic />, path: '/transcription' });
      if (canAccessPasswords) items.push({ text: 'Пароли', icon: <Lock />, path: '/passwords' });
      if (canAccessNotes) items.push({ text: 'Заметки', icon: <EditNoteIcon />, path: '/notes' });
    }
    if (canAccessSettings) items.push({ text: 'Настройки', icon: <Settings />, path: '/admin/settings' });
    if (canAccessCommunications) items.push({ text: 'Communication Hub', icon: <Notifications />, path: '/settings/communications' });
    if (canAccessRoles) items.push({ text: 'Роли и доступы', icon: <People />, path: '/roles' });
    if (role === 'owner' && canAccessOwnerWorkspace) {
      items.push({ text: 'Контрагенты', icon: <People />, path: '/owner-workspace/counterparties' });
    }
    if (canAccessB2B) {
      items.push({ text: 'План на сегодня', icon: <Assignment />, path: '/b2b-schools/plan' });
      items.push({ text: 'Работа со школами', icon: <School />, path: '/b2b-schools' });
    }
    if (role === 'owner') {
      items.push({ text: 'Тренеры', icon: <People />, path: '/trainers' });
      items.push({ text: 'Методисты', icon: <People />, path: '/methodists' });
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
    if (item.path === '/methodists') return canAccessUsers;
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
  if (canAccessUsers && !permissionExpandedMenuItems.some((item) => item.path === '/methodists')) {
    permissionExpandedMenuItems.push({ text: 'Методисты', icon: <People />, path: '/methodists' });
  }
  if (canAccessAgile && !permissionExpandedMenuItems.some(i => i.path === '/agile')) {
    permissionExpandedMenuItems.push({ text: 'IT-проекты', icon: <RocketLaunch />, path: '/agile' });
  }
  const baseVisibleMenuItems = canAccessOwnerWorkspace
    ? permissionExpandedMenuItems
    : permissionExpandedMenuItems.filter((item) => !item.path.startsWith('/owner-workspace') && item.path !== '/disk');
  const visibleMenuItems = isPwaNavigation
    ? baseVisibleMenuItems.filter((item) => pwaAllowedRoutes?.has(item.path))
    : baseVisibleMenuItems;

  /** Подсветка «Таск трекер» для любого `/owner-workspace/*`, кроме отдельных пунктов уведомлений и контрагентов. */
  const isOwnerWorkspaceMainSection = (pathname: string) =>
    pathname.startsWith('/owner-workspace') &&
    !pathname.startsWith('/owner-workspace/counterparties');

  const isDrawerItemSelected = (itemPath: string) => {
    if (itemPath === '/owner-workspace/counterparties') return location.pathname === '/owner-workspace/counterparties';
    if (itemPath === '/owner-workspace/projects') return isOwnerWorkspaceMainSection(location.pathname);
    return location.pathname === itemPath;
  };

  const appBarPageTitle =
    effectiveMenuItems.find((item) => item.path === location.pathname)?.text ??
    (location.pathname.startsWith('/owner-workspace/counterparties') ? 'Контрагенты' : null) ??
    (isOwnerWorkspaceMainSection(location.pathname) ? 'Таск трекер' : null) ??
    (location.pathname.startsWith('/agile') ? 'IT-проекты' : null) ??
    'Портал управления обучением';

  // Группируем видимые пункты меню
  const contentChildren = React.useMemo(() => {
    if (isPwaNavigation) return children;
    return removeDuplicateContentTitle(children, appBarPageTitle, { current: false });
  }, [appBarPageTitle, children, isPwaNavigation]);

  const allGroupedPaths = new Set(NAV_GROUPS.flatMap(g => [...g.paths]));
  const grouped = NAV_GROUPS.map(g => {
    const pathOrder = new Map([...g.paths].map((path, index) => [path, index]));
    return {
      ...g,
      items: visibleMenuItems
        .filter(item => g.paths.has(item.path))
        .sort((a, b) => (pathOrder.get(a.path) ?? 0) - (pathOrder.get(b.path) ?? 0)),
    };
  }).filter(g => g.items.length > 0);
  const standalone = visibleMenuItems.filter(item => !allGroupedPaths.has(item.path));
  const pwaBottomItems = visibleMenuItems.slice(0, 5);

  React.useLayoutEffect(() => {
    requestAnimationFrame(() => restoreSidebarScroll());
    const timer = window.setTimeout(() => restoreSidebarScroll(), 180);
    return () => window.clearTimeout(timer);
  }, [location.pathname, grouped.length, standalone.length, restoreSidebarScroll]);

  const navItem = (item: { text: string; icon: React.ReactNode; path: string }, indent = false) => {
    const selected = isDrawerItemSelected(item.path);
    return (
      <Tooltip key={item.text} title={sidebarCollapsed ? item.text : ''} placement="right" arrow>
        <ListItemButton
          selected={selected}
          onClick={(event) => {
            const scrollNode = event.currentTarget.closest('[data-sidebar-scroll]') as HTMLElement | null;
            saveSidebarScroll(scrollNode);
            navigate(isPwaNavigation ? `${item.path}?pwa=1` : item.path);
            setMobileOpen(false);
          }}
          sx={{
            mx: 0.5, mb: 0.2, borderRadius: 1.5, py: 0.65,
            pl: sidebarCollapsed ? 0 : indent ? 2.5 : 1.5,
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            color: selected ? SIDEBAR_TEXT_SEL : SIDEBAR_TEXT,
            bgcolor: selected ? SIDEBAR_ITEM_SEL : 'transparent',
            '&:hover': { bgcolor: selected ? SIDEBAR_ITEM_SEL : SIDEBAR_ITEM_HO },
            '&.Mui-selected': { bgcolor: SIDEBAR_ITEM_SEL, '&:hover': { bgcolor: SIDEBAR_ITEM_SEL } },
          }}
        >
          <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 34, color: selected ? SIDEBAR_ICON_SEL : SIDEBAR_ICON, justifyContent: 'center' }}>
            {item.icon}
          </ListItemIcon>
          {!sidebarCollapsed && (
            <ListItemText
              primary={item.text}
              primaryTypographyProps={{ fontSize: '0.84rem', fontWeight: selected ? 600 : 500, color: selected ? SIDEBAR_TEXT_SEL : SIDEBAR_TEXT }}
            />
          )}
        </ListItemButton>
      </Tooltip>
    );
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Brand header */}
      <Toolbar sx={{ px: sidebarCollapsed ? 1 : 2, minHeight: '56px !important', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
        {sidebarCollapsed ? (
          <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg, #7F23CC 0%, #AB67E5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
            🎓
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {logoUrl ? (
              <Box component="img" src={logoUrl} alt="Логотип" sx={{ width: 30, height: 30, borderRadius: 1.5, objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <Box sx={{ width: 30, height: 30, borderRadius: 1.5, flexShrink: 0, background: 'linear-gradient(135deg, #7F23CC 0%, #AB67E5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                🎓
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.82rem', color: SIDEBAR_TEXT, letterSpacing: -0.1, lineHeight: 1.3 }}>
                Learning Portal
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.67rem', color: SIDEBAR_TEXT_DIM, lineHeight: 1.2 }}>
                Управление обучением
              </Typography>
            </Box>
          </Box>
        )}
      </Toolbar>

      <Box sx={{ mx: 1, height: '1px', bgcolor: SIDEBAR_BORDER, flexShrink: 0 }} />

      {/* Nav list */}
      <List
        ref={handleNavScrollRef}
        data-sidebar-scroll
        onScroll={(event) => saveSidebarScroll(event.currentTarget)}
        sx={{ flex: 1, overflow: 'auto', py: 0.5, px: 0.25,
        '&::-webkit-scrollbar': { width: 3 },
        '&::-webkit-scrollbar-thumb': { bgcolor: SIDEBAR_BORDER, borderRadius: 4 },
      }}
      >
        {/* Standalone items (guest, parent) */}
        {standalone.map(item => navItem(item))}

        {/* Grouped items */}
        {grouped.map(g => (
          <Box key={g.id}>
            {/* Group header */}
            {!sidebarCollapsed ? (
              <ListItemButton
                onClick={(event) => {
                  const scrollNode = event.currentTarget.closest('[data-sidebar-scroll]') as HTMLElement | null;
                  saveSidebarScroll(scrollNode);
                  toggleGroup(g.id);
                }}
                sx={{ py: 0.4, px: 1.5, mb: 0.25, borderRadius: 1.5,
                  '&:hover': { bgcolor: SIDEBAR_ITEM_HO },
                }}
              >
                <ListItemText
                  primary={g.label}
                  primaryTypographyProps={{ fontSize: '0.68rem', fontWeight: 700, color: SIDEBAR_TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                />
                {isGroupOpen(g.id)
                  ? <ExpandLess sx={{ fontSize: 14, color: SIDEBAR_TEXT_DIM }} />
                  : <ExpandMore sx={{ fontSize: 14, color: SIDEBAR_TEXT_DIM }} />}
              </ListItemButton>
            ) : (
              <Box sx={{ mx: 1, my: 0.75, height: '1px', bgcolor: SIDEBAR_BORDER }} />
            )}

            <Collapse in={sidebarCollapsed || isGroupOpen(g.id)} timeout={160} unmountOnExit>
              {g.items.map(item => navItem(item, !sidebarCollapsed))}
            </Collapse>
          </Box>
        ))}
      </List>

      <Box sx={{ mx: 1, height: '1px', bgcolor: SIDEBAR_BORDER }} />

      {/* Collapse toggle */}
      <Box sx={{ display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-end', px: 1, py: 0.75 }}>
        <Tooltip title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'} placement="right">
          <IconButton onClick={toggleSidebar} size="small"
            sx={{ color: SIDEBAR_TEXT_DIM, '&:hover': { bgcolor: SIDEBAR_ITEM_HO, color: SIDEBAR_TEXT } }}
          >
            {sidebarCollapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        bgcolor: 'background.default',
        minHeight: '100vh',
        pb: isPwaNavigation ? 'calc(72px + env(safe-area-inset-bottom))' : 0,
      }}
    >
      <AppBar
        position="fixed"
        sx={{
          width: isPwaNavigation ? '100%' : { sm: `calc(100% - ${drawerWidth}px)` },
          ml: isPwaNavigation ? 0 : { sm: `${drawerWidth}px` },
          transition: 'width 200ms ease, margin 200ms ease',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: isPwaNavigation ? 'none' : { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ flexGrow: 1, fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}
          >
            {appBarPageTitle}
          </Typography>
          {role === 'sales' && canAccessSalesModule && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(127,35,204,0.07)',
                  border: '1px solid rgba(127,35,204,0.14)',
                }}
              >
                <Search fontSize="small" sx={{ color: 'text.secondary' }} />
                <InputBase
                  placeholder="Поиск лидов..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      navigate(`/sales/leads?q=${encodeURIComponent(salesSearch.trim())}`);
                    }
                  }}
                  sx={{ ml: 1, color: 'text.primary', minWidth: 180, fontSize: '0.875rem' }}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.full_name}
            </Typography>
            <IconButton onClick={handleMenuClick} size="small">
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  background: 'linear-gradient(135deg, #7F23CC 0%, #AB67E5 100%)',
                  fontSize: '0.875rem',
                  fontWeight: 700,
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
        sx={{
          display: isPwaNavigation ? 'none' : 'block',
          width: { sm: drawerWidth },
          flexShrink: { sm: 0 },
          transition: 'width 200ms ease',
        }}
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
              transition: 'width 200ms ease',
              overflowX: 'hidden',
              bgcolor: SIDEBAR_BG,
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
              transition: 'width 200ms ease',
              overflowX: 'hidden',
              bgcolor: SIDEBAR_BG,
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
          p: isPwaNavigation ? { xs: 1.5, sm: 2 } : { xs: 2, sm: 3 },
          pb: isPwaNavigation ? 'calc(96px + env(safe-area-inset-bottom))' : undefined,
          width: isPwaNavigation ? '100%' : { sm: `calc(100% - ${drawerWidth}px)` },
          transition: 'width 200ms ease',
        }}
      >
        <Toolbar />
        <Box sx={{ width: '100%', minWidth: 0 }}>{contentChildren}</Box>
      </Box>

      {isPwaNavigation && pwaBottomItems.length > 0 && (
        <BottomNavigation
          showLabels
          value={pwaBottomItems.findIndex((item) => isDrawerItemSelected(item.path))}
          onChange={(_event, index) => {
            const item = pwaBottomItems[index];
            if (item) navigate(`${item.path}?pwa=1`);
          }}
          sx={{
            position: 'fixed',
            left: { xs: 10, sm: '50%' },
            right: { xs: 10, sm: 'auto' },
            bottom: 'calc(10px + env(safe-area-inset-bottom))',
            transform: { xs: 'none', sm: 'translateX(-50%)' },
            width: { xs: 'auto', sm: 520 },
            zIndex: (theme) => theme.zIndex.appBar,
            height: 66,
            border: '1px solid rgba(15, 23, 42, 0.10)',
            borderRadius: 4,
            bgcolor: 'rgba(255, 255, 255, 0.94)',
            boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
            backdropFilter: 'saturate(180%) blur(18px)',
            overflow: 'hidden',
            '& .MuiBottomNavigationAction-root': {
              minWidth: 0,
              px: 0.25,
              color: 'text.secondary',
              borderRadius: 3,
              mx: 0.25,
              my: 0.75,
              transition: 'background-color 160ms ease, color 160ms ease',
            },
            '& .Mui-selected': {
              color: 'primary.main',
              bgcolor: 'rgba(127, 35, 204, 0.10)',
            },
            '& .MuiBottomNavigationAction-label': {
              mt: 0.25,
              fontSize: '0.66rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            },
          }}
        >
          {pwaBottomItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={item.text}
              icon={item.icon}
              aria-label={item.text}
            />
          ))}
        </BottomNavigation>
      )}

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

