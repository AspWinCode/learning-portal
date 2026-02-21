import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool } from '../types';

const Section: React.FC<{
  id?: string;
  title: string;
  schools: B2BSchool[];
  onOpenSchool: (id: number) => void;
}> = ({ id, title, schools, onOpenSchool }) => (
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
                <Button size="small" startIcon={<OpenInNew />} onClick={(e) => { e.stopPropagation(); onOpenSchool(s.id); }}>
                  Карточка
                </Button>
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
    today: B2BSchool[];
    tomorrow: B2BSchool[];
    week: B2BSchool[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const res = await b2bApi.planForToday(selectedCity || undefined);
      setData(res);
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
              </Stack>
            </Box>
            <Section id="section-overdue" title="Просроченные следующие действия" schools={data.overdue} onOpenSchool={onOpenSchool} />
            <Section id="section-no-next" title="Школы без следующего шага" schools={data.no_next_step} onOpenSchool={onOpenSchool} />
            <Section id="section-find-contacts" title="Школы в статусе «Найти контакты» больше 3 дней" schools={data.find_contacts_stale} onOpenSchool={onOpenSchool} />
            <Section id="section-today" title="Сегодня: дожим / перезвонить" schools={data.today} onOpenSchool={onOpenSchool} />
            <Section id="section-tomorrow" title="Завтра" schools={data.tomorrow} onOpenSchool={onOpenSchool} />
            <Section id="section-week" title="На неделе" schools={data.week} onOpenSchool={onOpenSchool} />
          </Stack>
        ) : null}
      </Stack>
    </Layout>
  );
};

export default B2BPlanForTodayPage;
