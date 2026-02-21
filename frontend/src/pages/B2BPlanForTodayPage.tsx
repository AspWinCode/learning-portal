import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Event from '@mui/icons-material/Event';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool } from '../types';

const Section: React.FC<{
  id?: string;
  title: string;
  schools: B2BSchool[];
  onOpenSchool: (id: number) => void;
  onReschedule?: (school: B2BSchool) => void;
  onClose?: (school: B2BSchool) => void;
  closingSchoolId?: number | null;
}> = ({ id, title, schools, onOpenSchool, onReschedule, onClose, closingSchoolId }) => (
  <Box id={id}>
    <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ mb: 1 }}>
      {title} ({schools.length})
    </Typography>
    {schools.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        Нет школ
      </Typography>
    ) : (
      <Stack spacing={0.5}>
        {schools.map((s) => (
          <Card key={s.id} variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => onOpenSchool(s.id)}>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {s.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.city ?? '—'} · {s.pipeline_stage}
                    {s.next_step && ` · ${s.next_step}`}
                    {s.next_step_date && ` (${format(parseISO(s.next_step_date), 'd MMM', { locale: ru })})`}
                    {s.manager_full_name && ` · ${s.manager_full_name}`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  {onClose && (s.next_step || s.next_step_date) && (
                    <Button
                      size="small"
                      color="primary"
                      variant="outlined"
                      disabled={closingSchoolId === s.id}
                      onClick={(e) => { e.stopPropagation(); onClose(s); }}
                    >
                      {closingSchoolId === s.id ? '…' : 'Закрыть'}
                    </Button>
                  )}
                  {onReschedule && (
                    <Button size="small" startIcon={<Event />} onClick={(e) => { e.stopPropagation(); onReschedule(s); }}>
                      Перенести
                    </Button>
                  )}
                  <Button size="small" startIcon={<OpenInNew />} onClick={(e) => { e.stopPropagation(); onOpenSchool(s.id); }}>
                    Карточка
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    )}
  </Box>
);

const B2BPlanForTodayPage: React.FC = () => {
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [data, setData] = useState<{
    overdue: B2BSchool[];
    no_next_step: B2BSchool[];
    find_contacts_stale: B2BSchool[];
    find_contacts_no_contacts_48h: B2BSchool[];
    today: B2BSchool[];
    tomorrow: B2BSchool[];
    week: B2BSchool[];
    no_contacts: B2BSchool[];
    no_touches_7d: B2BSchool[];
    event_done_no_leads: B2BSchool[];
    event_done_no_leads_24_48h: B2BSchool[];
    negotiations_14d: B2BSchool[];
  } | null>(null);
  const [citySummary, setCitySummary] = useState<{
    city: string;
    schools_in_work: number;
    overdue: number;
    events_this_week: number;
    leads_7d: number;
    partners: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleSchool, setRescheduleSchool] = useState<B2BSchool | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ next_step: '', next_step_date: '' });
  const [closingSchoolId, setClosingSchoolId] = useState<number | null>(null);

  const loadCities = useCallback(async () => {
    try {
      const list = await b2bApi.listCities();
      setCities(list);
    } catch {
      setCities([]);
    }
  }, []);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, summaryRes] = await Promise.all([
        b2bApi.planForToday(selectedCity || undefined),
        b2bApi.planCitySummary(),
      ]);
      setData(planRes);
      setCitySummary(summaryRes);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить план'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const onOpenSchool = (id: number) => {
    window.open(`/b2b-schools?open=${id}`, '_blank');
  };

  const handleRescheduleOpen = (school: B2BSchool) => {
    setRescheduleSchool(school);
    setRescheduleForm({
      next_step: school.next_step ?? '',
      next_step_date: school.next_step_date ? format(parseISO(school.next_step_date), 'yyyy-MM-dd') : '',
    });
  };

  const handleRescheduleSave = async () => {
    if (!rescheduleSchool) return;
    setError(null);
    try {
      await b2bApi.updateSchool(rescheduleSchool.id, {
        next_step: rescheduleForm.next_step.trim() || null,
        next_step_date: rescheduleForm.next_step_date.trim() || null,
      });
      setRescheduleSchool(null);
      await loadPlan();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось перенести'));
    }
  };

  const handleClose = async (school: B2BSchool) => {
    setError(null);
    setClosingSchoolId(school.id);
    try {
      await b2bApi.updateSchool(school.id, { next_step: null, next_step_date: null });
      await loadPlan();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось закрыть'));
    } finally {
      setClosingSchoolId(null);
    }
  };

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h5">План на сегодня</Typography>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Город / регион</InputLabel>
          <Select
            value={selectedCity}
            label="Город / регион"
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            <MenuItem value="">Все</MenuItem>
            {cities.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : data ? (
          <Stack spacing={3}>
            {citySummary.length > 0 && (
              <Card variant="outlined" sx={{ overflow: 'auto' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ mb: 1 }}>
                    Сводка по городам
                  </Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { px: 1.5, py: 0.5, textAlign: 'left', borderBottom: '1px solid', borderColor: 'divider' } }}>
                    <thead>
                      <tr>
                        <th>Город</th>
                        <th>В работе</th>
                        <th>Просрочек</th>
                        <th>Меропр. на неделе</th>
                        <th>Лидов за 7 дн</th>
                        <th>Партнёров</th>
                      </tr>
                    </thead>
                    <tbody>
                      {citySummary.map((row) => (
                        <tr key={row.city}>
                          <td>{row.city}</td>
                          <td>{row.schools_in_work}</td>
                          <td>{row.overdue}</td>
                          <td>{row.events_this_week}</td>
                          <td>{row.leads_7d}</td>
                          <td>{row.partners}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </CardContent>
              </Card>
            )}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                Риски процесса
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Chip
                  label={`Без след. действия: ${data.no_next_step.length}`}
                  color={data.no_next_step.length > 0 ? 'warning' : 'default'}
                  onClick={() => document.getElementById('section-no-next')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: data.no_next_step.length > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Просрочено: ${data.overdue.length}`}
                  color={data.overdue.length > 0 ? 'error' : 'default'}
                  onClick={() => document.getElementById('section-overdue')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: data.overdue.length > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Найти контакты >3 дн: ${data.find_contacts_stale.length}`}
                  color={data.find_contacts_stale.length > 0 ? 'warning' : 'default'}
                  onClick={() => document.getElementById('section-find-contacts')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: data.find_contacts_stale.length > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Без контактов 48ч: ${data.find_contacts_no_contacts_48h?.length ?? 0}`}
                  color={data.find_contacts_no_contacts_48h?.length ? 'error' : 'default'}
                  onClick={() => document.getElementById('section-no-contacts-48h')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: data.find_contacts_no_contacts_48h?.length ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Сегодня: ${data.today.length}`}
                  color="primary"
                  variant={data.today.length > 0 ? 'filled' : 'outlined'}
                  onClick={() => document.getElementById('section-today')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label={`Завтра: ${data.tomorrow.length}`}
                  color="primary"
                  variant={data.tomorrow.length > 0 ? 'filled' : 'outlined'}
                  onClick={() => document.getElementById('section-tomorrow')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label={`На неделе: ${data.week.length}`}
                  color="primary"
                  variant={data.week.length > 0 ? 'filled' : 'outlined'}
                  onClick={() => document.getElementById('section-week')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label={`Без контактов: ${data.no_contacts?.length ?? 0}`}
                  color={data.no_contacts?.length ? 'warning' : 'default'}
                  onClick={() => document.getElementById('section-no-contacts')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: (data.no_contacts?.length ?? 0) > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Нет касаний 7 дн: ${data.no_touches_7d?.length ?? 0}`}
                  color={data.no_touches_7d?.length ? 'warning' : 'default'}
                  onClick={() => document.getElementById('section-no-touches')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: (data.no_touches_7d?.length ?? 0) > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Проведено без лидов: ${data.event_done_no_leads?.length ?? 0}`}
                  color={data.event_done_no_leads?.length ? 'error' : 'default'}
                  onClick={() => document.getElementById('section-event-no-leads')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: (data.event_done_no_leads?.length ?? 0) > 0 ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Проведено без лидов 24–48ч: ${data.event_done_no_leads_24_48h?.length ?? 0}`}
                  color={data.event_done_no_leads_24_48h?.length ? 'error' : 'default'}
                  onClick={() => document.getElementById('section-event-no-leads-24-48h')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: data.event_done_no_leads_24_48h?.length ? 'pointer' : 'default' }}
                />
                <Chip
                  label={`Переговоры 14+ дн: ${data.negotiations_14d?.length ?? 0}`}
                  color={data.negotiations_14d?.length ? 'warning' : 'default'}
                  onClick={() => document.getElementById('section-negotiations-14')?.scrollIntoView({ behavior: 'smooth' })}
                  sx={{ cursor: (data.negotiations_14d?.length ?? 0) > 0 ? 'pointer' : 'default' }}
                />
              </Stack>
            </Box>
            <Section id="section-overdue" title="Просроченные следующие действия" schools={data.overdue} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-no-next" title="Школы без следующего шага" schools={data.no_next_step} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-find-contacts" title="Школы в статусе «Найти контакты» больше 3 дней" schools={data.find_contacts_stale} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-no-contacts-48h" title="Без контактов 48ч (find_contacts)" schools={data.find_contacts_no_contacts_48h ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-today" title="Сегодня: дожим / перезвонить" schools={data.today} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-tomorrow" title="Завтра" schools={data.tomorrow} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-week" title="На неделе" schools={data.week} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-no-contacts" title="Школы без контактов" schools={data.no_contacts ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-no-touches" title="Нет касаний 7 дней (переговоры/подготовка)" schools={data.no_touches_7d ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-event-no-leads" title="Мероприятие проведено, лидов нет" schools={data.event_done_no_leads ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-event-no-leads-24-48h" title="Проведено без лидов 24–48ч" schools={data.event_done_no_leads_24_48h ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
            <Section id="section-negotiations-14" title="Переговоры 14+ дней (ревью)" schools={data.negotiations_14d ?? []} onOpenSchool={onOpenSchool} onReschedule={handleRescheduleOpen} onClose={handleClose} closingSchoolId={closingSchoolId} />
          </Stack>
        ) : null}

      <Dialog open={!!rescheduleSchool} onClose={() => setRescheduleSchool(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Перенести</DialogTitle>
        <DialogContent>
          {rescheduleSchool && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">{rescheduleSchool.name}</Typography>
              <TextField
                label="Следующее действие"
                value={rescheduleForm.next_step}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, next_step: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label="Дата"
                type="date"
                value={rescheduleForm.next_step_date}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, next_step_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduleSchool(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleRescheduleSave()}>Сохранить</Button>
        </DialogActions>
      </Dialog>
      </Stack>
    </Layout>
  );
};

export default B2BPlanForTodayPage;
