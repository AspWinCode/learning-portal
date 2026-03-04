import React from 'react';
import Layout from '../components/Layout';
import { Typography, Box, Grid, Paper, Tabs, Tab } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import ReportsPage from './ReportsPage';
import FinancialModelPage from './FinancialModelPage';

const DashboardOwnerTabs: React.FC = () => {
  const [tab, setTab] = React.useState<'overview' | 'characteristics' | 'financialModel'>('overview');

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2 }}
      >
        <Tab value="overview" label="Главная" />
        <Tab value="characteristics" label="Отчётность по характеристикам" />
        <Tab value="financialModel" label="Финансовая модель" />
      </Tabs>

      {tab === 'overview' && (
        <Box>
          <Typography variant="h5" gutterBottom>
            Сводка
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Выберите вкладку, чтобы открыть отчётность по характеристикам или финансовую модель академии.
          </Typography>
        </Box>
      )}

      {tab === 'characteristics' && (
        // Используем страницу отчётов, но основная вкладка в ней — "Характеристики"
        <Box sx={{ mt: 1 }}>
          <ReportsPage />
        </Box>
      )}

      {tab === 'financialModel' && (
        <Box sx={{ mt: 1 }}>
          <FinancialModelPage />
        </Box>
      )}
    </Box>
  );
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <Layout>
      <Box>
        <Typography variant="h4" gutterBottom>
          Добро пожаловать, {user?.full_name}!
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Роль: {user?.role === 'admin'
            ? 'Администратор'
            : user?.role === 'owner'
            ? 'Владелец'
            : user?.role === 'trainer'
            ? 'Тренер'
            : user?.role === 'parent'
            ? 'Родитель'
            : user?.role === 'sales'
            ? 'Sales менеджер'
            : 'Гость'}
        </Typography>

        {isOwner ? (
          <DashboardOwnerTabs />
        ) : (
          <Grid container spacing={3} sx={{ mt: 2 }}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6">Быстрый доступ</Typography>
                <Typography variant="body2" color="text.secondary">
                  Используйте меню для навигации по разделам системы
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>
    </Layout>
  );
};

export default DashboardPage;

