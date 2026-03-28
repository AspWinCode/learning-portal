/**
 * Верхняя панель страницы Уроки:
 * - навигация по датам (< Сегодня >)
 * - текущая дата
 * - кнопка "Добавить урок"
 * - фильтры типа/статуса
 */
import React from 'react';
import {
  Stack,
  Typography,
  IconButton,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Tooltip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { format, parseISO, addDays, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LESSON_TYPE_LABELS, LESSON_STATUS_LABELS } from '../../types';

interface Props {
  viewDate: string;
  onDateChange: (date: string) => void;
  onAddLesson: () => void;
  onRefresh: () => void;
  canAdd: boolean;
  loading: boolean;
  lastUpdated: Date | null;
  filterType: string;
  filterStatus: string;
  onFilterTypeChange: (v: string) => void;
  onFilterStatusChange: (v: string) => void;
}

export function LessonsToolbar({
  viewDate,
  onDateChange,
  onAddLesson,
  onRefresh,
  canAdd,
  loading,
  lastUpdated,
  filterType,
  filterStatus,
  onFilterTypeChange,
  onFilterStatusChange,
}: Props) {
  const parsed = parseISO(viewDate);

  const goDay = (delta: number) => {
    const next = addDays(parsed, delta);
    onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const goToday = () => onDateChange(format(new Date(), 'yyyy-MM-dd'));

  const dateLabel = format(parsed, 'd MMMM yyyy г. (EEEE)', { locale: ru });
  const isTodayDate = isToday(parsed);

  return (
    <Stack spacing={1.5}>
      {/* Строка заголовка */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" fontWeight={600}>
            Уроки
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              обновлено {format(lastUpdated, 'HH:mm')}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          {canAdd && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onAddLesson}
              size="small"
            >
              Добавить урок
            </Button>
          )}
          <Tooltip title="Обновить">
            <IconButton onClick={onRefresh} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Навигация по датам */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" gap={1}>
        <IconButton onClick={() => goDay(-1)} size="small">
          <ChevronLeftIcon />
        </IconButton>

        <Button
          variant={isTodayDate ? 'contained' : 'outlined'}
          size="small"
          onClick={goToday}
          sx={{ minWidth: 80 }}
        >
          Сегодня
        </Button>

        <IconButton onClick={() => goDay(1)} size="small">
          <ChevronRightIcon />
        </IconButton>

        <Typography variant="subtitle1" fontWeight={500} sx={{ ml: 1 }}>
          {dateLabel}
        </Typography>

        {/* Быстрый выбор даты */}
        <input
          type="date"
          value={viewDate}
          onChange={e => onDateChange(e.target.value)}
          style={{
            border: '1px solid #ccc',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        />
      </Stack>

      {/* Фильтры */}
      <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Тип занятия</InputLabel>
          <Select
            value={filterType}
            label="Тип занятия"
            onChange={e => onFilterTypeChange(e.target.value)}
          >
            <MenuItem value="">Все типы</MenuItem>
            {(Object.entries(LESSON_TYPE_LABELS) as [string, string][]).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Статус</InputLabel>
          <Select
            value={filterStatus}
            label="Статус"
            onChange={e => onFilterStatusChange(e.target.value)}
          >
            <MenuItem value="">Все статусы</MenuItem>
            {(Object.entries(LESSON_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {(filterType || filterStatus) && (
          <Chip
            label="Сбросить фильтры"
            size="small"
            onDelete={() => { onFilterTypeChange(''); onFilterStatusChange(''); }}
          />
        )}
      </Stack>
    </Stack>
  );
}
