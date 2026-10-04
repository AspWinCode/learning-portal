import React, { createContext, useContext } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';

interface TabDef {
  label: string;
  path: string;
  visible: boolean;
}

// Когда страница встроена в общую LEGO-страницу владельца, оболочка не рисует Layout и вкладки.
export const LegoEmbeddedContext = createContext(false);

interface LegoShellProps {
  title: string;
  children: React.ReactNode;
  tabs?: boolean;
}

// Вкладки только для UX. Права проверяются на бэкенде (lego.* в /api/v1/lego).
export const LegoShell: React.FC<LegoShellProps> = ({ title, children, tabs = true }) => {
  const embedded = useContext(LegoEmbeddedContext);
  const { user } = useAuth();
  const location = useLocation();
  const canMoney = hasPermission(user, 'lego.payments_manage');

  if (embedded) {
    return (
      <Box component="section" sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        {children}
      </Box>
    );
  }

  const tabDefs: TabDef[] = [
    { label: 'Сегодня', path: '/lego', visible: true },
    { label: 'Дети', path: '/lego/students', visible: true },
    { label: 'Группы', path: '/lego/groups', visible: true },
    { label: 'Занятия', path: '/lego/lessons', visible: true },
    { label: 'Долги', path: '/lego/debts', visible: true },
    { label: 'Оплаты', path: '/lego/payments', visible: canMoney },
  ].filter((t) => t.visible);

  const activeIndex = Math.max(
    0,
    tabDefs.findIndex((t) => (t.path === '/lego' ? location.pathname === '/lego' : location.pathname.startsWith(t.path))),
  );

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
        <Typography variant="overline" color="text.secondary">
          LEGO — Ленинец
        </Typography>
        <Typography variant="h5" gutterBottom>
          {title}
        </Typography>
        {tabs && (
          <Tabs value={activeIndex} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            {tabDefs.map((t) => (
              <Tab key={t.path} label={t.label} component={RouterLink} to={t.path} />
            ))}
          </Tabs>
        )}
        {children}
      </Box>
    </Layout>
  );
};

export default LegoShell;
