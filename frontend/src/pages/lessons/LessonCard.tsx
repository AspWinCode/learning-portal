/**
 * Карточка одного занятия в списке.
 * Показывает: тип, статус, время, группу/название, тренера, учеников.
 */
import React from 'react';
import {
  Card,
  CardContent,
  Stack,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Box,
  LinearProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import PeopleIcon from '@mui/icons-material/People';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { LessonInstance } from '../../types';
import {
  LESSON_TYPE_LABELS,
  LESSON_STATUS_LABELS,
  LESSON_TYPE_COLORS,
} from '../../types';

interface Props {
  lesson: LessonInstance;
  onOpenAttendance: (lesson: LessonInstance) => void;
  onMove: (lesson: LessonInstance) => void;
  onCancel: (lesson: LessonInstance) => void;
  canMove: boolean;
  canCancel: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  planned: '#e3f2fd',
  completed: '#e8f5e9',
  cancelled: '#ffebee',
  moved: '#fff8e1',
};

const STATUS_BORDER: Record<string, string> = {
  planned: '#90caf9',
  completed: '#a5d6a7',
  cancelled: '#ef9a9a',
  moved: '#ffe082',
};

export function LessonCard({ lesson, onOpenAttendance, onMove, onCancel, canMove, canCancel }: Props) {
  const typeColor = LESSON_TYPE_COLORS[lesson.lesson_type] ?? '#757575';
  const isCancelled = lesson.status === 'cancelled';
  const isMoved = lesson.status === 'moved';
  const isCompleted = lesson.status === 'completed';

  const attendancePercent = lesson.students_count > 0
    ? Math.round((lesson.attended_count / lesson.students_count) * 100)
    : 0;

  return (
    <Card
      variant="outlined"
      sx={{
        backgroundColor: STATUS_COLORS[lesson.status] ?? '#fff',
        borderColor: STATUS_BORDER[lesson.status] ?? '#e0e0e0',
        borderLeft: `4px solid ${typeColor}`,
        opacity: isCancelled ? 0.7 : 1,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 3 },
      }}
      onClick={() => !isCancelled && onOpenAttendance(lesson)}
    >
      <CardContent sx={{ pb: '12px !important', pt: 1.5 }}>
        <Stack spacing={1}>
          {/* Строка 1: время + тип + статус */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" fontWeight={700} fontSize={15}>
                {lesson.start_time}{lesson.end_time ? ` – ${lesson.end_time}` : ''}
              </Typography>
              <Chip
                label={LESSON_TYPE_LABELS[lesson.lesson_type] ?? lesson.lesson_type}
                size="small"
                sx={{
                  backgroundColor: typeColor,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 11,
                }}
              />
              {lesson.status !== 'planned' && (
                <Chip
                  label={LESSON_STATUS_LABELS[lesson.status] ?? lesson.status}
                  size="small"
                  variant="outlined"
                  color={isCancelled ? 'error' : isMoved ? 'warning' : isCompleted ? 'success' : 'default'}
                />
              )}
            </Stack>

            {/* Кнопки действий */}
            {!isCancelled && !isMoved && (
              <Stack direction="row" onClick={e => e.stopPropagation()}>
                {canMove && (
                  <Tooltip title="Перенести">
                    <IconButton size="small" onClick={() => onMove(lesson)}>
                      <SwapHorizIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {canCancel && (
                  <Tooltip title="Отменить">
                    <IconButton size="small" color="error" onClick={() => onCancel(lesson)}>
                      <CancelIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Открыть посещаемость">
                  <IconButton size="small" color="primary" onClick={() => onOpenAttendance(lesson)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Stack>

          {/* Строка 2: название группы / title */}
          <Typography variant="body1" fontWeight={600}>
            {lesson.group_name ?? lesson.title ?? '—'}
          </Typography>

          {/* Строка 3: программа + тренер */}
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            {lesson.program_name && (
              <Typography variant="caption" color="text.secondary">
                📚 {lesson.program_name}
              </Typography>
            )}
            {lesson.trainer_name && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PersonIcon fontSize="inherit" sx={{ color: 'text.secondary', fontSize: 14 }} />
                <Typography variant="caption" color="text.secondary">
                  {lesson.trainer_name}
                </Typography>
              </Stack>
            )}
          </Stack>

          {/* Строка 4: ученики */}
          {lesson.students_count > 0 && (
            <Stack spacing={0.5}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <PeopleIcon fontSize="inherit" sx={{ color: 'text.secondary', fontSize: 14 }} />
                <Typography variant="caption" color="text.secondary">
                  {isCompleted
                    ? `Отмечено: ${lesson.attended_count} / ${lesson.students_count}`
                    : `Учеников: ${lesson.students_count}`
                  }
                </Typography>
              </Stack>
              {isCompleted && lesson.students_count > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={attendancePercent}
                  sx={{ height: 4, borderRadius: 2 }}
                  color={attendancePercent === 100 ? 'success' : 'primary'}
                />
              )}
            </Stack>
          )}

          {/* Связи переноса */}
          {isMoved && lesson.moved_to_id && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <ArrowForwardIcon fontSize="small" color="warning" />
              <Typography variant="caption" color="warning.main">
                Перенесено (id занятия: {lesson.moved_to_id})
              </Typography>
            </Stack>
          )}
          {lesson.moved_from_id && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <ArrowBackIcon fontSize="small" color="info" />
              <Typography variant="caption" color="info.main">
                Перенесено с урока #{lesson.moved_from_id}
              </Typography>
            </Stack>
          )}

          {/* Причина отмены */}
          {isCancelled && lesson.cancel_reason && (
            <Typography variant="caption" color="error">
              Причина: {lesson.cancel_reason}
            </Typography>
          )}

          {/* Комментарий */}
          {lesson.comment && (
            <Typography variant="caption" color="text.secondary" fontStyle="italic">
              {lesson.comment}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
