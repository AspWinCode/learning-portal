import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { AbsenceFollowUp, AbsenceFollowUpStage, MakeupSuggestionItem } from '../types';

const STAGES: { value: AbsenceFollowUpStage | 'missed_or_link_sent'; label: string; filter: (a: AbsenceFollowUp) => boolean }[] = [
  { value: 'missed_or_link_sent', label: 'Нужна отработка', filter: (a) => a.stage === 'missed' || a.stage === 'link_sent' },
  { value: 'assigned', label: 'Отработка назначена', filter: (a) => a.stage === 'assigned' },
  { value: 'made_up', label: 'Отработал', filter: (a) => a.stage === 'made_up' },
  { value: 'missed_makeup', label: 'Пропустил отработку — переназначить', filter: (a) => a.stage === 'missed_makeup' },
];

/** Окно подбора отработок: 3 недели вперёд */
const SUGGEST_MAKEUPS_DAYS = 21;

const REASON_LABELS: Record<string, string> = {
  was: 'Был',
  not_was: 'Не был',
  sick: 'Болел',
  olympiad: 'Олимпиада',
  event: 'Мероприятие',
  other: 'Другое',
};

const SalesAbsencesPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AbsenceFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestAbsence, setSuggestAbsence] = useState<AbsenceFollowUp | null>(null);
  const [suggestions, setSuggestions] = useState<MakeupSuggestionItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

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

  const openSuggest = async (a: AbsenceFollowUp) => {
    setSuggestAbsence(a);
    setSuggestOpen(true);
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const list = await salesApi.suggestMakeups(a.id, SUGGEST_MAKEUPS_DAYS);
      setSuggestions(list);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось подобрать отработки'));
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleAssignMakeup = async (option: MakeupSuggestionItem) => {
    if (!suggestAbsence) return;
    setAssigning(true);
    setError(null);
    try {
      const updated = await salesApi.assignMakeup(suggestAbsence.id, {
        makeup_group_id: option.group_id,
        makeup_lesson_date: option.lesson_date,
      });
      setItems((prev) => prev.map((a) => (a.id === suggestAbsence.id ? updated : a)));
      setSuggestOpen(false);
      setSuggestAbsence(null);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось назначить отработку'));
    } finally {
      setAssigning(false);
    }
  };

  const handleOpenManualLesson = () => {
    if (!suggestAbsence) return;
    setSuggestOpen(false);
    setSuggestAbsence(null);
    navigate(
      `/operations/manual-lessons?create=1&absence_id=${suggestAbsence.id}&student_id=${suggestAbsence.student_id}`
    );
  };

  const byStage = STAGES.reduce(
    (acc, { value, filter }) => {
      acc[value] = items.filter(filter);
      return acc;
    },
    {} as Record<string, AbsenceFollowUp[]>
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
              <MenuItem value="missed">Нужна отработка</MenuItem>
              <MenuItem value="assigned">Отработка назначена</MenuItem>
              <MenuItem value="made_up">Отработал</MenuItem>
              <MenuItem value="missed_makeup">Пропустил отработку — переназначить</MenuItem>
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
                          <Typography variant="caption" color="text.secondary" display="block">
                            {a.group_name || `Группа #${a.group_id}`} · {formatDate(a.lesson_date)}
                            {a.program_name && ` · ${a.program_name}`}
                          </Typography>
                          {a.absence_reason && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Причина: {REASON_LABELS[a.absence_reason] || a.absence_reason}
                              {a.absence_comment && ` — ${a.absence_comment}`}
                            </Typography>
                          )}
                          {(a.stage === 'assigned' || a.stage === 'link_sent') && a.makeup_group_name && a.makeup_lesson_date && (
                            <Typography variant="caption" color="primary" display="block">
                              Отработка: {a.makeup_group_name} · {formatDate(a.makeup_lesson_date)}
                            </Typography>
                          )}
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                            {(a.stage === 'missed' || a.stage === 'link_sent' || a.stage === 'missed_makeup') && (
                              <Button size="small" variant="outlined" onClick={() => openSuggest(a)}>
                                Подобрать отработку
                              </Button>
                            )}
                            {a.stage === 'assigned' && (
                              <Button
                                size="small"
                                color="secondary"
                                onClick={() => handleStageChange(a.id, 'missed_makeup')}
                              >
                                Не пришёл
                              </Button>
                            )}
                            <FormControl size="small" sx={{ minWidth: 180 }}>
                              <Select
                                value={a.stage}
                                onChange={(e) => handleStageChange(a.id, e.target.value)}
                                displayEmpty
                              >
                                <MenuItem value="missed">Нужна отработка</MenuItem>
                                <MenuItem value="link_sent">Ссылка отправлена</MenuItem>
                                <MenuItem value="assigned">Отработка назначена</MenuItem>
                                <MenuItem value="made_up">Отработал</MenuItem>
                                <MenuItem value="missed_makeup">Пропустил отработку — переназначить</MenuItem>
                              </Select>
                            </FormControl>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        <Dialog open={suggestOpen} onClose={() => { setSuggestOpen(false); setSuggestAbsence(null); }} maxWidth="sm" fullWidth>
          <DialogTitle>Назначить отработку</DialogTitle>
          <DialogContent>
            {suggestAbsence && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {suggestAbsence.student_name} · {suggestAbsence.program_name || '—'}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button size="small" variant="outlined" color="primary" onClick={handleOpenManualLesson} disabled={!suggestAbsence}>
                Ручной урок (без группы)
              </Button>
            </Stack>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              Или выбрать занятие в группе (на 3 недели вперёд):
            </Typography>
            {suggestLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : suggestions.length === 0 ? (
              <Typography color="text.secondary">Нет подходящих занятий. Заполните матрицу совместимости программ.</Typography>
            ) : (
              <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
                {suggestions.map((opt, idx) => (
                  <ListItem
                    key={`${opt.group_id}-${opt.lesson_date}-${idx}`}
                    secondaryAction={
                      <Button size="small" onClick={() => handleAssignMakeup(opt)} disabled={assigning}>
                        Назначить
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={`${opt.group_name}${opt.program_name ? ` · ${opt.program_name}` : ''}`}
                      secondary={`${formatDate(opt.lesson_date)}${opt.start_time ? `, ${opt.start_time}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setSuggestOpen(false); setSuggestAbsence(null); }}>Закрыть</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default SalesAbsencesPage;
