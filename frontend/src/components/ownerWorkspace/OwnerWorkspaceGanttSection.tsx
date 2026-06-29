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
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
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
import type { OwnerWorkspaceProject, OwnerWorkspaceTask } from '../../types';

type GanttScale = 'days' | 'weeks';
type UserOption = { id: number; full_name: string };
type ProjectKey = number | 'none'; // 'none' = no project

type Props = {
  tasks: OwnerWorkspaceTask[];
  onOpenTask: (task: OwnerWorkspaceTask) => void;
  userOptions?: UserOption[];
  projects?: OwnerWorkspaceProject[];
};

type ProjectGroup = {
  key: ProjectKey;
  name: string;
  tasksWithDates: OwnerWorkspaceTask[];
  tasksNoDates: OwnerWorkspaceTask[];
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

const DAY_PX: Record<GanttScale, number> = { days: 32, weeks: 12 };
const DAYS_SHOWN: Record<GanttScale, number> = { days: 42, weeks: 90 };

const ROW_H = 40;
const GROUP_H = 32;
const HEADER_H = 52;
const LEFT_W = 268;

export function OwnerWorkspaceGanttSection({ tasks, onOpenTask, userOptions = [], projects = [] }: Props) {
  const [scale, setScale] = useState<GanttScale>('days');
  const [rangeStart, setRangeStart] = useState<Date>(() => addDays(startOfDay(new Date()), -7));
  const [collapsedKeys, setCollapsedKeys] = useState<Set<ProjectKey>>(new Set());
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

  // Group tasks by project
  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const map = new Map<ProjectKey, ProjectGroup>();

    for (const task of tasks) {
      const rawKey = task.project_id ?? null;
      const key: ProjectKey = rawKey === null ? 'none' : rawKey;

      if (!map.has(key)) {
        const proj = rawKey !== null ? projects.find((p) => p.id === rawKey) : null;
        map.set(key, {
          key,
          name: proj?.name ?? (key === 'none' ? 'Без проекта' : `Проект #${rawKey}`),
          tasksWithDates: [],
          tasksNoDates: [],
        });
      }

      const g = map.get(key)!;
      if (task.deadline_at || task.start_at) {
        g.tasksWithDates.push(task);
      } else {
        g.tasksNoDates.push(task);
      }
    }

    // Sort tasks within groups
    for (const g of map.values()) {
      g.tasksWithDates.sort((a, b) => {
        const aD = a.deadline_at || a.start_at || '';
        const bD = b.deadline_at || b.start_at || '';
        return aD.localeCompare(bD);
      });
    }

    // Sort groups: named projects alphabetically, "Без проекта" last
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === 'none') return 1;
      if (b.key === 'none') return -1;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [tasks, projects]);

  const allKeys = useMemo(() => projectGroups.map((g) => g.key), [projectGroups]);

  const toggleGroup = (key: ProjectKey) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setCollapsedKeys(new Set());
  const collapseAll = () => setCollapsedKeys(new Set(allKeys));

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

  // Summary bar for a project group header
  const getGroupBarProps = (group: ProjectGroup) => {
    if (group.tasksWithDates.length === 0) return null;

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const task of group.tasksWithDates) {
      const s = task.start_at
        ? startOfDay(parseISO(task.start_at))
        : task.created_at
        ? startOfDay(parseISO(task.created_at))
        : task.deadline_at
        ? startOfDay(parseISO(task.deadline_at))
        : null;
      const e = task.deadline_at ? startOfDay(parseISO(task.deadline_at)) : null;

      if (s && (!minDate || s < minDate)) minDate = s;
      if (e && (!maxDate || e > maxDate)) maxDate = e;
    }

    if (!minDate || !maxDate) return null;

    const clampedStart = minDate < rangeStart ? rangeStart : minDate;
    const clampedEnd = maxDate > rangeEnd ? rangeEnd : maxDate;

    if (clampedStart > rangeEnd || clampedEnd < rangeStart) return null;

    const leftDays = differenceInDays(clampedStart, rangeStart);
    const widthDays = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);

    return { left: leftDays * dayWidth, width: widthDays * dayWidth - 4 };
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

  // ─── Row renderers ───────────────────────────────────────────────────────────

  const renderGroupHeaderLeft = (group: ProjectGroup) => {
    const isCollapsed = collapsedKeys.has(group.key);
    const total = group.tasksWithDates.length + group.tasksNoDates.length;
    return (
      <Box
        key={`gh-left-${group.key}`}
        sx={{
          height: GROUP_H,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          borderRight: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.selected',
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: 'action.focus' },
        }}
        onClick={() => toggleGroup(group.key)}
      >
        <Typography
          variant="caption"
          sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1, flexShrink: 0 }}
        >
          {isCollapsed ? '▶' : '▼'}
        </Typography>
        <Typography
          variant="caption"
          fontWeight={700}
          noWrap
          sx={{ flex: 1, fontSize: 12, color: 'text.primary' }}
        >
          {group.name}
        </Typography>
        <Chip
          size="small"
          label={total}
          sx={{ height: 16, fontSize: 10, minWidth: 20, flexShrink: 0 }}
        />
      </Box>
    );
  };

  const renderGroupHeaderRight = (group: ProjectGroup) => {
    const bar = getGroupBarProps(group);
    return (
      <Box
        key={`gh-right-${group.key}`}
        sx={{
          height: GROUP_H,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.selected',
          cursor: 'pointer',
        }}
        onClick={() => toggleGroup(group.key)}
      >
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
          <Box
            sx={{
              position: 'absolute',
              left: bar.left + 2,
              width: Math.max(bar.width, 6),
              top: '50%',
              transform: 'translateY(-50%)',
              height: 8,
              bgcolor: '#78909c',
              opacity: 0.45,
              borderRadius: '3px',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    );
  };

  const renderTaskLeftCell = (task: OwnerWorkspaceTask, rowIndex: number, dimmed?: boolean) => {
    const assignee = userOptions.find((u) => u.id === task.assignee_id);
    return (
      <Box
        key={`tl-${task.id}`}
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
          bgcolor: rowIndex % 2 === 0 ? 'transparent' : 'action.hover',
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

  const renderTaskBar = (task: OwnerWorkspaceTask, rowIndex: number, dimmed?: boolean) => {
    const bar = getBarProps(task);
    return (
      <Box
        key={`tb-${task.id}`}
        sx={{
          height: ROW_H,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: rowIndex % 2 === 0 ? 'transparent' : 'action.hover',
          opacity: dimmed ? 0.6 : 1,
        }}
      >
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

  // ─── Build flat row list ──────────────────────────────────────────────────────

  const isEmpty = tasks.length === 0;

  // Rows for left and right columns, built together so they stay in sync
  type LeftRow =
    | { kind: 'groupHeader'; group: ProjectGroup }
    | { kind: 'task'; task: OwnerWorkspaceTask; rowIndex: number; dimmed: boolean };

  const rows = useMemo<LeftRow[]>(() => {
    const result: LeftRow[] = [];
    let rowIndex = 0;

    for (const group of projectGroups) {
      result.push({ kind: 'groupHeader', group });

      if (!collapsedKeys.has(group.key)) {
        for (const task of group.tasksWithDates) {
          result.push({ kind: 'task', task, rowIndex: rowIndex++, dimmed: false });
        }
        for (const task of group.tasksNoDates) {
          result.push({ kind: 'task', task, rowIndex: rowIndex++, dimmed: true });
        }
      }
    }

    return result;
  }, [projectGroups, collapsedKeys]);

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

        {/* Expand / collapse all */}
        {projectGroups.length > 1 && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Развернуть все">
              <span>
                <IconButton size="small" onClick={expandAll} disabled={collapsedKeys.size === 0}>
                  <UnfoldMoreIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Свернуть все">
              <span>
                <IconButton size="small" onClick={collapseAll} disabled={collapsedKeys.size === allKeys.length}>
                  <UnfoldLessIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}

        <ToggleButtonGroup size="small" value={scale} exclusive onChange={handleScaleChange}>
          <ToggleButton value="days" sx={{ px: 1.5, fontSize: 12 }}>По дням</ToggleButton>
          <ToggleButton value="weeks" sx={{ px: 1.5, fontSize: 12 }}>Обзор</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* ── Header (sticky) ── */}
      <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 4 }}>
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
            ЗАДАЧА / ПРОЕКТ
          </Typography>
        </Box>

        <Box ref={headerScrollRef} sx={{ flex: 1, overflow: 'hidden' }}>
          <Box sx={{ width: totalWidth }}>
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
      <Box sx={{ display: 'flex', maxHeight: 600, overflowY: 'auto' }}>
        {/* Left fixed column */}
        <Box sx={{ width: LEFT_W, flexShrink: 0 }}>
          {isEmpty && (
            <Box sx={{ px: 2, py: 4 }}>
              <Typography color="text.secondary" variant="body2">Нет задач</Typography>
            </Box>
          )}
          {rows.map((row) =>
            row.kind === 'groupHeader'
              ? renderGroupHeaderLeft(row.group)
              : renderTaskLeftCell(row.task, row.rowIndex, row.dimmed)
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
            {rows.map((row) =>
              row.kind === 'groupHeader'
                ? renderGroupHeaderRight(row.group)
                : renderTaskBar(row.task, row.rowIndex, row.dimmed)
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
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Затемнённые — задачи без дат
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
