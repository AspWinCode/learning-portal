import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';

import type { OwnerWorkspaceTask } from '../../types';

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';

type KanbanColumn = {
  label: string;
  statuses: OwnerWorkspaceTaskStatus[];
  dropStatus: OwnerWorkspaceTaskStatus;
};

type OwnerWorkspaceTaskBoardCalendarSectionProps = {
  taskViewMode: 'kanban' | 'calendar';
  tasks: OwnerWorkspaceTask[];
  kanbanColumns: KanbanColumn[];
  coerceTaskStatus: (value: string) => OwnerWorkspaceTaskStatus;
  renderTaskCard: (task: OwnerWorkspaceTask, options?: { draggable?: boolean }) => React.ReactNode;
  onKanbanDrop: (taskId: number, status: OwnerWorkspaceTaskStatus) => void | Promise<void>;
  calendarMonth: Date;
  onCalendarMonthChange: (updater: (current: Date) => Date) => void;
  tasksByDeadlineDay: Map<string, OwnerWorkspaceTask[]>;
  onOpenTask: (task: OwnerWorkspaceTask) => void | Promise<void>;
  weekdaysShort: string[];
};

function isTaskOverdue(task: OwnerWorkspaceTask): boolean {
  if (!task.deadline_at || task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.deadline_at).getTime() < Date.now();
}

export function OwnerWorkspaceTaskBoardCalendarSection({
  taskViewMode,
  tasks,
  kanbanColumns,
  coerceTaskStatus,
  renderTaskCard,
  onKanbanDrop,
  calendarMonth,
  onCalendarMonthChange,
  tasksByDeadlineDay,
  onOpenTask,
  weekdaysShort,
}: OwnerWorkspaceTaskBoardCalendarSectionProps) {
  const [calendarMode, setCalendarMode] = React.useState<'day' | 'week' | 'month'>('month');

  if (taskViewMode === 'kanban') {
    return (
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
        {kanbanColumns.map((column) => {
          const columnTasks = tasks.filter((task) => column.statuses.includes(coerceTaskStatus(String(task.status))));
          return (
            <Box
              key={column.label}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const raw = event.dataTransfer.getData('text/plain');
                const taskId = Number(raw);
                if (!taskId) return;
                void onKanbanDrop(taskId, column.dropStatus);
              }}
              sx={{
                minWidth: 200,
                maxWidth: 280,
                flex: '0 0 auto',
                bgcolor: 'action.hover',
                borderRadius: 1,
                p: 1,
                minHeight: 200,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, px: 0.5 }}>
                {column.label} ({columnTasks.length})
              </Typography>
              <Stack spacing={0}>{columnTasks.map((task) => renderTaskCard(task, { draggable: true }))}</Stack>
            </Box>
          );
        })}
      </Box>
    );
  }

  const visibleDays = eachDayOfInterval({
    start:
      calendarMode === 'day'
        ? startOfDay(calendarMonth)
        : calendarMode === 'week'
        ? startOfWeek(calendarMonth, { weekStartsOn: 1 })
        : startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
    end:
      calendarMode === 'day'
        ? endOfDay(calendarMonth)
        : calendarMode === 'week'
        ? endOfWeek(calendarMonth, { weekStartsOn: 1 })
        : endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
  });
  const calendarTitle =
    calendarMode === 'day'
      ? format(calendarMonth, 'd MMMM yyyy', { locale: ru })
      : calendarMode === 'week'
      ? `${format(visibleDays[0], 'd MMM', { locale: ru })} — ${format(visibleDays[visibleDays.length - 1], 'd MMM yyyy', { locale: ru })}`
      : format(calendarMonth, 'LLLL yyyy', { locale: ru });
  const shiftCalendar = (direction: -1 | 1) => {
    onCalendarMonthChange((current) => {
      if (calendarMode === 'day') return new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction);
      if (calendarMode === 'week') return new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7);
      return startOfMonth(new Date(current.getFullYear(), current.getMonth() + direction, 1));
    });
  };

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <IconButton
            aria-label="Предыдущий период"
            onClick={() => shiftCalendar(-1)}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h6">{calendarTitle}</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={calendarMode}
              onChange={(_, value) => value && setCalendarMode(value)}
            >
              <ToggleButton value="day">День</ToggleButton>
              <ToggleButton value="week">Неделя</ToggleButton>
              <ToggleButton value="month">Месяц</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <IconButton
            aria-label="Следующий период"
            onClick={() => shiftCalendar(1)}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${calendarMode === 'day' ? 1 : 7}, 1fr)`,
            gap: 0.5,
          }}
        >
          {calendarMode !== 'day' && weekdaysShort.map((weekday) => (
            <Typography key={weekday} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600 }}>
              {weekday}
            </Typography>
          ))}
          {visibleDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDeadlineDay.get(key) || [];
            const inMonth = calendarMode === 'month' ? isSameMonth(day, calendarMonth) : true;
            return (
              <Box
                key={key}
                sx={{
                  minHeight: 100,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.5,
                  bgcolor: inMonth ? 'background.paper' : 'action.hover',
                  opacity: inMonth ? 1 : 0.65,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: isToday(day) ? 700 : 500, color: isToday(day) ? 'primary.main' : 'text.primary' }}
                >
                  {format(day, 'd')}
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {dayTasks.slice(0, 4).map((task) => (
                    <Chip
                      key={task.id}
                      size="small"
                      color={isTaskOverdue(task) ? 'error' : 'default'}
                      variant={isTaskOverdue(task) ? 'filled' : 'outlined'}
                      label={`${task.title.length > 18 ? `${task.title.slice(0, 18)}…` : task.title} · ${task.status} · ${task.priority}`}
                      onClick={() => void onOpenTask(task)}
                      sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
                    />
                  ))}
                  {dayTasks.length > 4 && (
                    <Typography variant="caption" color="text.secondary">
                      +{dayTasks.length - 4}
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
