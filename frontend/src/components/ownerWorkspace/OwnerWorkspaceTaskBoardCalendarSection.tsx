import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
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
import { ownerWorkspaceApi } from '../../services/api';

import type { OwnerWorkspaceMeeting, OwnerWorkspaceTask, OwnerWorkspaceWorkZone } from '../../types';

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
  zones: OwnerWorkspaceWorkZone[];
  onZonesChange: (zones: OwnerWorkspaceWorkZone[]) => void;
  meetings: OwnerWorkspaceMeeting[];
  canCreateMeeting: boolean;
  onMeetingsChange: (meetings: OwnerWorkspaceMeeting[]) => void;
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
  zones,
  onZonesChange,
  meetings,
  canCreateMeeting,
  onMeetingsChange,
}: OwnerWorkspaceTaskBoardCalendarSectionProps) {
  const [calendarMode, setCalendarMode] = React.useState<'day' | 'week' | 'month'>('month');
  const [zoneDialogOpen, setZoneDialogOpen] = React.useState(false);
  const [zoneName, setZoneName] = React.useState('');
  const [zoneWeekday, setZoneWeekday] = React.useState('0');
  const [zoneStart, setZoneStart] = React.useState('09:00');
  const [zoneEnd, setZoneEnd] = React.useState('13:00');
  const [zoneColor, setZoneColor] = React.useState('#4F46E5');
  const [selectedZone, setSelectedZone] = React.useState('');
  const [meetingDialogOpen, setMeetingDialogOpen] = React.useState(false);
  const [meetingSaving, setMeetingSaving] = React.useState(false);
  const [meetingTitle, setMeetingTitle] = React.useState('');
  const [meetingDate, setMeetingDate] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [meetingTime, setMeetingTime] = React.useState('10:00');
  const [meetingType, setMeetingType] = React.useState<'online' | 'offline'>('online');
  const [meetingPlace, setMeetingPlace] = React.useState('');
  const activeZone = React.useMemo(() => {
    const now = new Date();
    const weekday = (now.getDay() + 6) % 7;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return zones.find((zone) => {
      if (zone.weekday !== weekday) return false;
      const [sh, sm] = zone.start_time.split(':').map(Number);
      const [eh, em] = zone.end_time.split(':').map(Number);
      return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
    }) || null;
  }, [zones]);
  const visibleZone = selectedZone ? zones.find((zone) => zone.name === selectedZone) : activeZone;
  const filteredTasks = visibleZone
    ? tasks.filter((task) => (task.tags || []).includes(`zone:${visibleZone.name}`))
    : tasks;
  const filteredTasksByDay = React.useMemo(() => {
    if (!visibleZone) return tasksByDeadlineDay;
    const map = new Map<string, OwnerWorkspaceTask[]>();
    filteredTasks.forEach((task) => {
      if (!task.deadline_at) return;
      const key = String(task.deadline_at).slice(0, 10);
      map.set(key, [...(map.get(key) || []), task]);
    });
    return map;
  }, [filteredTasks, tasksByDeadlineDay, visibleZone]);
  const meetingsByDay = React.useMemo(() => {
    const map = new Map<string, OwnerWorkspaceMeeting[]>();
    meetings.forEach((meeting) => {
      if (meeting.status === 'cancelled') return;
      map.set(meeting.meeting_date, [...(map.get(meeting.meeting_date) || []), meeting]);
    });
    return map;
  }, [meetings]);
  const openMeetingDialog = (date = format(new Date(), 'yyyy-MM-dd')) => {
    setMeetingDate(date);
    setMeetingTitle('');
    setMeetingTime('10:00');
    setMeetingType('online');
    setMeetingPlace('');
    setMeetingDialogOpen(true);
  };
  const saveMeeting = async () => {
    if (!meetingTitle.trim() || !meetingDate || !meetingTime) return;
    setMeetingSaving(true);
    try {
      const created = await ownerWorkspaceApi.createMeeting({
        title: meetingTitle.trim(),
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        meeting_type: meetingType,
        ...(meetingType === 'offline' ? { address: meetingPlace.trim() || null } : { online_url: meetingPlace.trim() || null }),
      });
      onMeetingsChange([...meetings, created]);
      setMeetingDialogOpen(false);
    } finally {
      setMeetingSaving(false);
    }
  };
  const addZone = () => {
    const name = zoneName.trim();
    if (!name || !zoneStart || !zoneEnd) return;
    onZonesChange([...zones, { id: `${Date.now()}`, name, color: zoneColor, weekday: Number(zoneWeekday), start_time: zoneStart, end_time: zoneEnd }]);
    setSelectedZone(name);
    setZoneName('');
    setZoneColor('#4F46E5');
    setZoneDialogOpen(false);
  };

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
            {visibleZone && <Chip size="small" label={`Зона: ${visibleZone.name}`} sx={{ bgcolor: visibleZone.color, color: '#fff', fontWeight: 700 }} />}
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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }} alignItems={{ sm: 'center' }}>
          <TextField select size="small" label="Показывать задачи зоны" value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} sx={{ minWidth: 240 }}>
            <MenuItem value="">{activeZone ? `Текущая: ${activeZone.name}` : 'Все зоны'}</MenuItem>
            {zones.map((zone) => <MenuItem key={zone.id} value={zone.name}>{zone.name} · {weekdaysShort[zone.weekday]} {zone.start_time}–{zone.end_time}</MenuItem>)}
          </TextField>
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => setZoneDialogOpen(true)}>Добавить зону</Button>
          {canCreateMeeting && <Button size="small" startIcon={<EventIcon />} variant="contained" onClick={() => openMeetingDialog()}>Встреча</Button>}
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
            const dayTasks = filteredTasksByDay.get(key) || [];
            const inMonth = calendarMode === 'month' ? isSameMonth(day, calendarMonth) : true;
            return (
              <Box
                key={key}
                sx={{
                  minHeight: 100,
                  border: '1px solid',
                  borderColor: 'divider',
                  ...(visibleZone ? { borderTop: `4px solid ${visibleZone.color}` } : {}),
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
                <Stack spacing={0.5} sx={{ mt: 0.5, minWidth: 0 }}>
                  {(meetingsByDay.get(key) || []).map((meeting) => (
                    <Chip
                      key={`meeting-${meeting.id}`}
                      size="small"
                      color="primary"
                      icon={<EventIcon sx={{ fontSize: 14 }} />}
                      label={`${meeting.meeting_time?.slice(0, 5) || ''} ${meeting.title}`}
                      sx={{ height: 24, maxWidth: '100%', justifyContent: 'flex-start', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                    />
                  ))}
                  {dayTasks.slice(0, 4).map((task) => (
                    <Chip
                      key={task.id}
                      size="small"
                      color={isTaskOverdue(task) ? 'error' : 'default'}
                      variant={isTaskOverdue(task) ? 'filled' : 'outlined'}
                      label={task.title}
                      onClick={() => void onOpenTask(task)}
                      sx={{ height: 24, maxWidth: '100%', justifyContent: 'flex-start', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
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
      <Dialog open={zoneDialogOpen} onClose={() => setZoneDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новая зона работы</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField autoFocus size="small" label="Название зоны" placeholder="Продажи" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          <TextField select size="small" label="День недели" value={zoneWeekday} onChange={(e) => setZoneWeekday(e.target.value)}>
            {weekdaysShort.map((day, index) => <MenuItem key={day} value={String(index)}>{day}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField type="color" size="small" label="Цвет зоны" value={zoneColor} onChange={(e) => setZoneColor(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 130 }} />
            <Typography variant="caption" color="text.secondary">Цвет будет использоваться в календаре и таймере.</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField type="time" size="small" label="С" value={zoneStart} onChange={(e) => setZoneStart(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField type="time" size="small" label="До" value={zoneEnd} onChange={(e) => setZoneEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setZoneDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={addZone} disabled={!zoneName.trim()}>Создать</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={meetingDialogOpen} onClose={() => setMeetingDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новая встреча</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField autoFocus required label="Название" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <TextField required type="date" label="Дата" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField required type="time" label="Время" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <TextField select label="Формат" value={meetingType} onChange={(e) => setMeetingType(e.target.value as 'online' | 'offline')}>
            <MenuItem value="online">Онлайн</MenuItem>
            <MenuItem value="offline">Офлайн</MenuItem>
          </TextField>
          <TextField label={meetingType === 'online' ? 'Ссылка на встречу' : 'Место встречи'} value={meetingPlace} onChange={(e) => setMeetingPlace(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMeetingDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveMeeting()} disabled={meetingSaving || !meetingTitle.trim()}>Создать</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
