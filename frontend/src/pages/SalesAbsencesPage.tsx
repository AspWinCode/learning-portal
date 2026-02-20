import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { AbsenceFollowUp, AbsenceFollowUpStage } from '../types';

const STAGES: { value: AbsenceFollowUpStage; label: string }[] = [
  { value: 'missed', label: 'Пропустил' },
  { value: 'assigned', label: 'Назначили' },
  { value: 'made_up', label: 'Отработал' },
  { value: 'missed_makeup', label: 'Пропустил отработку' },
];

const SalesAbsencesPage: React.FC = () => {
  const [items, setItems] = useState<AbsenceFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('');

  const loadAbsences = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getAbsences(stageFilter ? { stage: stageFilter } : {});
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить пропуски'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAbsences();
  }, [stageFilter]);

  const handleStageChange = async (absenceId: number, newStage: string) => {
    try {
      const updated = await salesApi.updateAbsenceStage(absenceId, newStage);
      setItems((prev) => prev.map((a) => (a.id === absenceId ? updated : a)));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить этап'));
    }
  };

  const byStage = STAGES.reduce(
    (acc, { value }) => {
      acc[value] = items.filter((a) => a.stage === value);
      return acc;
    },
    {} as Record<AbsenceFollowUpStage, AbsenceFollowUp[]>
  );

  const formatDate = (d: string) => {
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Пропуски
        </Typography>

        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Этап</InputLabel>
            <Select
              value={stageFilter}
              label="Этап"
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <MenuItem value="">Все</MenuItem>
              {STAGES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 2,
            }}
          >
            {STAGES.map(({ value, label }) => (
              <Card key={value} variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {byStage[value].length} шт.
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {byStage[value].map((a) => (
                      <Card key={a.id} variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                          <Typography variant="body2" fontWeight={500}>
                            {a.student_name || `Ученик #${a.student_id}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {a.group_name || `Группа #${a.group_id}`} · {formatDate(a.lesson_date)}
                          </Typography>
                          <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                            <Select
                              value={a.stage}
                              onChange={(e) => handleStageChange(a.id, e.target.value)}
                              displayEmpty
                            >
                              {STAGES.map((s) => (
                                <MenuItem key={s.value} value={s.value}>
                                  {s.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Layout>
  );
};

export default SalesAbsencesPage;
