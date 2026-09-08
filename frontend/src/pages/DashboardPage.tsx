import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import SchoolIcon from '@mui/icons-material/School';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import StarIcon from '@mui/icons-material/Star';
import DescriptionIcon from '@mui/icons-material/Description';
import BadgeIcon from '@mui/icons-material/Badge';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PaymentsIcon from '@mui/icons-material/Payments';
import { useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { adminDashboardApi, ownerDashboardApi } from '../services/api';
import { hasPermission, getEffectiveRole } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';
import { ReportsPageContent } from './ReportsPage';
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
  const [tab, setTab] = React.useState<'overview' | 'characteristics' | 'operational'>('overview');
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

      {tab === 'operational' && (
        <Box sx={{ mt: 1 }}>
          <OperationalReportsTab />
        </Box>
      )}
    </Box>
  );
};

const AdminStatCard: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({
  label,
  value,
  accent,
}) => (
  <Card variant="outlined" sx={{ height: '100%', borderColor: accent ? 'warning.main' : undefined }}>
    <CardContent sx={{ py: 1.5 }}>
      <Typography variant="h4">{value}</Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </CardContent>
  </Card>
);

const AdminSectionCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  badge?: number;
}> = ({ title, description, icon, to, badge }) => {
  const navigate = useNavigate();
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea sx={{ height: '100%', p: 0.5 }} onClick={() => navigate(to)}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {badge ? (
              <Box
                sx={{
                  ml: 'auto',
                  bgcolor: 'warning.main',
                  color: 'warning.contrastText',
                  borderRadius: 10,
                  px: 1,
                  fontSize: 12,
                  lineHeight: '20px',
                }}
              >
                {badge}
              </Box>
            ) : null}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

const AdminHome: React.FC = () => {
  const { user } = useAuth();
  const summaryQuery = useQuery({
    queryKey: ['admin-dashboard', 'summary'],
    queryFn: () => adminDashboardApi.getSummary(),
  });
  const s = summaryQuery.data;

  const sections: Array<{
    title: string;
    description: string;
    icon: React.ReactNode;
    to: string;
    permission: string;
    badge?: number;
  }> = [
    { title: 'Ученики', description: 'Карточки учеников, статусы, родители', icon: <SchoolIcon />, to: '/students', permission: 'students.access' },
    { title: 'Группы', description: 'Составы групп, расписание, тренеры', icon: <GroupsIcon />, to: '/groups', permission: 'groups.access' },
    { title: 'Уроки', description: 'Расписание и посещаемость занятий', icon: <MenuBookIcon />, to: '/lessons', permission: 'lessons.access' },
    { title: 'Программы', description: 'Учебные программы, модули, темы', icon: <MenuBookIcon />, to: '/programs', permission: 'programs.access' },
    { title: 'Оценки', description: 'Оценки по темам от преподавателей', icon: <StarIcon />, to: '/grades', permission: 'grades.access' },
    {
      title: 'Характеристики',
      description: 'Проверка и публикация характеристик',
      icon: <DescriptionIcon />,
      to: '/characteristics',
      permission: 'characteristics.access',
      badge: s?.characteristics_pending || undefined,
    },
    { title: 'Преподаватели', description: 'Профили и доступы преподавателей', icon: <BadgeIcon />, to: '/trainers', permission: 'users.access' },
    { title: 'Методисты', description: 'Профили методистов', icon: <BadgeIcon />, to: '/methodists', permission: 'users.access' },
    {
      title: 'Пропуски',
      description: 'Отработки: ждут родителя и назначения',
      icon: <EventBusyIcon />,
      to: '/operations/absences',
      permission: 'sales.access',
      badge: s?.makeups_pending || undefined,
    },
    {
      title: 'Задачи',
      description: 'Открытые задачи рабочего пространства',
      icon: <ChecklistIcon />,
      to: '/tasks',
      permission: 'tasks.access',
      badge: s?.open_tasks || undefined,
    },
    { title: 'Абонементы', description: 'Тарифы и абонементы', icon: <CardMembershipIcon />, to: '/abonements', permission: 'abonements.access' },
    { title: 'Оплаты', description: 'Статусы оплат и задолженности', icon: <PaymentsIcon />, to: '/finance/payments', permission: 'sales.access' },
    { title: 'Роли и доступы', description: 'Пользователи, роли, разрешения', icon: <AdminPanelSettingsIcon />, to: '/roles', permission: 'roles.access' },
  ];

  const visibleSections = sections.filter((section) => hasPermission(user, section.permission));

  return (
    <Box>
      {summaryQuery.isError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {extractApiError(summaryQuery.error, 'Не удалось загрузить сводку')}
        </Alert>
      ) : null}

      {s ? (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[
            { label: 'Активные ученики', value: s.active_students },
            { label: 'Активные группы', value: s.active_groups },
            { label: 'Преподаватели', value: s.active_trainers },
            { label: 'Методисты', value: s.active_methodists },
            { label: 'Программы', value: s.active_programs },
            { label: 'Абонементы', value: s.active_abonements },
            { label: 'Оценки за 7 дней', value: s.grades_last_7_days },
            { label: 'Характеристики на проверке', value: s.characteristics_pending, accent: s.characteristics_pending > 0 },
            { label: 'Отработки в работе', value: s.makeups_pending, accent: s.makeups_pending > 0 },
            { label: 'Открытые задачи', value: s.open_tasks, accent: s.open_tasks > 0 },
          ].map((stat) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={stat.label}>
              <AdminStatCard label={stat.label} value={stat.value} accent={stat.accent} />
            </Grid>
          ))}
        </Grid>
      ) : summaryQuery.isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : null}

      <Typography variant="h6" gutterBottom>
        Разделы
      </Typography>
      <Grid container spacing={2}>
        {visibleSections.map((section) => (
          <Grid item xs={12} sm={6} md={4} key={section.to}>
            <AdminSectionCard
              title={section.title}
              description={section.description}
              icon={section.icon}
              to={section.to}
              badge={section.badge}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

const AdminDashboardTabs: React.FC = () => {
  const [tab, setTab] = React.useState<'home' | 'characteristics' | 'operational'>('home');
  return (
    <Box>
      <Tabs value={tab} onChange={(_, nextTab) => setTab(nextTab)} sx={{ mb: 2 }}>
        <Tab value="home" label="Главная" />
        <Tab value="characteristics" label="Характеристики" />
        <Tab value="operational" label="Операционные отчёты" />
      </Tabs>
      {tab === 'home' && <AdminHome />}
      {tab === 'characteristics' && (
        <Box sx={{ mt: 1 }}>
          <ReportsPageContent />
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
  const isOwner = effectiveRole === 'owner';
  const isAdmin = effectiveRole === 'admin';

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

        {isOwner ? (
          <DashboardOwnerTabs />
        ) : isAdmin ? (
          <AdminDashboardTabs />
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
