/**
 * Диалог создания задачи Owner Workspace.
 * Дизайн: поля как на скриншоте + выбор шаблона.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import type { OwnerWorkspaceTaskTemplate, User } from '../../types';
import { ownerWorkspaceApi } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';
type TaskStatus = 'new' | 'in_progress' | 'on_review' | 'blocked';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

type RepeatFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';
type RepeatEndType = 'never' | 'after_count' | 'until_date';

interface RepeatSettings {
  enabled: boolean;
  frequency: RepeatFrequency;
  interval: number;
  days: number[];          // 0=Пн..6=Вс
  end_type: RepeatEndType;
  end_after_count?: number;
  end_until?: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string;
  status: string;
  priority: string;
  start_at?: string | null;
  deadline_at?: string | null;
  assignee_id?: number | null;
  watcher_ids?: number[];
  tags?: string[];
  checklist?: Array<{ text: string; done: boolean }>;
  effort_hours?: number | null;
  effort_minutes?: number | null;
  reminder_at?: string | null;
  repeat?: {
    enabled: boolean;
    frequency?: string;
    interval?: number;
    days?: number[];
    end_type?: string;
    end_after_count?: number;
    end_until?: string;
  } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskCreatePayload) => Promise<void>;
  projectName?: string;
  users?: User[];
  defaultProjectId?: number | null;
  availableTags?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  high:   { label: 'Высокий', color: '#EF4444' },
  medium: { label: 'Средний', color: '#22C55E' },
  low:    { label: 'Низкий',  color: '#EAB308' },
};

const STATUS_CONFIG: Record<TaskStatus, string> = {
  new:        'Новая',
  in_progress:'В работе',
  on_review:  'Ревью',
  blocked:    'Блокирована',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function avatarColor(id: number): string {
  const colors = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];
  return colors[id % colors.length];
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function completionPercent(
  title: string,
  description: string,
  priority: Priority,
  assigneeId: number | null,
  deadline: string,
  tags: string[],
  checklist: ChecklistItem[],
): number {
  let filled = 0;
  const total = 6;
  if (title.trim()) filled++;
  if (description.trim()) filled++;
  if (priority) filled++;
  if (assigneeId !== null) filled++;
  if (deadline) filled++;
  if (tags.length > 0 || checklist.length > 0) filled++;
  return Math.round((filled / total) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OwnerWorkspaceTaskCreateDialog({
  open,
  onClose,
  onSubmit,
  projectName,
  users = [],
  availableTags = [],
}: Props) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('new');
  const [priority, setPriority] = useState<Priority>('medium');
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [startDate, setStartDate] = useState('');
  const [reminderPreset, setReminderPreset] = useState<string>('');  // '30m'|'1h'|'3h'|'1d'|'custom'
  const [reminderCustom, setReminderCustom] = useState('');           // datetime-local value
  const [effortOpen, setEffortOpen] = useState(false);
  const [effortHours, setEffortHours] = useState('');
  const [effortMinutes, setEffortMinutes] = useState('');

  // Repeat/periodicity
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeat, setRepeat] = useState<RepeatSettings>({
    enabled: false,
    frequency: 'weekly',
    interval: 1,
    days: [],
    end_type: 'never',
  });

  // Template state
  const [templates, setTemplates] = useState<OwnerWorkspaceTaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);

  // Load templates when dialog opens
  useEffect(() => {
    if (!open) return;
    setTemplatesLoading(true);
    ownerWorkspaceApi.listTaskTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  }, [open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setTaskStatus('new'); setPriority('medium');
      setStartDate(''); setDeadline(''); setAssigneeId(null); setWatcherIds([]); setTags([]); setTagInput('');
      setReminderPreset(''); setReminderCustom('');
      setChecklist([]); setChecklistOpen(false); setNewCheckItem('');
      setEffortOpen(false); setEffortHours(''); setEffortMinutes('');
      setRepeatOpen(false); setRepeat({ enabled: false, frequency: 'weekly', interval: 1, days: [], end_type: 'never' });
      setSelectedTemplateId(''); setShowSaveTemplate(false); setSaveTemplateName('');
    }
  }, [open]);

  // Apply template
  const applyTemplate = useCallback((template: OwnerWorkspaceTaskTemplate) => {
    if (template.description) setDescription(template.description);
    if (template.priority) setPriority(template.priority as Priority);
    if (template.tags?.length) setTags(template.tags);
    if (template.checklist?.length) {
      setChecklist(template.checklist.map((item) => ({ id: uid(), text: item.text, done: false })));
      setChecklistOpen(true);
    }
    if (template.effort_hours != null) { setEffortHours(String(template.effort_hours)); setEffortOpen(true); }
    if (template.effort_minutes != null) setEffortMinutes(String(template.effort_minutes));
  }, []);

  const handleTemplateChange = (id: number | '') => {
    setSelectedTemplateId(id);
    if (id === '') return;
    const tpl = templates.find((t) => t.id === id);
    if (tpl) applyTemplate(tpl);
  };

  // Tags
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };
  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  // Checklist
  const addCheckItem = () => {
    const t = newCheckItem.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setNewCheckItem('');
  };
  const toggleCheckItem = (id: string) =>
    setChecklist((prev) => prev.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  const removeCheckItem = (id: string) =>
    setChecklist((prev) => prev.filter((item) => item.id !== id));

  // Save as template
  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      const created = await ownerWorkspaceApi.createTaskTemplate({
        name: saveTemplateName.trim(),
        description: description || null,
        priority: priority || null,
        tags,
        checklist: checklist.map(({ text }) => ({ text, done: false })),
        effort_hours: effortHours ? Number(effortHours) : null,
        effort_minutes: effortMinutes ? Number(effortMinutes) : null,
      });
      setTemplates((prev) => [...prev, created]);
      setSelectedTemplateId(created.id);
      setShowSaveTemplate(false);
      setSaveTemplateName('');
    } catch {}
    finally { setSavingTemplate(false); }
  };

  // Delete template
  const handleDeleteTemplate = async (id: number) => {
    try {
      await ownerWorkspaceApi.deleteTaskTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedTemplateId === id) setSelectedTemplateId('');
    } catch {}
  };

  // Submit
  // Compute reminder_at from preset or custom value
  const computedReminderAt = (() => {
    if (!reminderPreset) return null;
    if (reminderPreset === 'custom') {
      return reminderCustom ? new Date(reminderCustom).toISOString() : null;
    }
    const base = deadline ? new Date(deadline) : null;
    if (!base || isNaN(base.getTime())) return null;
    const offsetMs: Record<string, number> = {
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '3h': 3 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    const offset = offsetMs[reminderPreset];
    return offset ? new Date(base.getTime() - offset).toISOString() : null;
  })();

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        status: taskStatus,
        priority,
        start_at: startDate ? new Date(startDate).toISOString() : null,
        deadline_at: deadline ? new Date(deadline).toISOString() : null,
        assignee_id: assigneeId,
        watcher_ids: watcherIds.length ? watcherIds : undefined,
        tags: tags.length ? tags : undefined,
        checklist: checklist.length ? checklist.map(({ text, done }) => ({ text, done })) : undefined,
        effort_hours: effortHours ? Number(effortHours) : null,
        effort_minutes: effortMinutes ? Number(effortMinutes) : null,
        reminder_at: computedReminderAt,
        repeat: repeat.enabled ? {
          enabled: true,
          frequency: repeat.frequency,
          interval: repeat.interval,
          days: repeat.days.length ? repeat.days : undefined,
          end_type: repeat.end_type,
          end_after_count: repeat.end_type === 'after_count' ? repeat.end_after_count : undefined,
          end_until: repeat.end_type === 'until_date' ? repeat.end_until : undefined,
        } : null,
      });
      onClose();
    } catch {}
    finally { setSubmitting(false); }
  };

  const completion = completionPercent(title, description, priority, assigneeId, deadline, tags, checklist);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CheckBoxOutlineBlankIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
            <Typography fontWeight={700} fontSize="1.1rem">Новая задача</Typography>
          </Stack>
          {projectName && (
            <Typography variant="caption" color="text.secondary">Проект: {projectName}</Typography>
          )}
        </Box>

        <Divider />

        <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Template selector */}
          <Stack direction="row" spacing={1} alignItems="center">
            <BookmarkBorderIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
            <Select
              size="small"
              displayEmpty
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value as number | '')}
              sx={{ flex: 1, fontSize: '0.875rem' }}
              renderValue={(val) => {
                if (!val) return <Typography color="text.secondary" variant="body2">Из шаблона...</Typography>;
                const tpl = templates.find((t) => t.id === val);
                return tpl?.name ?? '';
              }}
              disabled={templatesLoading}
            >
              <MenuItem value=""><em>Без шаблона</em></MenuItem>
              {templates.map((tpl) => (
                <MenuItem key={tpl.id} value={tpl.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{tpl.name}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); void handleDeleteTemplate(tpl.id); }}
                    sx={{ ml: 1, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))}
            </Select>
            <Tooltip title="Сохранить текущие поля как шаблон">
              <IconButton size="small" onClick={() => setShowSaveTemplate((v) => !v)}>
                <SaveAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Save template form */}
          <Collapse in={showSaveTemplate}>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                placeholder="Название шаблона"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSaveTemplate()}
              />
              <Button size="small" variant="contained" onClick={() => void handleSaveTemplate()} disabled={savingTemplate || !saveTemplateName.trim()}>
                {savingTemplate ? <CircularProgress size={16} /> : 'Сохранить'}
              </Button>
            </Stack>
          </Collapse>

          {/* Title */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
              Название <span style={{ color: '#EF4444' }}>*</span>
            </Typography>
            <TextField
              fullWidth
              placeholder="Кратко и конкретно — что нужно сделать?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              variant="outlined"
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              autoFocus
            />
          </Box>

          {/* Description */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
              Описание
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={3}
              placeholder="Контекст, ожидаемый результат, ограничения..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              variant="outlined"
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>

          {/* Status */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
              Статус
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => (
                <Box
                  key={s}
                  onClick={() => setTaskStatus(s)}
                  sx={{
                    px: 2, py: 0.75,
                    borderRadius: 5,
                    border: '1.5px solid',
                    borderColor: taskStatus === s ? 'primary.main' : 'divider',
                    bgcolor: taskStatus === s ? 'primary.main' : 'transparent',
                    color: taskStatus === s ? 'white' : 'text.primary',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: taskStatus === s ? 600 : 400,
                    userSelect: 'none',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  {STATUS_CONFIG[s]}
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Priority + Deadline */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                Приоритет
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => (
                  <Box
                    key={p}
                    onClick={() => setPriority(p)}
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                      px: 1.5, py: 0.75,
                      borderRadius: 2,
                      border: '1.5px solid',
                      borderColor: priority === p ? PRIORITY_CONFIG[p].color : 'divider',
                      bgcolor: priority === p ? `${PRIORITY_CONFIG[p].color}15` : 'transparent',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'all 0.15s',
                      minWidth: 70,
                    }}
                  >
                    <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: PRIORITY_CONFIG[p].color, border: priority === p ? 'none' : '1.5px solid', borderColor: PRIORITY_CONFIG[p].color }} />
                    <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: priority === p ? 600 : 400 }}>
                      {PRIORITY_CONFIG[p].label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Stack spacing={1.5} sx={{ flex: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
                  Начало
                </Typography>
                <TextField
                  type="date"
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: '100%', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
                  Дедлайн
                </Typography>
                <TextField
                  type="date"
                  size="small"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: '100%', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Box>
            </Stack>
          </Stack>

          {/* Assignee */}
          {users.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                Исполнитель
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                {users.map((u) => (
                  <Tooltip key={u.id} title={u.full_name}>
                    <Avatar
                      onClick={() => setAssigneeId(assigneeId === u.id ? null : u.id)}
                      sx={{
                        width: 36, height: 36,
                        bgcolor: assigneeId === u.id ? avatarColor(u.id) : '#E2E8F0',
                        color: assigneeId === u.id ? 'white' : '#64748B',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: assigneeId === u.id ? `2.5px solid ${avatarColor(u.id)}` : 'none',
                        outlineOffset: 2,
                        transition: 'all 0.15s',
                      }}
                    >
                      {initials(u.full_name)}
                    </Avatar>
                  </Tooltip>
                ))}
                <Typography
                  variant="caption"
                  color={assigneeId === null ? 'text.secondary' : 'text.disabled'}
                  sx={{ cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
                  onClick={() => setAssigneeId(null)}
                >
                  {assigneeId === null ? 'не выбран' : '✕'}
                </Typography>
              </Stack>
            </Box>
          )}

          {/* Watchers */}
          {users.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                Наблюдатели
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mb: 0.75, display: 'block' }}>
                Получают уведомления об обновлениях и комментариях, но не являются исполнителями
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                {users.map((u) => {
                  const isWatcher = watcherIds.includes(u.id);
                  return (
                    <Tooltip key={u.id} title={`${u.full_name}${isWatcher ? ' (наблюдатель)' : ''}`}>
                      <Avatar
                        onClick={() => setWatcherIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )}
                        sx={{
                          width: 36, height: 36,
                          bgcolor: isWatcher ? '#8B5CF6' : '#E2E8F0',
                          color: isWatcher ? 'white' : '#64748B',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          outline: isWatcher ? '2.5px solid #8B5CF6' : 'none',
                          outlineOffset: 2,
                          transition: 'all 0.15s',
                          filter: u.id === assigneeId ? 'opacity(0.4)' : 'none',
                        }}
                      >
                        {initials(u.full_name)}
                      </Avatar>
                    </Tooltip>
                  );
                })}
                {watcherIds.length > 0 && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ cursor: 'pointer', '&:hover': { color: 'error.main' } }}
                    onClick={() => setWatcherIds([])}
                  >
                    ✕ очистить
                  </Typography>
                )}
              </Stack>
            </Box>
          )}

          {/* Tags */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
              Теги
            </Typography>
            <Box
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, minHeight: 48, cursor: 'text' }}
              onClick={() => tagInputRef.current?.focus()}
            >
              <Stack direction="row" flexWrap="wrap" spacing={0.5} useFlexGap alignItems="center">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => removeTag(tag)}
                    sx={{ fontSize: '0.78rem' }}
                  />
                ))}
                {availableTags.filter((t) => !tags.includes(t)).length > 0 && (
                  <Select
                    size="small"
                    displayEmpty
                    value=""
                    onChange={(e) => { const v = e.target.value as string; if (v && !tags.includes(v)) setTags((p) => [...p, v]); }}
                    sx={{ fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.3, px: 1 }, '& fieldset': { border: 'none' } }}
                    renderValue={() => <Typography color="text.disabled" variant="caption">+ тег</Typography>}
                  >
                    {availableTags.filter((t) => !tags.includes(t)).map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: '0.85rem' }}>{t}</MenuItem>
                    ))}
                  </Select>
                )}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder={tags.length === 0 ? 'добавить тег...' : ''}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', minWidth: 80, flex: 1 }}
                />
              </Stack>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>Enter — добавить тег</Typography>
          </Box>

          {/* Checklist */}
          <Box>
            <Box
              onClick={() => setChecklistOpen((v) => !v)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', '&:hover': { opacity: 0.8 }, py: 1, px: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
            >
              {checklistOpen ? <CheckBoxIcon sx={{ fontSize: 18, color: 'primary.main' }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
              <Typography variant="body2" fontWeight={500}>Чеклист подзадач</Typography>
              {checklist.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  ({checklist.filter((i) => i.done).length}/{checklist.length})
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              {checklistOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </Box>
            <Collapse in={checklistOpen}>
              <Box sx={{ mt: 1, pl: 1 }}>
                {checklist.map((item) => (
                  <Stack key={item.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                    <IconButton size="small" onClick={() => toggleCheckItem(item.id)}>
                      {item.done ? <CheckBoxIcon fontSize="small" color="primary" /> : <CheckBoxOutlineBlankIcon fontSize="small" />}
                    </IconButton>
                    <Typography variant="body2" sx={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'text.disabled' : 'text.primary' }}>
                      {item.text}
                    </Typography>
                    <IconButton size="small" onClick={() => removeCheckItem(item.id)} sx={{ opacity: 0.4, '&:hover': { opacity: 1, color: 'error.main' } }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Новый пункт..."
                    value={newCheckItem}
                    onChange={(e) => setNewCheckItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  />
                  <IconButton size="small" onClick={addCheckItem} disabled={!newCheckItem.trim()}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            </Collapse>
          </Box>

          {/* Effort */}
          <Box>
            <Box
              onClick={() => setEffortOpen((v) => !v)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', '&:hover': { opacity: 0.8 }, py: 1, px: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
            >
              {effortOpen ? <CheckBoxIcon sx={{ fontSize: 18, color: 'primary.main' }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
              <Typography variant="body2" fontWeight={500}>Оценка трудозатрат</Typography>
              {(effortHours || effortMinutes) && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  {effortHours ? `${effortHours}ч` : ''}{effortMinutes ? ` ${effortMinutes}м` : ''}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              {effortOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </Box>
            <Collapse in={effortOpen}>
              <Stack direction="row" spacing={2} sx={{ mt: 1, pl: 1 }}>
                <TextField
                  size="small"
                  label="Часы"
                  type="number"
                  value={effortHours}
                  onChange={(e) => setEffortHours(e.target.value)}
                  inputProps={{ min: 0, max: 999 }}
                  sx={{ width: 100, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  size="small"
                  label="Минуты"
                  type="number"
                  value={effortMinutes}
                  onChange={(e) => setEffortMinutes(e.target.value)}
                  inputProps={{ min: 0, max: 59 }}
                  sx={{ width: 100, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Stack>
            </Collapse>
          </Box>

          {/* Reminder */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5} sx={{ textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
              <NotificationsNoneIcon sx={{ fontSize: 13, mr: 0.5, verticalAlign: 'middle' }} />
              Напоминание
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {[
                { key: '', label: 'Нет' },
                { key: '30m', label: 'За 30 мин' },
                { key: '1h', label: 'За 1 час' },
                { key: '3h', label: 'За 3 часа' },
                { key: '1d', label: 'За 1 день' },
                { key: 'custom', label: 'Своё время' },
              ].map(({ key, label }) => (
                <Box
                  key={key}
                  onClick={() => setReminderPreset(key)}
                  sx={{
                    px: 1.5, py: 0.5, borderRadius: 5, border: '1.5px solid',
                    borderColor: reminderPreset === key ? 'primary.main' : 'divider',
                    bgcolor: reminderPreset === key ? 'primary.main' : 'transparent',
                    color: reminderPreset === key ? 'white' : 'text.secondary',
                    cursor: 'pointer', fontSize: '0.78rem',
                    fontWeight: reminderPreset === key ? 600 : 400,
                    userSelect: 'none', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </Box>
              ))}
            </Stack>

            {reminderPreset && reminderPreset !== 'custom' && deadline && (
              <Typography variant="caption" color="text.secondary">
                Напоминание: {computedReminderAt
                  ? new Date(computedReminderAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'}
              </Typography>
            )}
            {reminderPreset === 'custom' && (
              <TextField
                size="small"
                type="datetime-local"
                label="Дата и время напоминания"
                value={reminderCustom}
                onChange={(e) => setReminderCustom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            )}
            {reminderPreset && !deadline && reminderPreset !== 'custom' && (
              <Typography variant="caption" color="warning.main">
                Укажите дедлайн, чтобы напоминание рассчиталось автоматически
              </Typography>
            )}
          </Box>

          {/* Periodicity / Repeat */}
          <Box>
            <Box
              onClick={() => setRepeatOpen((v) => !v)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', '&:hover': { opacity: 0.8 }, py: 1, px: 1.5, borderRadius: 2, border: '1px solid', borderColor: repeat.enabled ? 'primary.main' : 'divider', bgcolor: repeat.enabled ? 'primary.50' : 'transparent' }}
            >
              {repeat.enabled ? <CheckBoxIcon sx={{ fontSize: 18, color: 'primary.main' }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
              <Typography variant="body2" fontWeight={500}>Периодичность</Typography>
              {repeat.enabled && (
                <Typography variant="caption" color="primary.main" sx={{ ml: 0.5, fontWeight: 600 }}>
                  {repeat.frequency === 'daily' && `каждые ${repeat.interval} дн.`}
                  {repeat.frequency === 'weekly' && `каждые ${repeat.interval} нед.`}
                  {repeat.frequency === 'monthly' && `каждые ${repeat.interval} мес.`}
                  {repeat.frequency === 'custom' && `каждые ${repeat.interval} дн.`}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              {repeatOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </Box>
            <Collapse in={repeatOpen}>
              <Box sx={{ mt: 1.5, pl: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Enable toggle */}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary">Повторять задачу:</Typography>
                  <Box
                    onClick={() => setRepeat((r) => ({ ...r, enabled: !r.enabled }))}
                    sx={{ px: 2, py: 0.5, borderRadius: 5, border: '1.5px solid', borderColor: repeat.enabled ? 'primary.main' : 'divider', bgcolor: repeat.enabled ? 'primary.main' : 'transparent', color: repeat.enabled ? 'white' : 'text.secondary', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, userSelect: 'none' }}
                  >
                    {repeat.enabled ? 'Да' : 'Нет'}
                  </Box>
                </Stack>

                {repeat.enabled && (
                  <>
                    {/* Frequency */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>Частота:</Typography>
                      {(['daily', 'weekly', 'monthly', 'custom'] as RepeatFrequency[]).map((f) => (
                        <Box key={f} onClick={() => setRepeat((r) => ({ ...r, frequency: f }))}
                          sx={{ px: 1.5, py: 0.4, borderRadius: 5, border: '1.5px solid', borderColor: repeat.frequency === f ? 'primary.main' : 'divider', bgcolor: repeat.frequency === f ? 'primary.main' : 'transparent', color: repeat.frequency === f ? 'white' : 'text.secondary', cursor: 'pointer', fontSize: '0.78rem', fontWeight: repeat.frequency === f ? 600 : 400, userSelect: 'none' }}>
                          {f === 'daily' ? 'Ежедневно' : f === 'weekly' ? 'Еженедельно' : f === 'monthly' ? 'Ежемесячно' : 'Каждые N дней'}
                        </Box>
                      ))}
                    </Stack>

                    {/* Interval */}
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">Каждые:</Typography>
                      <TextField size="small" type="number" value={repeat.interval} onChange={(e) => setRepeat((r) => ({ ...r, interval: Math.max(1, Number(e.target.value)) }))}
                        inputProps={{ min: 1, max: 365 }} sx={{ width: 70, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                      <Typography variant="body2" color="text.secondary">
                        {repeat.frequency === 'daily' || repeat.frequency === 'custom' ? 'дн.' : repeat.frequency === 'weekly' ? 'нед.' : 'мес.'}
                      </Typography>
                    </Stack>

                    {/* Days of week for weekly */}
                    {repeat.frequency === 'weekly' && (
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Дни:</Typography>
                        {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d, i) => (
                          <Box key={i} onClick={() => setRepeat((r) => ({ ...r, days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i] }))}
                            sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid', borderColor: repeat.days.includes(i) ? 'primary.main' : 'divider', bgcolor: repeat.days.includes(i) ? 'primary.main' : 'transparent', color: repeat.days.includes(i) ? 'white' : 'text.secondary', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, userSelect: 'none' }}>
                            {d}
                          </Box>
                        ))}
                      </Stack>
                    )}

                    {/* End condition */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 70 }}>Конец:</Typography>
                      {(['never', 'after_count', 'until_date'] as RepeatEndType[]).map((et) => (
                        <Box key={et} onClick={() => setRepeat((r) => ({ ...r, end_type: et }))}
                          sx={{ px: 1.5, py: 0.4, borderRadius: 5, border: '1.5px solid', borderColor: repeat.end_type === et ? 'primary.main' : 'divider', bgcolor: repeat.end_type === et ? 'primary.main' : 'transparent', color: repeat.end_type === et ? 'white' : 'text.secondary', cursor: 'pointer', fontSize: '0.78rem', fontWeight: repeat.end_type === et ? 600 : 400, userSelect: 'none' }}>
                          {et === 'never' ? 'Никогда' : et === 'after_count' ? 'После N раз' : 'До даты'}
                        </Box>
                      ))}
                    </Stack>

                    {repeat.end_type === 'after_count' && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">Повторений:</Typography>
                        <TextField size="small" type="number" value={repeat.end_after_count ?? ''} onChange={(e) => setRepeat((r) => ({ ...r, end_after_count: Number(e.target.value) }))}
                          inputProps={{ min: 1 }} sx={{ width: 80, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                      </Stack>
                    )}
                    {repeat.end_type === 'until_date' && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" color="text.secondary">До:</Typography>
                        <TextField size="small" type="date" value={repeat.end_until ?? ''} onChange={(e) => setRepeat((r) => ({ ...r, end_until: e.target.value }))}
                          InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                      </Stack>
                    )}
                  </>
                )}
              </Box>
            </Collapse>
          </Box>

        </Box>

        <Divider />

        {/* Footer */}
        <Box sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60 }}>Заполнено</Typography>
            <LinearProgress
              variant="determinate"
              value={completion}
              sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#E2E8F0', '& .MuiLinearProgress-bar': { borderRadius: 3 } }}
            />
            <Typography variant="caption" color="text.secondary">{completion}%</Typography>
          </Stack>
          <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
            <Button variant="outlined" onClick={onClose} disabled={submitting} sx={{ borderRadius: 2 }}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleSubmit()}
              disabled={!title.trim() || submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />}
              sx={{ borderRadius: 2, minWidth: 150 }}
            >
              Создать задачу
            </Button>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
