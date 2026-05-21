import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { ownerDashboardApi } from '../services/api';
import { hasPermission, getEffectiveRole } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';
import { ReportsPageContent } from './ReportsPage';
import { FinancialModelContent } from './FinancialModelPage';
import OperationalReportsTab from './OperationalReportsTab';

const MetricCard: React.FC<{
  title: string;
  value: React.ReactNode;
  subtitle?: string;
}> = ({ title, value, subtitle }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h4" sx={{ mt: 1 }}>
        {value}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {subtitle}
        </Typography>
      ) : null}
    </CardContent>
  </Card>
);

const TrendPanel: React.FC<{
  title: string;
  color: string;
  data: Array<{ label: string; value: number }>;
  valueFormatter?: (value: number) => string;
}> = ({ title, color, data, valueFormatter }) => (
  <Paper variant="outlined" sx={{ p: 2, height: 280 }}>
    <Typography variant="h6" gutterBottom>
      {title}
    </Typography>
    <Box sx={{ height: 210 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={56} />
          <Tooltip formatter={(value: number) => (valueFormatter ? valueFormatter(Number(value)) : Number(value))} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  </Paper>
);

const DashboardOwnerTabs: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<'overview' | 'characteristics' | 'financialModel' | 'operational'>('overview');
  const canAccessOwnerMetrics = hasPermission(user, 'owner_dashboard.access');

  const summaryQuery = useQuery({
    queryKey: ['owner-dashboard', 'summary'],
    queryFn: () => ownerDashboardApi.getSummary(),
    enabled: tab === 'overview' && canAccessOwnerMetrics,
  });

  return (
    <Box>
      <Tabs value={tab} onChange={(_, nextTab) => setTab(nextTab)} sx={{ mb: 2 }}>
        <Tab value="overview" label="Главная" />
        <Tab value="characteristics" label="Характеристики" />
        <Tab value="financialModel" label="Финансовая модель" />
        <Tab value="operational" label="Операционные отчёты" />
      </Tabs>

      {tab === 'overview' && (
        <Box>
          {!canAccessOwnerMetrics ? (
            <Alert severity="info">
              Для просмотра owner dashboard нужен permission <code>owner_dashboard.access</code>.
            </Alert>
          ) : summaryQuery.isLoading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : summaryQuery.isError ? (
            <Alert severity="error">
              {extractApiError(summaryQuery.error, 'Не удалось загрузить owner dashboard')}
            </Alert>
          ) : summaryQuery.data ? (
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <MetricCard
                  title="Активные ученики"
                  value={summaryQuery.data.active_students}
                  subtitle={`Групп: ${summaryQuery.data.active_groups}, тренеров: ${summaryQuery.data.active_trainers}`}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard
                  title="Лиды за месяц"
                  value={summaryQuery.data.new_leads_month}
                  subtitle={`Сегодня: ${summaryQuery.data.new_leads_today}, в работе: ${summaryQuery.data.active_pipeline_count}`}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard
                  title="Оплаты за месяц"
                  value={`${summaryQuery.data.payments_received_month.toLocaleString('ru-RU')} ₽`}
                  subtitle={`Транзакций: ${summaryQuery.data.payments_transactions_month}`}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard
                  title="Просрочки"
                  value={summaryQuery.data.overdue_payments_3_count}
                  subtitle={`10+ дней: ${summaryQuery.data.overdue_payments_10_count}`}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Выиграно лидов"
                  value={summaryQuery.data.won_leads_month}
                  subtitle={`Регистраций на события: ${summaryQuery.data.registered_events_month}`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Owner workspace"
                  value={summaryQuery.data.owner_workspace_overdue_tasks}
                  subtitle={`Ожидают: ${summaryQuery.data.owner_workspace_waiting_tasks}, закрыто за 7 дней: ${summaryQuery.data.owner_workspace_completed_7_days}`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Отработки"
                  value={summaryQuery.data.makeups_pending_total}
                  subtitle={`Ждут родителя: ${summaryQuery.data.makeups_waiting_parent}, назначено: ${summaryQuery.data.makeups_assigned}`}
                />
              </Grid>

              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    AI-инсайты
                  </Typography>
                  {summaryQuery.data.ai_insights.map((item, index) => (
                    <Box key={`${item.kind}-${index}`} sx={{ mb: index === summaryQuery.data.ai_insights.length - 1 ? 0 : 1.5 }}>
                      <Typography
                        variant="subtitle2"
                        color={item.severity === 'warning' ? 'warning.main' : item.severity === 'critical' ? 'error.main' : 'text.primary'}
                      >
                        {item.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.summary}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <TrendPanel title="Лиды за 14 дней" color="#0f766e" data={summaryQuery.data.leads_last_14_days} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TrendPanel
                  title="Оплаты за 14 дней"
                  color="#b45309"
                  data={summaryQuery.data.payments_last_14_days}
                  valueFormatter={(value) => `${value.toLocaleString('ru-RU')} ₽`}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Операционный фокус
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Активных sales-менеджеров: {summaryQuery.data.active_sales_managers}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Закрыто задач owner workspace за 30 дней: {summaryQuery.data.owner_workspace_completed_30_days}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Средний цикл закрытия задачи: {summaryQuery.data.owner_workspace_avg_days_to_complete_30 ?? '—'} дн.
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Срез месяца {summaryQuery.data.month_label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Дашборд собран из sales, payment status, owner workspace и workflow отработок.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Время генерации: {new Date(summaryQuery.data.generated_at).toLocaleString('ru-RU')}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          ) : null}
        </Box>
      )}

      {tab === 'characteristics' && (
        <Box sx={{ mt: 1 }}>
          <ReportsPageContent />
        </Box>
      )}

      {tab === 'financialModel' && (
        <Box sx={{ mt: 1 }}>
          <FinancialModelContent />
        </Box>
      )}

      {tab === 'operational' && (
        <Box sx={{ mt: 1 }}>
          <OperationalReportsTab />
        </Box>
      )}
    </Box>
  );
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const isOwnerLike = effectiveRole === 'owner' || effectiveRole === 'admin';

  const roleLabel =
    effectiveRole === 'admin'
      ? 'Администратор'
      : effectiveRole === 'owner'
      ? 'Владелец'
      : effectiveRole === 'trainer'
      ? 'Тренер'
      : effectiveRole === 'parent'
      ? 'Родитель'
      : effectiveRole === 'sales'
      ? 'Sales менеджер'
      : 'Гость';

  return (
    <Layout>
      <Box>
        <Typography variant="h4" gutterBottom>
          Добро пожаловать, {user?.full_name}!
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Роль: {roleLabel}
        </Typography>

        {isOwnerLike ? (
          <DashboardOwnerTabs />
        ) : (
          <Grid container spacing={3} sx={{ mt: 2 }}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6">Быстрый доступ</Typography>
                <Typography variant="body2" color="text.secondary">
                  Используйте меню слева для перехода по разделам системы.
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
