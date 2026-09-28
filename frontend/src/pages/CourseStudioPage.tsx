import React, { useCallback, useEffect, useState } from 'react';
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
  IconButton,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward as DownIcon,
  ArrowUpward as UpIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
  Save as SaveIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import {
  courseStudioApi,
  CourseFull,
  CourseSummary,
  CourseLesson,
  CourseModule,
  CourseTopic,
  ImportPreview,
} from '../services/courseStudioApi';

// ─── Brand ───────────────────────────────────────────────────────────────────
const K = {
  void: '#05070a',
  surface: '#0d1117',
  surfaceUp: '#131a21',
  border: 'rgba(167,139,250,0.18)',
  accent: '#a78bfa',
  accentDim: '#7c5cbf',
  accentBg: 'rgba(167,139,250,0.08)',
  neonDim: '#00c98a',
  danger: '#ff3d54',
  text: '#ddeae7',
  textDim: '#7a9490',
  textFaint: '#3e5450',
  mono: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
};

// ─── Lesson editor ────────────────────────────────────────────────────────────
interface LessonRowProps {
  lesson: CourseLesson;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (l: CourseLesson) => void;
  onDelete: (id: number) => void;
  onMove?: (id: number, dir: 'up' | 'down') => void;
  saving: boolean;
  hideMove?: boolean;
}

function LessonRow({ lesson, isFirst, isLast, onUpdate, onDelete, onMove, saving, hideMove }: LessonRowProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(lesson);
  const [tab, setTab] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(lesson);
    setDirty(false);
  }, [lesson]);

  const change = (field: keyof CourseLesson, val: any) => {
    setDraft((d) => ({ ...d, [field]: val }));
    setDirty(true);
  };

  const save = () => {
    onUpdate({ ...draft });
    setDirty(false);
  };

  return (
    <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, overflow: 'hidden', bgcolor: K.surface }}>
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, gap: 1 }}>
        {!hideMove && onMove && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <IconButton size="small" disabled={isFirst || saving} onClick={() => onMove(lesson.id, 'up')} sx={{ p: 0.25, color: K.textFaint }}>
              <UpIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <IconButton size="small" disabled={isLast || saving} onClick={() => onMove(lesson.id, 'down')} sx={{ p: 0.25, color: K.textFaint }}>
              <DownIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        )}
        <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint, minWidth: 24 }}>
          {String(lesson.sort_order + 1).padStart(2, '0')}
        </Typography>
        <Typography sx={{ fontSize: 13, color: K.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lesson.title || <span style={{ color: K.textFaint, fontStyle: 'italic' }}>Без названия</span>}
        </Typography>
        {lesson.is_published ? (
          <Chip label="Опубликован" size="small" sx={{ fontSize: 10, height: 18, color: K.neonDim, bgcolor: 'rgba(0,201,138,0.1)' }} />
        ) : (
          <Chip label="Черновик" size="small" sx={{ fontSize: 10, height: 18, color: K.textFaint, bgcolor: 'rgba(62,84,80,0.2)' }} />
        )}
        <IconButton size="small" onClick={() => setOpen((v) => !v)} sx={{ color: K.textDim }}>
          {open ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </IconButton>
        <Tooltip title="Удалить урок">
          <IconButton size="small" disabled={saving} onClick={() => onDelete(lesson.id)} sx={{ color: K.textFaint, '&:hover': { color: K.danger } }}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Expanded editor */}
      {open && (
        <Box sx={{ borderTop: `1px solid ${K.border}`, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              label="Название урока"
              value={draft.title}
              onChange={(e) => change('title', e.target.value)}
              size="small"
              fullWidth
              sx={textFieldSx}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              <Typography sx={{ fontSize: 12, color: K.textDim }}>Опубликован</Typography>
              <Switch
                size="small"
                checked={draft.is_published}
                onChange={(e) => change('is_published', e.target.checked)}
                sx={{ '& .MuiSwitch-thumb': { bgcolor: draft.is_published ? K.accent : undefined } }}
              />
            </Box>
          </Box>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              minHeight: 32,
              borderBottom: `1px solid ${K.border}`,
              '& .MuiTab-root': { fontFamily: K.mono, fontSize: 11, minHeight: 32, color: K.textDim, textTransform: 'none', p: '6px 12px' },
              '& .Mui-selected': { color: K.accent },
              '& .MuiTabs-indicator': { bgcolor: K.accent },
            }}
          >
            <Tab label="Теория (лекция)" />
            <Tab label="Домашнее задание" />
          </Tabs>

          {tab === 0 && (
            <TextField
              multiline
              minRows={6}
              maxRows={20}
              placeholder="Markdown-текст лекционного материала…"
              value={draft.theory_md || ''}
              onChange={(e) => change('theory_md', e.target.value)}
              fullWidth
              sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12, lineHeight: 1.6 } }}
            />
          )}
          {tab === 1 && (
            <TextField
              multiline
              minRows={4}
              maxRows={12}
              placeholder="Markdown-текст домашнего задания…"
              value={draft.homework_md || ''}
              onChange={(e) => change('homework_md', e.target.value)}
              fullWidth
              sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12, lineHeight: 1.6 } }}
            />
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="small"
              disabled={!dirty || saving}
              onClick={save}
              startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
              sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 11, '&:hover': { bgcolor: K.accentDim }, '&:disabled': { opacity: 0.4 } }}
            >
              Сохранить урок
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Модуль / тема (программа обучения) ────────────────────────────────────────
const sectionLabelSx = {
  fontFamily: K.mono,
  fontSize: 10,
  color: K.textFaint,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
};

