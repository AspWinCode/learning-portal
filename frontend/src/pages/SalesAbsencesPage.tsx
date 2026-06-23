import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
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

type StageConfig = {
  value: AbsenceFollowUpStage;
  label: string;
  shortLabel: string;
  helper: string;
  color: string;
  filter: (absence: AbsenceFollowUp) => boolean;
};

const STAGES: StageConfig[] = [
  {
    value: 'missed',
    label: 'Нужна отработка',
    shortLabel: 'Нужна',
    helper: 'Нужно подобрать слот или ручной урок',
    color: '#4f46e5',
    filter: (a) => a.stage === 'missed',
  },
  {
    value: 'link_sent',
    label: 'Ссылка отправлена',
    shortLabel: 'Ссылка',
    helper: 'Ждем выбор родителя',
    color: '#2563eb',
    filter: (a) => a.stage === 'link_sent',
  },
  {
    value: 'assigned',
    label: 'Отработка назначена',
    shortLabel: 'Назначена',
    helper: 'Есть дата и группа',
    color: '#7c3aed',
    filter: (a) => a.stage === 'assigned',
  },
  {
    value: 'made_up',
    label: 'Отработал',
    shortLabel: 'Готово',
    helper: 'Закрытые отработки',
    color: '#16a34a',
    filter: (a) => a.stage === 'made_up',
  },
  {
    value: 'no_makeup_needed',
    label: 'Отработка не нужна',
    shortLabel: 'Не нужна',
    helper: 'Урок засчитан без отработки',
    color: '#64748b',
    filter: (a) => a.stage === 'no_makeup_needed',
  },
  {
    value: 'missed_makeup',
    label: 'Пропустил отработку',
    shortLabel: 'Повтор',
    helper: 'Нужно переназначить',
    color: '#dc2626',
    filter: (a) => a.stage === 'missed_makeup',
  },
];

const STAGE_LABELS = STAGES.reduce<Record<string, string>>((acc, stage) => {
  acc[stage.value] = stage.label;
  return acc;
}, {});

const SUGGEST_MAKEUPS_DAYS = 21;

const REASON_LABELS: Record<string, string> = {
  was: 'Был',
  not_was: 'Не был',
  sick: 'Болел',
  olympiad: 'Олимпиада',
  event: 'Мероприятие',
  other: 'Другое',
};

