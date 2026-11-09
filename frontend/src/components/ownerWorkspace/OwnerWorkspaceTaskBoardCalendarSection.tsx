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

import type { OwnerWorkspaceMeeting, OwnerWorkspaceRecurringSlot, OwnerWorkspaceTask, OwnerWorkspaceWorkZone, TrainerLessonSlot } from '../../types';

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';

type CalendarTimeEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  tone: 'task' | 'meeting' | 'slot' | 'lesson';
  onClick?: () => void;
};

type CalendarRecurringSlotDraft = {
  title: string;
  recurrence_type: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  weekdays: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
};

const calendarWeekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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
  recurringSlots: OwnerWorkspaceRecurringSlot[];
  trainerLessons: TrainerLessonSlot[];
  canCreateMeeting: boolean;
  onMeetingsChange: (meetings: OwnerWorkspaceMeeting[]) => void;
  onRecurringSlotsChange: (slots: OwnerWorkspaceRecurringSlot[]) => void;
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
  recurringSlots,
  trainerLessons,
  canCreateMeeting,
  onMeetingsChange,
  onRecurringSlotsChange,
}: OwnerWorkspaceTaskBoardCalendarSectionProps) {
  const [calendarMode, setCalendarMode] = React.useState<'day' | 'week' | 'month'>('week');
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
  const [meetingEditing, setMeetingEditing] = React.useState<OwnerWorkspaceMeeting | null>(null);
  const [slotDialogOpen, setSlotDialogOpen] = React.useState(false);
  const [slotEditing, setSlotEditing] = React.useState<OwnerWorkspaceRecurringSlot | null>(null);
  const [slotSaving, setSlotSaving] = React.useState(false);
  const [slotDraft, setSlotDraft] = React.useState<CalendarRecurringSlotDraft>({ title: '', recurrence_type: 'weekly', weekdays: [0], start_time: '09:00', end_time: '10:00', start_date: '', end_date: '' });
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
  const trainerLessonsByDay = React.useMemo(() => {
    const map = new Map<string, TrainerLessonSlot[]>();
    trainerLessons.forEach((lesson) => {
      if (lesson.is_cancelled) return;
      map.set(lesson.lesson_date, [...(map.get(lesson.lesson_date) || []), lesson]);
    });
    return map;
  }, [trainerLessons]);
  const recurringSlotsByDay = React.useMemo(() => {
    const map = new Map<string, OwnerWorkspaceRecurringSlot[]>();
    const rangeStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const rangeEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    const slotAppliesToDate = (slot: OwnerWorkspaceRecurringSlot, day: Date) => {
      if (!slot.is_active) return false;
      const dayKey = format(day, 'yyyy-MM-dd');
      if (slot.start_date && dayKey < slot.start_date) return false;
      if (slot.end_date && dayKey > slot.end_date) return false;
      const weekday = (day.getDay() + 6) % 7;
      if (slot.recurrence_type === 'daily') return true;
      if (slot.recurrence_type === 'weekdays') return weekday < 5;
      if (slot.recurrence_type === 'monthly') {
        if (slot.weekdays?.length) return slot.weekdays.includes(weekday);
        return Boolean(slot.start_date) && day.getDate() === Number(slot.start_date.slice(8, 10));
      }
      return slot.weekdays?.includes(weekday) ?? false;
    };
    eachDayOfInterval({ start: rangeStart, end: rangeEnd }).forEach((day) => {
      const matches = recurringSlots.filter((slot) => slotAppliesToDate(slot, day));
      if (matches.length) map.set(format(day, 'yyyy-MM-dd'), matches);
    });
    return map;
  }, [calendarMonth, recurringSlots]);
  const openMeetingDialog = (date = format(new Date(), 'yyyy-MM-dd')) => {
    setMeetingEditing(null);
    setMeetingDate(date);
    setMeetingTitle('');
    setMeetingTime('10:00');
    setMeetingType('online');
    setMeetingPlace('');
    setMeetingDialogOpen(true);
  };
  const openMeetingEditDialog = (meeting: OwnerWorkspaceMeeting) => {
    setMeetingEditing(meeting);
    setMeetingDate(meeting.meeting_date);
    setMeetingTitle(meeting.title);
    setMeetingTime(String(meeting.meeting_time || '').slice(0, 5));
    setMeetingType(meeting.meeting_type === 'offline' ? 'offline' : 'online');
    setMeetingPlace(meeting.meeting_type === 'offline' ? (meeting.address || '') : (meeting.online_url || ''));
    setMeetingDialogOpen(true);
  };
  const saveMeeting = async () => {
    if (!meetingTitle.trim() || !meetingDate || !meetingTime) return;
    setMeetingSaving(true);
    try {
      const payload = {
        title: meetingTitle.trim(),
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        meeting_type: meetingType,
        ...(meetingType === 'offline' ? { address: meetingPlace.trim() || null } : { online_url: meetingPlace.trim() || null }),
      };
      const saved = meetingEditing
        ? await ownerWorkspaceApi.updateMeeting(meetingEditing.id, payload)
        : await ownerWorkspaceApi.createMeeting(payload);
      onMeetingsChange(meetingEditing ? meetings.map((meeting) => meeting.id === saved.id ? saved : meeting) : [...meetings, saved]);
      setMeetingDialogOpen(false);
    } finally {
      setMeetingSaving(false);
    }
  };
  const deleteMeeting = async () => {
    if (!meetingEditing || !window.confirm(`Удалить встречу «${meetingEditing.title}»?`)) return;
    await ownerWorkspaceApi.deleteMeeting(meetingEditing.id);
    onMeetingsChange(meetings.filter((meeting) => meeting.id !== meetingEditing.id));
    setMeetingDialogOpen(false);
  };
  const openSlotEditDialog = (slot: OwnerWorkspaceRecurringSlot) => {
    setSlotEditing(slot);
    setSlotDraft({ title: slot.title, recurrence_type: (slot.recurrence_type as CalendarRecurringSlotDraft['recurrence_type']) || 'weekly', weekdays: slot.weekdays || [], start_time: String(slot.start_time).slice(0, 5), end_time: String(slot.end_time).slice(0, 5), start_date: slot.start_date || '', end_date: slot.end_date || '' });
    setSlotDialogOpen(true);
  };
  const saveSlot = async () => {
    if (!slotEditing || !slotDraft.title.trim() || !slotDraft.start_time || !slotDraft.end_time) return;
    setSlotSaving(true);
    try {
      const saved = await ownerWorkspaceApi.updateRecurringSlot(slotEditing.id, { title: slotDraft.title.trim(), recurrence_type: slotDraft.recurrence_type, weekdays: slotDraft.weekdays, start_time: slotDraft.start_time, end_time: slotDraft.end_time, start_date: slotDraft.start_date || null, end_date: slotDraft.end_date || null, is_active: true });
      onRecurringSlotsChange(recurringSlots.map((slot) => slot.id === saved.id ? saved : slot));
      setSlotDialogOpen(false);
    } finally { setSlotSaving(false); }
  };
  const deleteSlot = async () => {
    if (!slotEditing || !window.confirm(`Удалить слот «${slotEditing.title}»?`)) return;
    await ownerWorkspaceApi.deleteRecurringSlot(slotEditing.id);
    onRecurringSlotsChange(recurringSlots.filter((slot) => slot.id !== slotEditing.id));
    setSlotDialogOpen(false);
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

  const timeGridDays = calendarMode === 'day' ? [calendarMonth] : visibleDays;
  const timeGridRows = React.useMemo(
    () => Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`),
    []
  );
  const timeGridEventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarTimeEvent[]>();
    const add = (key: string, event: CalendarTimeEvent) => map.set(key, [...(map.get(key) || []), event]);
    const taskEndTime = (task: OwnerWorkspaceTask) => {
      const date = new Date(task.deadline_at || '');
      date.setMinutes(date.getMinutes() + 30);
      return format(date, 'HH:mm');
    };
    timeGridDays.forEach((day) => {
      const key = format(day, 'yyyy-MM-dd');
      (filteredTasksByDay.get(key) || []).forEach((task) => {
        if (!task.deadline_at) return;
        const date = new Date(task.deadline_at);
        add(key, { id: `task-${task.id}`, title: task.title, startTime: format(date, 'HH:mm'), endTime: taskEndTime(task), tone: 'task', onClick: () => void onOpenTask(task) });
      });
      (meetingsByDay.get(key) || []).forEach((meeting) => {
        const start = String(meeting.meeting_time || '').slice(0, 5);
        const [hour, minute] = start.split(':').map(Number);
        const end = `${String(Math.min(23, hour + 1)).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
        add(key, { id: `meeting-${meeting.id}`, title: meeting.title, startTime: start, endTime: end, tone: 'meeting', onClick: () => openMeetingEditDialog(meeting) });
      });
      (recurringSlotsByDay.get(key) || []).forEach((slot) => add(key, {
        id: `slot-${slot.id}`,
        title: slot.title,
        startTime: String(slot.start_time).slice(0, 5),
        endTime: String(slot.end_time).slice(0, 5),
        tone: 'slot',
        onClick: () => openSlotEditDialog(slot),
      }));
      (trainerLessonsByDay.get(key) || []).forEach((lesson) => add(key, {
        id: `lesson-${lesson.group_id}-${lesson.lesson_date}-${lesson.start_time}`,
        title: lesson.group_name,
        startTime: String(lesson.start_time).slice(0, 5),
        endTime: String(lesson.end_time).slice(0, 5),
        tone: 'lesson',
      }));
    });
    return map;
  }, [filteredTasksByDay, meetingsByDay, onOpenTask, openMeetingEditDialog, openSlotEditDialog, recurringSlotsByDay, timeGridDays, trainerLessonsByDay]);

  const timeToMinutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  };
  const toneStyles: Record<CalendarTimeEvent['tone'], { backgroundColor: string; borderColor: string; color: string }> = {
    task: { backgroundColor: '#FDEBEC', borderColor: '#F4B8BD', color: '#A51D2D' },
    meeting: { backgroundColor: '#EEE5FF', borderColor: '#B98AF5', color: '#5B21B6' },
    slot: { backgroundColor: '#FFF4DE', borderColor: '#F0A000', color: '#8A4B00' },
    lesson: { backgroundColor: '#E2F6EE', borderColor: '#31B486', color: '#006B4F' },
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
        {calendarMode === 'month' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
            {weekdaysShort.map((weekday) => <Typography key={weekday} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600 }}>{weekday}</Typography>)}
            {visibleDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayTasks = filteredTasksByDay.get(key) || [];
              const inMonth = isSameMonth(day, calendarMonth);
              return <Box key={key} sx={{ minHeight: 100, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, bgcolor: inMonth ? 'background.paper' : 'action.hover', opacity: inMonth ? 1 : 0.65 }}>
                <Typography variant="caption" sx={{ fontWeight: isToday(day) ? 700 : 500, color: isToday(day) ? 'primary.main' : 'text.primary' }}>{format(day, 'd')}</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5, minWidth: 0 }}>
                  {(timeGridEventsByDay.get(key) || []).map((event) => <Chip key={event.id} size="small" variant="outlined" label={`${event.startTime} ${event.title}`} onClick={event.onClick} sx={{ height: 24, maxWidth: '100%', justifyContent: 'flex-start', borderColor: toneStyles[event.tone].borderColor, color: toneStyles[event.tone].color, bgcolor: toneStyles[event.tone].backgroundColor, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }} />)}
                </Stack>
              </Box>;
            })}
          </Box>
        ) : (
          <Box sx={{ overflow: 'auto', maxHeight: 720 }}>
            <Box sx={{ minWidth: calendarMode === 'day' ? 620 : 1180 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: `72px repeat(${timeGridDays.length}, minmax(160px, 1fr))`, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box />
                {timeGridDays.map((day) => <Typography key={format(day, 'yyyy-MM-dd')} variant="subtitle2" sx={{ textAlign: 'center', py: 1, borderLeft: '1px solid', borderColor: 'divider', color: isToday(day) ? 'primary.main' : 'text.primary' }}>{format(day, 'EEEE, d MMMM', { locale: ru })}</Typography>)}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: `72px repeat(${timeGridDays.length}, minmax(160px, 1fr))`, height: 96 * 24 }}>
                <Box sx={{ display: 'grid', gridTemplateRows: 'repeat(96, 24px)' }}>
                  {timeGridRows.map((time) => <Typography key={time} variant="caption" color="text.secondary" sx={{ pr: 1, textAlign: 'right', lineHeight: '24px', borderBottom: '1px solid', borderColor: 'divider' }}>{time}</Typography>)}
                </Box>
                {timeGridDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const events = timeGridEventsByDay.get(key) || [];
                  return <Box key={key} sx={{ position: 'relative', borderLeft: '1px solid', borderColor: 'divider', backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 23px, rgba(120, 120, 120, .18) 23px, rgba(120, 120, 120, .18) 24px)' }}>
                    {events.map((event, index) => {
                      const start = Math.max(0, Math.min(1439, timeToMinutes(event.startTime)));
                      let end = timeToMinutes(event.endTime);
                      if (end <= start) end = 1440;
                      const top = (start / 15) * 24;
                      const height = Math.max(24, ((end - start) / 15) * 24 - 2);
                      const sameStart = events.filter((candidate) => candidate.startTime === event.startTime);
                      const lane = sameStart.indexOf(event);
                      const lanes = Math.min(3, Math.max(1, sameStart.length));
                      return <Box key={`${event.id}-${index}`} onClick={event.onClick} sx={{ position: 'absolute', top, height, left: `calc(${(lane * 100) / lanes}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, overflow: 'hidden', p: 0.5, border: '1px solid', borderColor: toneStyles[event.tone].borderColor, borderRadius: 0.75, bgcolor: toneStyles[event.tone].backgroundColor, color: toneStyles[event.tone].color, cursor: event.onClick ? 'pointer' : 'default', zIndex: 1 }}><Typography variant="caption" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}>{event.startTime}–{event.endTime}</Typography><Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{event.title}</Typography></Box>;
                    })}
                  </Box>;
                })}
              </Box>
            </Box>
          </Box>
        )}
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
        <DialogTitle>{meetingEditing ? 'Редактировать встречу' : 'Новая встреча'}</DialogTitle>
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
          {meetingEditing && <Button color="error" onClick={() => void deleteMeeting()}>Удалить</Button>}
          <Button onClick={() => setMeetingDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveMeeting()} disabled={meetingSaving || !meetingTitle.trim()}>{meetingEditing ? 'Сохранить' : 'Создать'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={slotDialogOpen} onClose={() => setSlotDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать регулярный слот</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField required label="Название слота" value={slotDraft.title} onChange={(event) => setSlotDraft((draft) => ({ ...draft, title: event.target.value }))} />
          <TextField select label="Регулярность" value={slotDraft.recurrence_type} onChange={(event) => setSlotDraft((draft) => ({ ...draft, recurrence_type: event.target.value as CalendarRecurringSlotDraft['recurrence_type'] }))}>
            <MenuItem value="daily">Каждый день</MenuItem><MenuItem value="weekdays">По будням</MenuItem><MenuItem value="weekly">Еженедельно</MenuItem><MenuItem value="monthly">Ежемесячно</MenuItem>
          </TextField>
          {(slotDraft.recurrence_type === 'weekly' || slotDraft.recurrence_type === 'monthly') && <ToggleButtonGroup value={slotDraft.weekdays} onChange={(_, value) => setSlotDraft((draft) => ({ ...draft, weekdays: value }))} size="small" fullWidth>{calendarWeekdays.map((day, index) => <ToggleButton key={day} value={index}>{day}</ToggleButton>)}</ToggleButtonGroup>}
          <Stack direction="row" spacing={1}><TextField type="time" label="С" value={slotDraft.start_time} onChange={(event) => setSlotDraft((draft) => ({ ...draft, start_time: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /><TextField type="time" label="До" value={slotDraft.end_time} onChange={(event) => setSlotDraft((draft) => ({ ...draft, end_time: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /></Stack>
          <Stack direction="row" spacing={1}><TextField type="date" label="Начало действия" value={slotDraft.start_date} onChange={(event) => setSlotDraft((draft) => ({ ...draft, start_date: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /><TextField type="date" label="Окончание действия" value={slotDraft.end_date} onChange={(event) => setSlotDraft((draft) => ({ ...draft, end_date: event.target.value }))} InputLabelProps={{ shrink: true }} fullWidth /></Stack>
        </DialogContent>
        <DialogActions><Button color="error" onClick={() => void deleteSlot()}>Удалить</Button><Button onClick={() => setSlotDialogOpen(false)}>Отмена</Button><Button variant="contained" onClick={() => void saveSlot()} disabled={slotSaving || !slotDraft.title.trim()}>Сохранить</Button></DialogActions>
      </Dialog>
    </Card>
  );
}
