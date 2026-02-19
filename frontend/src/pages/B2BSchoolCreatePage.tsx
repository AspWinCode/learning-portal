import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool, B2BSchoolPipelineStage } from '../types';

const PIPELINE_STAGES: { value: B2BSchoolPipelineStage; label: string }[] = [
  { value: 'new', label: 'Новые' },
  { value: 'contact_found', label: 'Контакт найден' },
  { value: 'letter_sent', label: 'Письмо отправлено' },
  { value: 'meeting_scheduled', label: 'Назначена встреча' },
  { value: 'meeting_held', label: 'Встреча проведена' },
  { value: 'permission_received', label: 'Разрешение получено' },
  { value: 'walkthrough_scheduled', label: 'Назначена дата обхода' },
  { value: 'walkthrough_done', label: 'Обход проведён' },
  { value: 'leads_received', label: 'Лиды получены' },
];

const B2BSchoolCreatePage: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    student_count: '' as number | '',
    friendship_degree: '',
    pipeline_stage: 'new' as B2BSchoolPipelineStage,
    event_dates: '',
  });
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCity, setFilterCity] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await b2bApi.listSchools();
      setSchools(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить список школ'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const uniqueCities = useMemo(() => {
    const cities = Array.from(new Set(schools.map((s) => s.city).filter((c): c is string => !!c)));
    return cities.sort((a, b) => a.localeCompare(b));
  }, [schools]);

  const filteredSchools = useMemo(() => {
    if (!filterCity) return schools;
    return schools.filter((s) => s.city === filterCity);
  }, [schools, filterCity]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    setSaving(true);
    try {
      const eventDates = form.event_dates
        ? form.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : undefined;
      await b2bApi.createSchool({
        name: form.name.trim(),
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        friendship_degree: form.friendship_degree || undefined,
        pipeline_stage: form.pipeline_stage,
        event_dates: eventDates,
      });
      setSuccess('Школа успешно создана');
      setForm({
        name: '',
        director: '',
        city: '',
        address: '',
        student_count: '',
        friendship_degree: '',
        pipeline_stage: 'new',
        event_dates: '',
      });
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4">Создать школу (B2B)</Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box maxWidth={520}>
          <Stack spacing={2}>
            <TextField
              label="Название школы"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Директор школы"
              value={form.director}
              onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Адрес"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Количество детей в школе"
              type="number"
              value={form.student_count}
              onChange={(e) =>
                setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))
              }
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <FormControl fullWidth>
              <InputLabel>Степень дружбы</InputLabel>
              <Select
                value={form.friendship_degree}
                label="Степень дружбы"
                onChange={(e) => setForm((f) => ({ ...f, friendship_degree: e.target.value }))}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                <MenuItem value="unknown">Не знаем друг друга</MenuItem>
                <MenuItem value="indirect">Знаем косвенно</MenuItem>
                <MenuItem value="friends">Друзья╢</MenuItem>
                <MenuItem value="enemies">Враги</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Даты мероприятий (через запятую)"
              value={form.event_dates}
              onChange={(e) => setForm((f) => ({ ...f, event_dates: e.target.value }))}
              fullWidth
              placeholder="2025-03-01, 2025-03-15"
            />
            <FormControl fullWidth>
              <InputLabel>Стадия воронки</InputLabel>
              <Select
                value={form.pipeline_stage}
                label="Стадия воронки"
                onChange={(e) =>
                  setForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))
                }
              >
                {PIPELINE_STAGES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => void handleSave()}
                disabled={saving}
              >
                Создать школу
              </Button>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6">Созданные школы</Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Фильтр по городу  </InputLabel>
              <Select
                label="Фильтр по городу  "
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              >
                <MenuItem value="">
                  <em>Все города </em>
                </MenuItem>
                {uniqueCities.map((city) => (
                  <MenuItem key={city} value={city}>
                    {city}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {loading ? (
            <Typography color="text.secondary">Загрузка…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Название</TableCell>
                    <TableCell>Директор</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>Адрес</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell>Стадия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSchools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }} color="text.secondary">
                        {schools.length === 0 ? 'Нет созданных школ' : 'Нет школ в выбранном городе'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSchools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell>{school.name}</TableCell>
                        <TableCell>{school.director || 'тАФ'}</TableCell>
                        <TableCell>{school.city || 'тАФ'}</TableCell>
                        <TableCell sx={{ maxWidth: 200 }} title={school.address || ''}>
                          <Typography variant="body2" noWrap>
                            {school.address || 'тАФ'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{school.student_count ?? 'тАФ'}</TableCell>
                        <TableCell>
                          {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>
    </Layout>
  );
};

export default B2BSchoolCreatePage;

