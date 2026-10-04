import React from 'react';
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

// Вкладки только для UX. Права проверяются на бэкенде (lego.* в /api/v1/lego).
export const LegoShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const canMoney = hasPermission(user, 'lego.payments_manage');

  const tabs: TabDef[] = [
    { label: 'Сегодня', path: '/lego', visible: true },
    { label: 'Дети', path: '/lego/students', visible: true },
    { label: 'Группы', path: '/lego/groups', visible: true },
    { label: 'Занятия', path: '/lego/lessons', visible: true },
    { label: 'Долги', path: '/lego/debts', visible: true },
    { label: 'Оплаты', path: '/lego/payments', visible: canMoney },
  ].filter((t) => t.visible);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => (t.path === '/lego' ? location.pathname === '/lego' : location.pathname.startsWith(t.path))),
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
        <Tabs value={activeIndex} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          {tabs.map((t) => (
            <Tab key={t.path} label={t.label} component={RouterLink} to={t.path} />
          ))}
        </Tabs>
        {children}
      </Box>
    </Layout>
  );
};

export default LegoShell;
