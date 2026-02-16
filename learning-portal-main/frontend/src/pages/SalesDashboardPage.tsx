import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { SalesDashboardData, SalesQueueRegistrationItem, SalesQueueTaskItem } from '../types';
import { extractApiError } from '../utils/extractApiError';

const SalesDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const d = await salesApi.getSalesDashboard();
      setData(d);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить dashboard'));
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const getDueTone = (dueAt?: string | null) => {
    if (!dueAt) return { label: 'Новое', color: 'info' as const };
    const d = parseISO(dueAt);
    if (!isValid(d)) return { label: 'Новое', color: 'info' as const };
    const now = new Date();
    if (d.getTime() < now.getTime()) return { label: 'Просрочено', color: 'error' as const };
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return { label: 'Сегодня', color: 'warning' as const };
    return { label: 'План', color: 'default' as const };
  };

  const cleanNote = (note?: string | null) => {
    if (!note) return 'Без комментария';
    // Удаляем служебные префиксы типа [auto_attended_offer] и т.д.
    return note.replace(/^\[auto_[^\]]+\]\s*/, '').trim() || 'Без комментария';
  };

  const renderTaskList = (title: string, items: SalesQueueTaskItem[], accent: string) => (
    <Card variant="outlined" sx={{ borderTop: `3px solid ${accent}` }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <List dense>
          {items.map((item) => (
            <ListItem
              key={item.task_id}
              secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => navigate('/sales/follow-ups?period=today')}>написать</Button>
                  <Button size="small" onClick={() => navigate('/sales/follow-ups?period=today')}>позвонить</Button>
                  <Button size="small" onClick={() => navigate(`/sales/leads?leadId=${item.lead_id}`)}>карточка</Button>
                </Stack>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pr: 28 }}>
                    <Chip
                      size="small"
                      label={getDueTone(item.due_at).label}
                      color={getDueTone(item.due_at).color}
                    />
                    <Typography component="span" variant="body2">
                      {item.lead_name} ({item.lead_phone})
                    </Typography>
                  </Box>
                }
                secondary={
                  `${cleanNote(item.note)}${
                    item.due_at
                      ? ` • ${(() => {
                          const d = parseISO(item.due_at as string);
                          return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : item.due_at;
                        })()}`
                      : ''
                  }`
                }
              />
            </ListItem>
          ))}
          {items.length === 0 && (
            <ListItem>
              <ListItemText primary="Пусто" />
            </ListItem>
          )}
        </List>
      </CardContent>
    </Card>
  );

  const renderRegList = (title: string, items: SalesQueueRegistrationItem[], accent: string) => (
    <Card variant="outlined" sx={{ borderTop: `3px solid ${accent}` }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <List dense>
          {items.map((item) => (
            <ListItem
              key={item.registration_id}
              secondaryAction={
                <Button size="small" onClick={() => navigate('/sales/events')}>
                  В мероприятия
                </Button>
              }
            >
              <ListItemText
                primary={`${item.lead_name} • ${item.event_title}`}
                secondary={`${(() => {
                  const d = parseISO(item.starts_at);
                  return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : item.starts_at;
                })()}${item.note ? ` • ${item.note}` : ''}`}
              />
            </ListItem>
          ))}
          {items.length === 0 && (
            <ListItem>
              <ListItemText primary="Пусто" />
            </ListItem>
          )}
        </List>
      </CardContent>
    </Card>
  );

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Панель продаж</Typography>
        <Button variant="outlined" onClick={loadDashboard}>Обновить</Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {data && (
        <>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/leads?status=new')}><CardContent><Typography variant="caption">Новых лидов</Typography><Typography variant="h5">{data.kpi_new_leads}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/leads?status=contacted')}><CardContent><Typography variant="caption">Дозвон % (7д)</Typography><Typography variant="h5">{data.kpi_dozvon_percent}%</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/leads?status=invoice_sent')}><CardContent><Typography variant="caption">Инфо отправлено</Typography><Typography variant="h5">{data.kpi_info_sent}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/follow-ups?period=overdue')}><CardContent><Typography variant="caption">Дожим срочно</Typography><Typography variant="h5">{data.kpi_need_push_urgent}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/follow-ups?period=today')}><CardContent><Typography variant="caption">Дожим сегодня</Typography><Typography variant="h5">{data.kpi_need_push_today}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={2}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/follow-ups?period=overdue')}><CardContent><Typography variant="caption">Дожим просрочено</Typography><Typography variant="h5">{data.kpi_need_push_overdue}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/events')}><CardContent><Typography variant="caption">Записано на мероприятие</Typography><Typography variant="h5">{data.kpi_registered_event}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/events')}><CardContent><Typography variant="caption">Пришло</Typography><Typography variant="h5">{data.kpi_came_count}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/events')}><CardContent><Typography variant="caption">Неявка</Typography><Typography variant="h5">{data.kpi_no_show_count}</Typography></CardContent></Card></Grid>
          </Grid>

          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Обходы за текущий месяц</Typography>
              <Grid container spacing={1.5} sx={{ mb: 1 }}>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption">Школ обошли</Typography>
                      <Typography variant="h5">{data.outreach_schools_month}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption">Классов обошли</Typography>
                      <Typography variant="h5">{data.outreach_classes_month}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="caption">Времени (мин)</Typography>
                      <Typography variant="h5">{data.outreach_minutes_month}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Топ-3 школы по конверсии</Typography>
              <List dense>
                {data.top_schools_conversion_month.map((s) => (
                  <ListItem key={s.school_name} disablePadding>
                    <ListItemButton
                      onClick={() => navigate(`/sales/leads?q=${encodeURIComponent(s.school_name)}`)}
                    >
                      <ListItemText
                        primary={`${s.school_name} — ${s.conversion_percent}%`}
                        secondary={`Лидов: ${s.leads_count}, оплат: ${s.won_count}, классов: ${s.classes_count}, время: ${s.outreach_minutes_total} мин`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
                {data.top_schools_conversion_month.length === 0 && (
                  <ListItem>
                    <ListItemText primary="Пока нет данных по обходам за месяц" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              {renderTaskList('🔥 Просроченные follow-up', data.overdue_followups, '#ef4444')}
            </Grid>
            <Grid item xs={12} md={6}>
              {renderTaskList('📞 Перезвонить сегодня', data.call_today, '#f59e0b')}
            </Grid>
            <Grid item xs={12} md={6}>
              {renderTaskList('💬 Ответили в мессенджере', data.messenger_replies, '#3b82f6')}
            </Grid>
            <Grid item xs={12} md={6}>
              {renderRegList('🎟 Подтвердить участие', data.confirm_participation, '#10b981')}
            </Grid>
          </Grid>
        </>
      )}
    </Layout>
  );
};

export default SalesDashboardPage;
