import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import {
  addDays,
  addMonths,
  differenceInDays,
  eachDayOfInterval,
  format,
  isToday,
  parseISO,
  startOfDay,
  subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { OwnerWorkspaceTask } from '../../types';

type GanttScale = 'days' | 'weeks';
type UserOption = { id: number; full_name: string };

type Props = {
  tasks: OwnerWorkspaceTask[];
  onOpenTask: (task: OwnerWorkspaceTask) => void;
  userOptions?: UserOption[];
};

const STATUS_COLORS: Record<string, string> = {
  new: '#90caf9',
  in_progress: '#ffb74d',
  waiting: '#ce93d8',
  completed: '#81c784',
  cancelled: '#bdbdbd',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

// pixels per day
const DAY_PX: Record<GanttScale, number> = { days: 32, weeks: 12 };
// how many days to show in viewport
const DAYS_SHOWN: Record<GanttScale, number> = { days: 42, weeks: 90 };

const ROW_H = 40;
const HEADER_H = 52;
const LEFT_W = 268;

export function OwnerWorkspaceGanttSection({ tasks, onOpenTask, userOptions = [] }: Props) {
  const [scale, setScale] = useState<GanttScale>('days');
  const [rangeStart, setRangeStart] = useState<Date>(() => addDays(startOfDay(new Date()), -7));
  // ref to the header scrollable container — synced from body scroll
  const headerScrollRef = useRef<HTMLDivElement>(null);

  const dayWidth = DAY_PX[scale];
  const daysCount = DAYS_SHOWN[scale];
  const rangeEnd = addDays(rangeStart, daysCount - 1);
  const totalWidth = daysCount * dayWidth;

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; count: number }> = [];
    for (const day of days) {
      const label = format(day, 'LLLL yyyy', { locale: ru });
      if (!groups.length || groups[groups.length - 1].label !== label) {
        groups.push({ label, count: 1 });
      } else {
        groups[groups.length - 1].count += 1;
      }
    }
    return groups;
  }, [days]);

  const weekGroups = useMemo(() => {
    if (scale !== 'weeks') return [] as Array<{ label: string; count: number }>;
    const groups: Array<{ label: string; count: number }> = [];
    for (const day of days) {
      const isMon = day.getDay() === 1;
      if (!groups.length || isMon) {
        groups.push({ label: `Нед. ${format(day, 'w', { locale: ru })}`, count: 1 });
      } else {
        groups[groups.length - 1].count += 1;
      }
    }
    return groups;
  }, [days, scale]);

  const headerGroups = scale === 'weeks' ? weekGroups : monthGroups;

  const { tasksWithDates, tasksNoDates } = useMemo(() => {
    const withDates = tasks
      .filter((t) => t.deadline_at || t.start_at)
      .sort((a, b) => {
        const aD = a.deadline_at || a.start_at || '';
        const bD = b.deadline_at || b.start_at || '';
        return aD.localeCompare(bD);
      });
    const noDates = tasks.filter((t) => !t.deadline_at && !t.start_at);
    return { tasksWithDates: withDates, tasksNoDates: noDates };
  }, [tasks]);

  const getBarProps = (task: OwnerWorkspaceTask) => {
    const taskStart = task.start_at
      ? startOfDay(parseISO(task.start_at))
      : task.created_at
      ? startOfDay(parseISO(task.created_at))
      : null;
    const taskEnd = task.deadline_at ? startOfDay(parseISO(task.deadline_at)) : null;
    if (!taskEnd) return null;

    const effectiveStart = taskStart ?? taskEnd;
    const clampedStart = effectiveStart < rangeStart ? rangeStart : effectiveStart;
    const clampedEnd = taskEnd > rangeEnd ? rangeEnd : taskEnd;

    if (clampedStart > rangeEnd || clampedEnd < rangeStart) return null;

    const leftDays = differenceInDays(clampedStart, rangeStart);
    const widthDays = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);
    const isOverdue =
      taskEnd < startOfDay(new Date()) &&
      task.status !== 'completed' &&
      task.status !== 'cancelled';

    return {
      left: leftDays * dayWidth,
      width: widthDays * dayWidth - 4,
      color: STATUS_COLORS[task.status] ?? '#90caf9',
      isOverdue,
    };
  };

  const todayOffset = differenceInDays(startOfDay(new Date()), rangeStart);

  const navigate = (dir: -1 | 1) => {
    if (scale === 'days') {
      setRangeStart((d) => addDays(d, dir * 14));
    } else {
      setRangeStart((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const goToToday = () => {
    setRangeStart(addDays(startOfDay(new Date()), scale === 'days' ? -7 : -14));
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = 0;
  };

  const handleScaleChange = (_: unknown, v: GanttScale | null) => {
    if (!v) return;
    setScale(v);
    setRangeStart(addDays(startOfDay(new Date()), -7));
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = 0;
  };

  const handleBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = (e.currentTarget as HTMLDivElement).scrollLeft;
    }
  };

  const renderTaskLeftCell = (task: OwnerWorkspaceTask, index: number, dimmed?: boolean) => {
    const assignee = userOptions.find((u) => u.id === task.assignee_id);
    return (
      <Box
        key={task.id}
        sx={{
          height: ROW_H,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          borderRight: 1,
          borderBottom: 1,
          borderColor: 'divider',
          cursor: 'pointer',
          bgcolor: index % 2 === 0 ? 'transparent' : 'action.hover',
          '&:hover': { bgcolor: 'action.selected' },
          overflow: 'hidden',
          opacity: dimmed ? 0.6 : 1,
        }}
        onClick={() => onOpenTask(task)}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: STATUS_COLORS[task.status] ?? 'grey.400',
            flexShrink: 0,
          }}
        />
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Typography variant="body2" noWrap fontSize={12.5} fontWeight={500} lineHeight={1.3}>
            {task.title}
          </Typography>
          {assignee && (
            <Typography variant="caption" noWrap color="text.secondary" fontSize={11}>
              {assignee.full_name}
            </Typography>
          )}
        </Box>
        {task.priority && task.priority !== 'medium' && (
          <Chip
            label={PRIORITY_LABELS[task.priority] ?? task.priority}
            size="small"
            sx={{
              height: 16,
              fontSize: 10,
              flexShrink: 0,
              bgcolor:
                task.priority === 'critical'
                  ? 'error.light'
                  : task.priority === 'high'
                  ? 'warning.light'
                  : 'grey.200',
            }}
          />
        )}
      </Box>
    );
  };

  const renderTaskBar = (task: OwnerWorkspaceTask, index: number, dimmed?: boolean) => {
    const bar = getBarProps(task);
    return (
      <Box
        key={task.id}
        sx={{
          height: ROW_H,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: index % 2 === 0 ? 'transparent' : 'action.hover',
          opacity: dimmed ? 0.6 : 1,
        }}
      >
        {/* Today highlight column */}
        {todayOffset >= 0 && todayOffset < daysCount && (
          <Box
            sx={{
              position: 'absolute',
              left: todayOffset * dayWidth,
              top: 0,
              bottom: 0,
              width: dayWidth,
              bgcolor: 'primary.main',
              opacity: 0.06,
              pointerEvents: 'none',
            }}
          />
        )}
        {bar && (
          <Tooltip
            title={
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={600}>{task.title}</Typography>
                <Typography variant="caption">Статус: {STATUS_LABELS[task.status] ?? task.status}</Typography>
                {task.priority && (
                  <Typography variant="caption">Приоритет: {PRIORITY_LABELS[task.priority] ?? task.priority}</Typography>
                )}
                {task.start_at && (
                  <Typography variant="caption">
                    Старт: {format(parseISO(task.start_at), 'd MMM yyyy', { locale: ru })}
                  </Typography>
                )}
                {task.deadline_at && (
                  <Typography variant="caption">
                    Дедлайн: {format(parseISO(task.deadline_at), 'd MMM yyyy', { locale: ru })}
                  </Typography>
                )}
                {bar.isOverdue && (
                  <Typography variant="caption" sx={{ color: '#ffcdd2' }}>Просрочена</Typography>
                )}
              </Stack>
            }
            placement="top"
            arrow
          >
            <Box
              onClick={() => onOpenTask(task)}
              sx={{
                position: 'absolute',
                left: bar.left + 2,
                width: Math.max(bar.width, 6),
                top: '50%',
                transform: 'translateY(-50%)',
                height: 22,
                bgcolor: bar.color,
                borderRadius: '4px',
                cursor: 'pointer',
                outline: bar.isOverdue ? '2px solid' : 'none',
                outlineColor: 'error.main',
                display: 'flex',
                alignItems: 'center',
                px: 0.75,
                overflow: 'hidden',
                zIndex: 1,
                opacity: task.status === 'cancelled' ? 0.45 : 1,
                '&:hover': { filter: 'brightness(0.85)', zIndex: 3 },
                transition: 'filter 0.12s',
              }}
            >
              {bar.width > 50 && (
                <Typography variant="caption" noWrap fontSize={10.5} fontWeight={500} color="text.primary">
                  {task.title}
                </Typography>
              )}
            </Box>
          </Tooltip>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <IconButton size="small" onClick={() => navigate(-1)}>
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => navigate(1)}>
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Tooltip title="Сегодня">
          <IconButton size="small" onClick={goToToday}>
            <TodayIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
          {format(rangeStart, 'd MMM', { locale: ru })} –{' '}
          {format(rangeEnd, 'd MMM yyyy', { locale: ru })}
        </Typography>
        <Box flex={1} />
        <ToggleButtonGroup size="small" value={scale} exclusive onChange={handleScaleChange}>
          <ToggleButton value="days" sx={{ px: 1.5, fontSize: 12 }}>По дням</ToggleButton>
          <ToggleButton value="weeks" sx={{ px: 1.5, fontSize: 12 }}>Обзор</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* ── Header (sticky) ── */}
      <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 4 }}>
        {/* Left header cell */}
        <Box
          sx={{
            width: LEFT_W,
            flexShrink: 0,
            height: HEADER_H,
            display: 'flex',
            alignItems: 'flex-end',
            px: 1.5,
            pb: 1,
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>
            ЗАДАЧА
          </Typography>
        </Box>

        {/* Timeline header — overflow hidden, scrolled programmatically */}
        <Box ref={headerScrollRef} sx={{ flex: 1, overflow: 'hidden' }}>
          <Box sx={{ width: totalWidth }}>
            {/* Top row: month / week labels */}
            <Box sx={{ display: 'flex', height: HEADER_H / 2, borderBottom: 1, borderColor: 'divider' }}>
              {headerGroups.map((g, i) => (
                <Box
                  key={i}
                  sx={{
                    width: g.count * dayWidth,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    px: 1,
                    borderRight: 1,
                    borderColor: 'divider',
                    overflow: 'hidden',
                  }}
                >
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ textTransform: 'capitalize', fontSize: 11 }}>
                    {g.label}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Bottom row: day numbers */}
            <Box sx={{ display: 'flex', height: HEADER_H / 2 }}>
              {days.map((day, i) => {
                const today = isToday(day);
                const isSun = day.getDay() === 0;
                const isMon = day.getDay() === 1;
                return (
                  <Box
                    key={i}
                    sx={{
                      width: dayWidth,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRight: scale === 'weeks' && !isSun ? 'none' : '1px solid',
                      borderColor: 'divider',
                      bgcolor: today ? 'primary.main' : 'transparent',
                    }}
                  >
                    {(scale === 'days' || isMon || today) && (
                      <Typography
                        variant="caption"
                        fontSize={scale === 'weeks' ? 9 : 10}
                        fontWeight={today ? 700 : 400}
                        color={today ? 'primary.contrastText' : isSun ? 'error.light' : 'text.secondary'}
                      >
                        {format(day, 'd')}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Body ── */}
      <Box sx={{ display: 'flex', maxHeight: 560, overflowY: 'auto' }}>
        {/* Left fixed column */}
        <Box sx={{ width: LEFT_W, flexShrink: 0 }}>
          {tasksWithDates.length === 0 && tasksNoDates.length === 0 && (
            <Box sx={{ px: 2, py: 4 }}>
              <Typography color="text.secondary" variant="body2">Нет задач</Typography>
            </Box>
          )}
          {tasksWithDates.map((task, i) => renderTaskLeftCell(task, i))}

          {tasksNoDates.length > 0 && (
            <>
              <Box
                sx={{
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                }}
              >
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  БЕЗ ДАТ ({tasksNoDates.length})
                </Typography>
              </Box>
              {tasksNoDates.map((task, i) => renderTaskLeftCell(task, i, true))}
            </>
          )}
        </Box>

        {/* Scrollable timeline column */}
        <Box
          sx={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}
          onScroll={handleBodyScroll}
        >
          <Box sx={{ width: totalWidth, position: 'relative' }}>
            {/* Today vertical line */}
            {todayOffset >= 0 && todayOffset < daysCount && (
              <Box
                sx={{
                  position: 'absolute',
                  left: todayOffset * dayWidth + Math.floor(dayWidth / 2),
                  top: 0,
                  bottom: 0,
                  width: 2,
                  bgcolor: 'primary.main',
                  opacity: 0.5,
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              />
            )}

            {tasksWithDates.map((task, i) => renderTaskBar(task, i))}

            {tasksNoDates.length > 0 && (
              <>
                <Box sx={{ height: 28, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }} />
                {tasksNoDates.map((task, i) => renderTaskBar(task, i, true))}
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Legend ── */}
      <Stack
        direction="row"
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
        sx={{ px: 2, py: 0.75, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Stack key={key} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: STATUS_COLORS[key] }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: '#ef9a9a', outline: '2px solid #d32f2f' }} />
          <Typography variant="caption" color="text.secondary">Просрочена</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