const formatDate = (dateValue: string) => {
  try {
    return format(parseISO(dateValue), 'd MMM yyyy', { locale: ru });
  } catch {
    return dateValue;
  }
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

  const byStage = useMemo(
    () =>
      STAGES.reduce<Record<string, AbsenceFollowUp[]>>((acc, stage) => {
        acc[stage.value] = items.filter(stage.filter);
        return acc;
      }, {}),
    [items],
  );

  const totalCount = items.length;
  const activeCount = items.filter((a) => !['made_up', 'no_makeup_needed'].includes(a.stage)).length;

  const handleStageChange = async (absenceId: number, newStage: string) => {
    try {
      const updated = await salesApi.updateAbsenceStage(absenceId, newStage);
      setItems((prev) => {
        if (newStage === 'no_makeup_needed' && stageFilter !== 'no_makeup_needed') {
          return prev.filter((a) => a.id !== absenceId);
        }
        if (stageFilter && newStage !== stageFilter) {
          return prev.filter((a) => a.id !== absenceId);
        }
        return prev.map((a) => (a.id === absenceId ? updated : a));
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить этап'));
    }
  };

  const openSuggest = async (absence: AbsenceFollowUp) => {
    setSuggestAbsence(absence);
    setSuggestOpen(true);
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const list = await salesApi.suggestMakeups(absence.id, SUGGEST_MAKEUPS_DAYS);
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
    navigate(`/operations/manual-lessons?create=1&absence_id=${suggestAbsence.id}&student_id=${suggestAbsence.student_id}`);
  };

  const renderAbsenceCard = (absence: AbsenceFollowUp) => {
    const stage = STAGES.find((item) => item.value === absence.stage);
    const canPickMakeup = absence.stage === 'missed' || absence.stage === 'link_sent' || absence.stage === 'missed_makeup';

    return (
      <Paper
        key={absence.id}
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          borderLeft: `4px solid ${stage?.color || '#64748b'}`,
        }}
      >
        <Stack spacing={1.25}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
              {absence.student_name || `Ученик #${absence.student_id}`}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              {absence.program_name || absence.group_name || `Группа #${absence.group_id}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Пропуск: {formatDate(absence.lesson_date)}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Chip size="small" label={STAGE_LABELS[absence.stage] || absence.stage} />
            {absence.absence_reason && (
              <Chip
                size="small"
                variant="outlined"
                label={`Причина: ${REASON_LABELS[absence.absence_reason] || absence.absence_reason}`}
              />
            )}
          </Stack>

          {absence.absence_comment && (
            <Typography variant="body2" color="text.secondary">
              {absence.absence_comment}
            </Typography>
          )}

          {(absence.stage === 'assigned' || absence.stage === 'link_sent') &&
            (absence.makeup_group_name || absence.makeup_custom_lesson_title) && (
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Назначено
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {absence.makeup_group_name || absence.makeup_custom_lesson_title}
                </Typography>
                {absence.makeup_lesson_date && (
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(absence.makeup_lesson_date)}
                  </Typography>
                )}
              </Box>
            )}

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {canPickMakeup && (
              <Button size="small" variant="contained" onClick={() => openSuggest(absence)}>
                Подобрать
              </Button>
            )}
            {absence.stage === 'assigned' && (
              <Button size="small" color="warning" variant="outlined" onClick={() => handleStageChange(absence.id, 'missed_makeup')}>
                Не пришел
              </Button>
            )}
            {absence.stage === 'missed' && (
              <Button size="small" color="inherit" onClick={() => handleStageChange(absence.id, 'no_makeup_needed')}>
                Не нужна
              </Button>
            )}
          </Stack>

          <FormControl size="small" fullWidth>
            <InputLabel>Этап</InputLabel>
            <Select
              value={absence.stage}
              label="Этап"
              onChange={(event) => handleStageChange(absence.id, event.target.value)}
            >
              {STAGES.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>
    );
  };

  return (
    <Layout>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-end' }} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 0.5 }}>
              Пропуски
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Управление отработками: подбор слота, назначение, закрытие и перенос.
            </Typography>
          </Box>

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
            <InputLabel>Показать этап</InputLabel>
            <Select value={stageFilter} label="Показать этап" onChange={(event) => setStageFilter(event.target.value)}>
              <MenuItem value="">Все этапы</MenuItem>
              {STAGES.map((stage) => (
                <MenuItem key={stage.value} value={stage.value}>
                  {stage.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip
            clickable
            color={stageFilter === '' ? 'primary' : 'default'}
            variant={stageFilter === '' ? 'filled' : 'outlined'}
            label={`Все: ${totalCount}`}
            onClick={() => setStageFilter('')}
          />
          <Chip variant="outlined" label={`Активные: ${activeCount}`} />
          {STAGES.map((stage) => (
            <Chip
              key={stage.value}
              clickable
              color={stageFilter === stage.value ? 'primary' : 'default'}
              variant={stageFilter === stage.value ? 'filled' : 'outlined'}
              label={`${stage.shortLabel}: ${byStage[stage.value]?.length || 0}`}
              onClick={() => setStageFilter(stageFilter === stage.value ? '' : stage.value)}
            />
          ))}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto', pb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, minWidth: stageFilter ? 360 : 1960 }}>
              {STAGES.filter((stage) => !stageFilter || stage.value === stageFilter).map((stage) => {
                const stageItems = byStage[stage.value] || [];
                return (
                  <Paper
                    key={stage.value}
                    variant="outlined"
                    sx={{
                      width: stageFilter ? '100%' : 310,
                      minWidth: stageFilter ? 340 : 310,
                      maxWidth: stageFilter ? 760 : 310,
                      flex: stageFilter ? '1 1 auto' : '0 0 auto',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bgcolor: '#f8fafc',
                    }}
                  >
                    <Box sx={{ p: 1.5, borderTop: `4px solid ${stage.color}` }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 900, lineHeight: 1.25 }}>
                            {stage.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {stage.helper}
                          </Typography>
                        </Box>
                        <Chip size="small" label={stageItems.length} />
                      </Stack>
                    </Box>
                    <Divider />
                    <Stack spacing={1.25} sx={{ p: 1.25, minHeight: 360 }}>
                      {stageItems.length === 0 ? (
                        <Box
                          sx={{
                            border: '1px dashed',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            p: 2,
                            textAlign: 'center',
                            color: 'text.secondary',
                          }}
                        >
                          <Typography variant="body2">Нет пропусков</Typography>
                        </Box>
                      ) : (
                        stageItems.map(renderAbsenceCard)
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}

        <Dialog open={suggestOpen} onClose={() => { setSuggestOpen(false); setSuggestAbsence(null); }} maxWidth="sm" fullWidth>
          <DialogTitle>Назначить отработку</DialogTitle>
          <DialogContent>
            {suggestAbsence && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {suggestAbsence.student_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {suggestAbsence.program_name || 'Программа не указана'} · пропуск {formatDate(suggestAbsence.lesson_date)}
                </Typography>
              </Box>
            )}

            <Button size="small" variant="outlined" onClick={handleOpenManualLesson} disabled={!suggestAbsence} sx={{ mb: 2 }}>
              Создать ручной урок
            </Button>

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Подходящие занятия на 3 недели вперед
            </Typography>

            {suggestLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : suggestions.length === 0 ? (
              <Alert severity="info">
                Подходящих занятий не найдено. Можно создать ручной урок или проверить совместимость программ.
              </Alert>
            ) : (
              <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
                {suggestions.map((option, index) => (
                  <ListItem
                    key={`${option.group_id}-${option.lesson_date}-${index}`}
                    secondaryAction={
                      <Button size="small" onClick={() => handleAssignMakeup(option)} disabled={assigning}>
                        Назначить
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={`${option.group_name}${option.program_name ? ` · ${option.program_name}` : ''}`}
                      secondary={`${formatDate(option.lesson_date)}${option.start_time ? `, ${option.start_time}` : ''}`}
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