interface TopicBlockProps {
  topic: CourseTopic;
  onUpdateLesson: (l: CourseLesson) => void;
  onDeleteLesson: (id: number) => void;
  onAddLesson: (topicId: number) => void;
  saving: boolean;
}

function TopicBlock({ topic, onUpdateLesson, onDeleteLesson, onAddLesson, saving }: TopicBlockProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, color: K.accent, fontWeight: 600, flex: 1 }}>{topic.title}</Typography>
        <Button
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 12 }} />}
          onClick={() => onAddLesson(topic.id)}
          disabled={saving}
          sx={{ fontSize: 10, fontFamily: K.mono, color: K.accent, minWidth: 0, px: 1, height: 22 }}
        >
          Материал
        </Button>
      </Box>
      {topic.lessons.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: K.textFaint, fontStyle: 'italic', pl: 1 }}>Нет занятий</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {topic.lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              isFirst
              isLast
              hideMove
              onUpdate={onUpdateLesson}
              onDelete={onDeleteLesson}
              saving={saving}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

interface ModuleBlockProps {
  module: CourseModule;
  onUpdateLesson: (l: CourseLesson) => void;
  onDeleteLesson: (id: number) => void;
  onAddLesson: (topicId: number) => void;
  onDeleteModule: (id: number) => void;
  saving: boolean;
}

function ModuleBlock({ module, onUpdateLesson, onDeleteLesson, onAddLesson, onDeleteModule, saving }: ModuleBlockProps) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, bgcolor: K.surface, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, gap: 1 }}>
        <IconButton size="small" onClick={() => setOpen((v) => !v)} sx={{ color: K.textDim }}>
          {open ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </IconButton>
        <Typography sx={{ fontSize: 13, color: K.text, fontWeight: 700, flex: 1 }}>{module.title}</Typography>
        <Tooltip title="Удалить модуль">
          <IconButton size="small" disabled={saving} onClick={() => onDeleteModule(module.id)} sx={{ color: K.textFaint, '&:hover': { color: K.danger } }}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {open && (
        <Box sx={{ borderTop: `1px solid ${K.border}`, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {module.topics.map((topic) => (
            <TopicBlock key={topic.id} topic={topic} onUpdateLesson={onUpdateLesson} onDeleteLesson={onDeleteLesson} onAddLesson={onAddLesson} saving={saving} />
          ))}
          {module.submodules.map((sub) => (
            <Box key={sub.id} sx={{ pl: 2, borderLeft: `2px solid ${K.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontSize: 12, color: K.textDim, fontWeight: 600 }}>{sub.title}</Typography>
              {sub.topics.map((topic) => (
                <TopicBlock key={topic.id} topic={topic} onUpdateLesson={onUpdateLesson} onDeleteLesson={onDeleteLesson} onAddLesson={onAddLesson} saving={saving} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Импорт программы обучения из .docx ───────────────────────────────────────
function ImportPreviewTree({ preview }: { preview: ImportPreview }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 320, overflowY: 'auto', pr: 1 }}>
      {preview.modules.map((m, mi) => (
        <Box key={mi} sx={{ border: `1px solid ${K.border}`, borderRadius: 1, p: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: K.text, fontWeight: 700 }}>{m.title}</Typography>
          <Box sx={{ pl: 2, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {m.topics.map((t, ti) => (
              <Typography key={ti} sx={{ fontSize: 11, color: K.textDim }}>
                {t.title} — {t.lessons.length} {t.lessons.length === 1 ? 'занятие' : 'занятий'}
              </Typography>
            ))}
            {m.submodules.map((s, si) => (
              <Box key={si} sx={{ pl: 1.5, borderLeft: `2px solid ${K.border}` }}>
                <Typography sx={{ fontSize: 11, color: K.textDim, fontWeight: 600 }}>{s.title}</Typography>
                {s.topics.map((t, ti) => (
                  <Typography key={ti} sx={{ fontSize: 11, color: K.textFaint, pl: 1 }}>
                    {t.title} — {t.lessons.length} {t.lessons.length === 1 ? 'занятие' : 'занятий'}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface ImportProgramDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: number;
  onImported: () => void;
}

function ImportProgramDialog({ open, onClose, courseId, onImported }: ImportProgramDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);
    setLoading(true);
    try {
      const p = await courseStudioApi.previewImport(courseId, f);
      setPreview(p);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось разобрать файл');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      await courseStudioApi.commitImport(courseId, file);
      reset();
      onImported();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
      <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Импорт программы обучения (.docx)</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 11, color: K.textDim }}>
          Heading 1 — модуль, Heading 2 — подмодуль (необязателен), Heading 3 — тема, Heading 4 — занятие.
          Программа добавится к уже существующим модулям курса.
        </Typography>
        <Button
          component="label"
          variant="outlined"
          startIcon={<UploadFileIcon sx={{ fontSize: 16 }} />}
          sx={{ fontFamily: K.mono, fontSize: 12, color: K.accent, borderColor: K.border, alignSelf: 'flex-start' }}
        >
          {file ? file.name : 'Выбрать .docx файл'}
          <input
            type="file"
            accept=".docx"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </Button>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} sx={{ color: K.accent }} />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ fontFamily: K.mono, fontSize: 12 }}>{error}</Alert>
        )}

        {preview && (
          <>
            <Typography sx={{ fontSize: 11, color: K.textDim }}>
              Найдено: {preview.module_count} {preview.module_count === 1 ? 'модуль' : 'модулей'}, {preview.topic_count} тем, {preview.lesson_count} занятий
            </Typography>
            {preview.warnings.length > 0 && (
              <Alert severity="warning" sx={{ fontFamily: K.mono, fontSize: 11 }}>
                {preview.warnings.join('; ')}
              </Alert>
            )}
            <ImportPreviewTree preview={preview} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button onClick={() => { reset(); onClose(); }} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
        <Button
          variant="contained"
          disabled={!preview || importing}
          onClick={confirmImport}
          sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 12, '&:hover': { bgcolor: K.accentDim } }}
        >
          Импортировать
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── TextField style helper ───────────────────────────────────────────────────
const textFieldSx = {
  '& .MuiInputBase-root': { fontFamily: '"JetBrains Mono","SFMono-Regular",Consolas,monospace', fontSize: 13, bgcolor: '#0d1117' },
  '& .MuiInputLabel-root': { fontFamily: '"JetBrains Mono","SFMono-Regular",Consolas,monospace', fontSize: 13 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.2)' },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.4)' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
};

// ─── Course editor panel ──────────────────────────────────────────────────────
interface CourseEditorProps {
  courseId: number;
  onUpdated: (c: CourseSummary) => void;
  onDeleted: (id: number) => void;
}

function CourseEditor({ courseId, onUpdated, onDeleted }: CourseEditorProps) {
  const [course, setCourse] = useState<CourseFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [published, setPublished] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [delCourseDialog, setDelCourseDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [addTopicLessonId, setAddTopicLessonId] = useState<number | null>(null);
  const [newTopicLessonTitle, setNewTopicLessonTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await courseStudioApi.getCourse(courseId);
      setCourse(c);
      setTitle(c.title);
      setDesc(c.description || '');
      setPublished(c.is_published);
      setDirty(false);
    } catch {
      setToast({ msg: 'Не удалось загрузить курс', err: true });
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const saveCourse = async () => {
    setSaving(true);
    try {
      const updated = await courseStudioApi.updateCourse(courseId, { title, description: desc, is_published: published });
      setCourse(updated);
      setDirty(false);
      onUpdated({ id: updated.id, title: updated.title, description: updated.description, is_published: updated.is_published, sort_order: updated.sort_order, lesson_count: updated.lessons.length });
      setToast({ msg: 'Курс сохранён' });
    } catch {
      setToast({ msg: 'Ошибка сохранения', err: true });
    } finally {
      setSaving(false);
    }
  };

  const addLesson = async () => {
    if (!newLessonTitle.trim()) return;
    setSaving(true);
    try {
      const lesson = await courseStudioApi.createLesson(courseId, { title: newLessonTitle.trim() });
      setCourse((c) => c ? { ...c, lessons: [...c.lessons, lesson] } : c);
      setNewLessonTitle('');
      setAddDialog(false);
      setToast({ msg: 'Урок добавлен' });
    } catch {
      setToast({ msg: 'Ошибка создания урока', err: true });
    } finally {
      setSaving(false);
    }
  };

  const updateLesson = async (updated: CourseLesson) => {
    setSaving(true);
    try {
      const saved = await courseStudioApi.updateLesson(courseId, updated.id, {
        title: updated.title,
        theory_md: updated.theory_md || undefined,
        homework_md: updated.homework_md || undefined,
        is_published: updated.is_published,
      });
      setCourse((c) => c ? { ...c, lessons: c.lessons.map((l) => l.id === saved.id ? saved : l) } : c);
      setToast({ msg: 'Урок сохранён' });
    } catch {
      setToast({ msg: 'Ошибка сохранения урока', err: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteLesson = async (lessonId: number) => {
    setSaving(true);
    try {
      await courseStudioApi.deleteLesson(courseId, lessonId);
      setCourse((c) => c ? { ...c, lessons: c.lessons.filter((l) => l.id !== lessonId) } : c);
      setToast({ msg: 'Урок удалён' });
    } catch {
      setToast({ msg: 'Ошибка удаления', err: true });
    } finally {
      setSaving(false);
    }
  };

  const moveLesson = async (lessonId: number, dir: 'up' | 'down') => {
    setSaving(true);
    try {
      const lessons = await courseStudioApi.moveLesson(courseId, lessonId, dir);
      setCourse((c) => c ? { ...c, lessons } : c);
    } catch {
      setToast({ msg: 'Ошибка перемещения', err: true });
    } finally {
      setSaving(false);
    }
  };

  const updateTopicLesson = async (updated: CourseLesson) => {
    setSaving(true);
    try {
      await courseStudioApi.updateLesson(courseId, updated.id, {
        title: updated.title,
        theory_md: updated.theory_md || undefined,
        homework_md: updated.homework_md || undefined,
        is_published: updated.is_published,
      });
      await load();
      setToast({ msg: 'Занятие сохранено' });
    } catch {
      setToast({ msg: 'Ошибка сохранения занятия', err: true });
    } finally {
      setSaving(false);
    }
  };

  const addTopicLesson = async () => {
    if (addTopicLessonId === null || !newTopicLessonTitle.trim()) return;
    setSaving(true);
    try {
      await courseStudioApi.createLesson(courseId, { title: newTopicLessonTitle.trim(), topic_id: addTopicLessonId });
      await load();
      setNewTopicLessonTitle('');
      setAddTopicLessonId(null);
      setToast({ msg: 'Материал добавлен' });
    } catch {
      setToast({ msg: 'Ошибка добавления материала', err: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteTopicLesson = async (lessonId: number) => {
    setSaving(true);
    try {
      await courseStudioApi.deleteLesson(courseId, lessonId);
      await load();
      setToast({ msg: 'Занятие удалено' });
    } catch {
      setToast({ msg: 'Ошибка удаления занятия', err: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteModule = async (moduleId: number) => {
    setSaving(true);
    try {
      await courseStudioApi.deleteModule(courseId, moduleId);
      await load();
      setToast({ msg: 'Модуль удалён' });
    } catch {
      setToast({ msg: 'Ошибка удаления модуля', err: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteCourse = async () => {
    setSaving(true);
    try {
      await courseStudioApi.deleteCourse(courseId);
      onDeleted(courseId);
    } catch {
      setToast({ msg: 'Ошибка удаления курса', err: true });
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} sx={{ color: K.accent }} />
      </Box>
    );
  }

  if (!course) return null;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Course meta */}
      <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, p: 2.5, bgcolor: K.surface, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontFamily: K.mono, fontSize: 10, color: K.textFaint, letterSpacing: '0.2em', textTransform: 'uppercase', flex: 1 }}>
            Настройки курса
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, color: K.textDim }}>Опубликован</Typography>
            <Switch
              size="small"
              checked={published}
              onChange={(e) => { setPublished(e.target.checked); setDirty(true); }}
              sx={{ '& .MuiSwitch-thumb': { bgcolor: published ? K.accent : undefined } }}
            />
          </Box>
        </Box>
        <TextField
          label="Название курса"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          size="small"
          fullWidth
          sx={textFieldSx}
        />
        <TextField
          label="Описание курса"
          value={desc}
          onChange={(e) => { setDesc(e.target.value); setDirty(true); }}
          size="small"
          fullWidth
          multiline
          minRows={2}
          sx={textFieldSx}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="small"
            onClick={() => setDelCourseDialog(true)}
            sx={{ fontSize: 11, fontFamily: K.mono, color: K.textFaint, '&:hover': { color: K.danger } }}
          >
            Удалить курс
          </Button>
          <Button
            variant="contained"
            size="small"
            disabled={!dirty || saving}
            onClick={saveCourse}
            startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
            sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 11, '&:hover': { bgcolor: K.accentDim }, '&:disabled': { opacity: 0.4 } }}
          >
            Сохранить
          </Button>
        </Box>
      </Box>

      {/* Программа обучения (модули) */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={sectionLabelSx}>Программа обучения ({course.modules.length})</Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<UploadFileIcon sx={{ fontSize: 14 }} />}
            onClick={() => setImportDialog(true)}
            sx={{ fontSize: 11, fontFamily: K.mono, color: K.accent, border: `1px solid ${K.border}`, px: 1.5, height: 28 }}
          >
            Импортировать программу
          </Button>
        </Box>
        {course.modules.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', border: `1px dashed ${K.border}`, borderRadius: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>
              Программа ещё не импортирована. Загрузите .docx с модулями, темами и занятиями.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {course.modules.map((module) => (
              <ModuleBlock
                key={module.id}
                module={module}
                onUpdateLesson={updateTopicLesson}
                onDeleteLesson={deleteTopicLesson}
                onAddLesson={(topicId) => { setNewTopicLessonTitle(''); setAddTopicLessonId(topicId); }}
                onDeleteModule={deleteModule}
                saving={saving}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Занятия без темы (созданы вручную, без импорта) */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={sectionLabelSx}>
            Занятия без темы ({course.lessons.filter((l) => !l.topic_id).length})
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => { setNewLessonTitle(''); setAddDialog(true); }}
            sx={{ fontSize: 11, fontFamily: K.mono, color: K.accent, border: `1px solid ${K.border}`, px: 1.5, height: 28 }}
          >
            Добавить урок
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {course.lessons.filter((l) => !l.topic_id).length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', border: `1px dashed ${K.border}`, borderRadius: 1.5 }}>
              <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>
                Нет уроков. Добавьте первый урок с теорией и заданием.
              </Typography>
            </Box>
          ) : (
            course.lessons.filter((l) => !l.topic_id).map((lesson, i, arr) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                isFirst={i === 0}
                isLast={i === arr.length - 1}
                onUpdate={updateLesson}
                onDelete={deleteLesson}
                onMove={moveLesson}
                saving={saving}
              />
            ))
          )}
        </Box>
      </Box>

      <ImportProgramDialog
        open={importDialog}
        onClose={() => setImportDialog(false)}
        courseId={courseId}
        onImported={load}
      />

      {/* Add material to topic dialog */}
      <Dialog open={addTopicLessonId !== null} onClose={() => setAddTopicLessonId(null)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Новый материал в тему</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Название материала"
            value={newTopicLessonTitle}
            onChange={(e) => setNewTopicLessonTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTopicLesson(); }}
            size="small"
            sx={{ mt: 1, minWidth: 340, ...textFieldSx }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setAddTopicLessonId(null)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!newTopicLessonTitle.trim() || saving}
            onClick={addTopicLesson}
            sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 12, '&:hover': { bgcolor: K.accentDim } }}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add lesson dialog */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Новый урок</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Название урока"
            value={newLessonTitle}
            onChange={(e) => setNewLessonTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLesson(); }}
            size="small"
            sx={{ mt: 1, minWidth: 340, ...textFieldSx }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setAddDialog(false)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!newLessonTitle.trim() || saving}
            onClick={addLesson}
            sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 12, '&:hover': { bgcolor: K.accentDim } }}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete course dialog */}
      <Dialog open={delCourseDialog} onClose={() => setDelCourseDialog(false)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Удалить курс?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: K.textDim }}>
            Все уроки курса «{course.title}» будут безвозвратно удалены.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setDelCourseDialog(false)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={deleteCourse}
            sx={{ bgcolor: K.danger, color: '#fff', fontFamily: K.mono, fontSize: 12 }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)} sx={{ fontFamily: K.mono, fontSize: 12 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CourseStudioPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [createDialog, setCreateDialog] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await courseStudioApi.listCourses();
      setCourses(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    } catch {
      setToast({ msg: 'Ошибка загрузки курсов', err: true });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const createCourse = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await courseStudioApi.createCourse({ title: newTitle.trim() });
      const summary: CourseSummary = { id: created.id, title: created.title, description: created.description, is_published: created.is_published, sort_order: created.sort_order, lesson_count: 0 };
      setCourses((prev) => [...prev, summary]);
      setSelectedId(created.id);
      setNewTitle('');
      setCreateDialog(false);
    } catch {
      setToast({ msg: 'Ошибка создания курса', err: true });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdated = (updated: CourseSummary) => {
    setCourses((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  };

  const handleDeleted = (id: number) => {
    setCourses((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setSelectedId(next.length > 0 ? next[0].id : null);
      return next;
    });
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', bgcolor: K.void, fontFamily: K.mono }}>
      {/* Left sidebar — course list */}
      <Box sx={{ width: 260, flexShrink: 0, borderRight: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', bgcolor: K.surface }}>
        <Box sx={{ px: 2, py: 1.75, borderBottom: `1px solid ${K.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 16, color: K.accent }}>◈</span>
          <Typography sx={{ fontFamily: K.mono, fontSize: 12, fontWeight: 700, color: K.text, flex: 1 }}>Учебные курсы</Typography>
          <Tooltip title="Создать курс">
            <IconButton size="small" onClick={() => { setNewTitle(''); setCreateDialog(true); }} sx={{ color: K.accent, p: 0.5 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={20} sx={{ color: K.accent }} />
            </Box>
          ) : courses.length === 0 ? (
            <Box sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Нет курсов</Typography>
              <Button
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={() => { setNewTitle(''); setCreateDialog(true); }}
                sx={{ mt: 1.5, fontSize: 11, fontFamily: K.mono, color: K.accent, border: `1px solid ${K.border}`, px: 1.5, height: 28 }}
              >
                Создать первый
              </Button>
            </Box>
          ) : (
            courses.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.04)' }} />}
                <Box
                  onClick={() => setSelectedId(c.id)}
                  sx={{
                    px: 2, py: 1.5, cursor: 'pointer',
                    bgcolor: selectedId === c.id ? K.accentBg : 'transparent',
                    borderLeft: `3px solid ${selectedId === c.id ? K.accent : 'transparent'}`,
                    transition: 'all 0.12s',
                    '&:hover': { bgcolor: K.accentBg },
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: selectedId === c.id ? K.accent : K.text, fontWeight: selectedId === c.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography sx={{ fontSize: 10, color: K.textFaint }}>
                      {c.lesson_count} {c.lesson_count === 1 ? 'урок' : c.lesson_count < 5 ? 'урока' : 'уроков'}
                    </Typography>
                    {c.is_published && (
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: K.neonDim }} />
                    )}
                  </Box>
                </Box>
              </React.Fragment>
            ))
          )}
        </Box>
      </Box>

      {/* Right — editor */}
      {selectedId ? (
        <CourseEditor key={selectedId} courseId={selectedId} onUpdated={handleUpdated} onDeleted={handleDeleted} />
      ) : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.textFaint }}>
          <Typography sx={{ fontSize: 13, fontStyle: 'italic' }}>Выберите курс или создайте новый</Typography>
        </Box>
      )}

      {/* Create dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Новый курс</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Название курса"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createCourse(); }}
            size="small"
            sx={{ mt: 1, minWidth: 340, ...textFieldSx }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setCreateDialog(false)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!newTitle.trim() || creating}
            onClick={createCourse}
            sx={{ bgcolor: K.accent, color: '#fff', fontFamily: K.mono, fontSize: 12, '&:hover': { bgcolor: K.accentDim } }}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)} sx={{ fontFamily: K.mono, fontSize: 12 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
