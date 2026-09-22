import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, List, ListItemText, Menu, MenuItem, Paper, Select,
  Snackbar, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { MoreVert as MoreVertIcon, Publish as PublishIcon, UnpublishedOutlined as UnpublishIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import {
  CODELAB_CHILD_STRUCTURAL_TYPE, CODELAB_STRUCTURAL_LABEL, CodelabCourse, CodelabCourseAnalytics,
  CodelabLearningItem, CodelabLoginEvent, CodelabStructuralType, CodelabSubmissionReview,
  CodelabSystemStatus, CodelabUser, codelabStudioApi as api,
} from '../services/codelabApi';

const STRUCTURAL_TYPE_SET = new Set<string>(['module', 'submodule', 'topic', 'subtopic']);

function findNode(nodes: CodelabLearningItem[], id: number): CodelabLearningItem | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/** Узел дерева курса — рекурсивный, с меню действий (добавить дочерний
 * узел/материал/задачу, редактировать, архивировать, удалить). Иерархия
 * жёсткая (Модуль → Подмодуль → Тема → Подтема, app/services/tree_rules.py
 * в Codelab) — дочерний структурный уровень для узла вычисляется таблицей
 * CODELAB_CHILD_STRUCTURAL_TYPE; контент (материал/задача) можно добавить
 * на любом структурном уровне, но не под самим материалом/задачей. */
function TreeItemRow({ item, depth, onAddChild, onEdit, onArchive, onDelete }: {
  item: CodelabLearningItem;
  depth: number;
  onAddChild: (parentId: number, type: string) => void;
  onEdit: (item: CodelabLearningItem) => void;
  onArchive: (item: CodelabLearningItem) => void;
  onDelete: (item: CodelabLearningItem) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const isStructural = STRUCTURAL_TYPE_SET.has(item.type);
  const childStructType = isStructural ? CODELAB_CHILD_STRUCTURAL_TYPE[item.type as CodelabStructuralType] : null;
  const close = () => setAnchorEl(null);

  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 1.5 + depth * 3, pr: 1, py: 1, opacity: item.is_archived ? 0.5 : 1 }}>
        <Chip
          size="small"
          label={isStructural ? CODELAB_STRUCTURAL_LABEL[item.type as CodelabStructuralType] : item.type}
          color={isStructural ? 'primary' : 'default'}
          variant={isStructural ? 'filled' : 'outlined'}
        />
        <Typography sx={{ flex: 1 }}>{item.title}</Typography>
        {item.is_archived && <Chip size="small" label="в архиве" />}
        <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close}>
          {isStructural && childStructType && (
            <MenuItem onClick={() => { onAddChild(item.id, childStructType); close(); }}>
              + {CODELAB_STRUCTURAL_LABEL[childStructType]}
            </MenuItem>
          )}
          {isStructural && <MenuItem onClick={() => { onAddChild(item.id, 'theory'); close(); }}>+ Материал</MenuItem>}
          {isStructural && <MenuItem onClick={() => { onAddChild(item.id, 'task'); close(); }}>+ Задача</MenuItem>}
          {isStructural && <Divider />}
          <MenuItem onClick={() => { onEdit(item); close(); }}>Редактировать</MenuItem>
          <MenuItem onClick={() => { onArchive(item); close(); }}>{item.is_archived ? 'Разархивировать' : 'Архивировать'}</MenuItem>
          <MenuItem onClick={() => { onDelete(item); close(); }} sx={{ color: 'error.main' }}>Удалить</MenuItem>
        </Menu>
      </Stack>
      {item.children.map((child) => (
        <TreeItemRow key={child.id} item={child} depth={depth + 1} onAddChild={onAddChild} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />
      ))}
    </Box>
  );
}

type Toast = { msg: string; err?: boolean } | null;
type TabKey = 'courses' | 'submissions' | 'analytics' | 'status';

/** Студия методиста (создание/публикация курсов), кабинет преподавателя
 * (просмотр и оценка посылок), аналитика курса и эксплуатационный статус
 * (ADM-004, только admin/owner) — всё через прокси в Codelab, из своего
 * аккаунта портала, по образцу PixelForge/Kodex (см. README интеграции). */
export default function CodelabStudioPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'codelab.manage');
  const isAdmin = ['admin', 'owner'].includes(getEffectiveRole(user) || '');
  const [tab, setTab] = useState<TabKey>(canManage ? 'courses' : 'submissions');
  const [toast, setToast] = useState<Toast>(null);

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Codelab</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {canManage && <Tab value="courses" label="Курсы" />}
          <Tab value="submissions" label="Посылки учеников" />
          <Tab value="analytics" label="Аналитика" />
          {isAdmin && <Tab value="status" label="Статус" />}
        </Tabs>
        {tab === 'courses' && canManage && <CoursesTab onToast={setToast} />}
        {tab === 'submissions' && <SubmissionsTab onToast={setToast} />}
        {tab === 'analytics' && <AnalyticsTab onToast={setToast} />}
        {tab === 'status' && isAdmin && <StatusTab onToast={setToast} />}
      </Box>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.err ? 'error' : 'success'}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Layout>
  );
}

// ─────────────────────────── Курсы (методист) ───────────────────────────

interface NodeDialogState {
  type: string; // module|submodule|topic|subtopic|theory|task
  parentId: number | null;
  editing?: CodelabLearningItem; // задано — режим редактирования, иначе создание
}

function CoursesTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [selected, setSelected] = useState<CodelabCourse | null>(null);
  const [tree, setTree] = useState<CodelabLearningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState | null>(null);
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeContent, setNodeContent] = useState('');
  const [testsText, setTestsText] = useState('2 3=>5');
  const [deleteTarget, setDeleteTarget] = useState<CodelabLearningItem | null>(null);

  const loadCourses = () => api.listCourses().then(setCourses).catch((e) => onToast({ msg: e.message, err: true }));

  useEffect(() => { loadCourses(); }, []);

  const selectCourse = async (c: CodelabCourse) => {
    setSelected(c);
    setLoading(true);
    try {
      setTree(await api.getTree(c.id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => { if (selected) selectCourse(selected); };

  const createCourse = async () => {
    try {
      const course = await api.createCourse({ title: newTitle });
      setCreateOpen(false);
      setNewTitle('');
      onToast({ msg: 'Курс создан' });
      await loadCourses();
      selectCourse(course);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const openCreate = (parentId: number | null, type: string) => {
    setNodeDialog({ parentId, type });
    setNodeTitle('');
    setNodeContent('');
    setTestsText('2 3=>5');
  };

  const openEdit = (item: CodelabLearningItem) => {
    setNodeDialog({ parentId: item.parent_id, type: item.type, editing: item });
    setNodeTitle(item.title);
    setNodeContent(item.content || '');
  };

  const siblingCount = (parentId: number | null): number => {
    const siblings = parentId === null ? tree : findNode(tree, parentId)?.children ?? [];
    return siblings.length;
  };

  const saveNode = async () => {
    if (!selected || !nodeDialog) return;
    try {
      if (nodeDialog.editing) {
        const patch: Record<string, unknown> = { title: nodeTitle };
        if (nodeDialog.type === 'theory') patch.content = nodeContent;
        await api.updateItem(nodeDialog.editing.id, patch);
        onToast({ msg: 'Сохранено' });
      } else if (nodeDialog.type === 'task') {
        const tests = testsText.split('\n').filter(Boolean).map((line) => {
          const [input, expected] = line.split('=>');
          return { input: `${(input || '').trim()}\n`, expected: `${(expected || '').trim()}\n` };
        });
        const task = await api.createTask(selected.id, { title: nodeTitle, tests });
        await api.createItem(selected.id, {
          type: 'task', title: nodeTitle, problem_revision_id: task.id,
          parent_id: nodeDialog.parentId, position: siblingCount(nodeDialog.parentId),
        });
        onToast({ msg: 'Задача добавлена' });
      } else {
        await api.createItem(selected.id, {
          type: nodeDialog.type,
          title: nodeTitle,
          content: nodeDialog.type === 'theory' ? nodeContent : undefined,
          parent_id: nodeDialog.parentId,
          position: siblingCount(nodeDialog.parentId),
        });
        onToast({ msg: 'Добавлено' });
      }
      setNodeDialog(null);
      refresh();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const toggleArchive = async (item: CodelabLearningItem) => {
    try {
      await api.archiveItem(item.id, !item.is_archived);
      onToast({ msg: item.is_archived ? 'Разархивировано' : 'Архивировано' });
      refresh();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteItem(deleteTarget.id);
      onToast({ msg: 'Удалено' });
      setDeleteTarget(null);
      refresh();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const publish = async () => {
    if (!selected) return;
    try {
      const updated = await api.publishCourse(selected.id);
      onToast({ msg: 'Курс опубликован' });
      setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const unpublish = async () => {
    if (!selected) return;
    try {
      const updated = await api.unpublishCourse(selected.id);
      onToast({ msg: 'Курс снят с публикации' });
      setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2">Курсы</Typography>
          <Button size="small" onClick={() => setCreateOpen(true)}>+ Новый</Button>
        </Stack>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {courses.map((c) => (
            <Card
              key={c.id}
              variant="outlined"
              sx={{
                width: 220,
                borderColor: selected?.id === c.id ? 'primary.main' : undefined,
                borderWidth: selected?.id === c.id ? 2 : 1,
              }}
            >
              <CardActionArea onClick={() => selectCourse(c)} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" noWrap title={c.title} sx={{ mb: 1 }}>{c.title}</Typography>
                  <Chip size="small" label={c.status} color={c.status === 'published' ? 'success' : 'default'} />
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
          <Card
            variant="outlined"
            sx={{ width: 220, borderStyle: 'dashed', display: 'flex' }}
          >
            <CardActionArea onClick={() => setCreateOpen(true)} sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
              <Typography color="text.secondary">+ Новый курс</Typography>
            </CardActionArea>
          </Card>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {!selected && <Typography color="text.secondary">Выберите курс сверху или создайте новый.</Typography>}
        {selected && (
          <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">{selected.title}</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => openCreate(null, 'module')}>+ Модуль</Button>
                <Button size="small" variant="outlined" onClick={() => openCreate(null, 'theory')}>+ Материал</Button>
                <Button size="small" variant="outlined" onClick={() => openCreate(null, 'task')}>+ Задача</Button>
                {selected.status === 'published' ? (
                  <Button size="small" startIcon={<UnpublishIcon />} onClick={unpublish}>Снять с публикации</Button>
                ) : (
                  <Button size="small" variant="contained" startIcon={<PublishIcon />} onClick={publish}>Опубликовать</Button>
                )}
              </Stack>
            </Stack>

            {loading ? <CircularProgress size={24} /> : (
              <Paper variant="outlined">
                {tree.map((item) => (
                  <TreeItemRow
                    key={item.id}
                    item={item} depth={0}
                    onAddChild={openCreate} onEdit={openEdit} onArchive={toggleArchive} onDelete={setDeleteTarget}
                  />
                ))}
                {tree.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>В черновике пока пусто.</Typography>}
              </Paper>
            )}
          </>
        )}
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>Новый курс</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={!newTitle.trim()} onClick={createCourse}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!nodeDialog && (nodeDialog.type !== 'task' || !!nodeDialog.editing)} onClose={() => setNodeDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {nodeDialog?.editing ? 'Редактирование' : STRUCTURAL_TYPE_SET.has(nodeDialog?.type || '')
            ? `Новый узел «${CODELAB_STRUCTURAL_LABEL[nodeDialog?.type as CodelabStructuralType]}»`
            : 'Новый материал'}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Заголовок" value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          {nodeDialog?.type === 'theory' && (
            <TextField fullWidth multiline rows={6} label="Текст (Markdown)" value={nodeContent} onChange={(e) => setNodeContent(e.target.value)} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!nodeTitle.trim()} onClick={saveNode}>{nodeDialog?.editing ? 'Сохранить' : 'Добавить'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={nodeDialog?.type === 'task' && !nodeDialog.editing} onClose={() => setNodeDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Новая задача (Python, stdin/stdout)</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField
            fullWidth multiline rows={5} label="Тесты — по одному на строку: вход=>ожидаемый вывод"
            value={testsText} onChange={(e) => setTestsText(e.target.value)} helperText="Пример: 2 3=>5"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!nodeTitle.trim()} onClick={saveNode}>Добавить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Удалить «{deleteTarget?.title}»?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Вместе с этим узлом безвозвратно удалятся все вложенные материалы, задачи и подпункты. Отменить нельзя.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Отмена</Button>
          <Button variant="contained" color="error" onClick={confirmDelete}>Удалить</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ────────────────────── Посылки учеников (преподаватель) ──────────────────────

function SubmissionsTab({ onToast }: { onToast: (t: Toast) => void }) {
  const { user } = useAuth();
  const canRerun = hasPermission(user, 'codelab.manage'); // TASK-007 — авторское действие, не тренеру
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [submissions, setSubmissions] = useState<CodelabSubmissionReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState<CodelabSubmissionReview | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeComment, setGradeComment] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.listCourses()
      .then((cs) => setCourses(cs.filter((c) => c.status === 'published')))
      .catch((e) => onToast({ msg: e.message, err: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSubmissions = async (id: number) => {
    setLoading(true);
    setSelected(new Set());
    try {
      setSubmissions(await api.listSubmissions(id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rerunSelected = async () => {
    if (!courseId || selected.size === 0) return;
    try {
      const res = await api.rerunSubmissions(courseId, Array.from(selected));
      onToast({ msg: `Поставлено в очередь: ${res.requeued}` });
      loadSubmissions(courseId);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const submitGrade = async () => {
    if (!grading || !courseId) return;
    try {
      await api.gradeSubmission(courseId, grading.submission_id, Number(gradeScore), gradeComment);
      onToast({ msg: 'Оценка сохранена' });
      setGrading(null);
      if (courseId) loadSubmissions(courseId);
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  return (
    <Box>
      <Select
        size="small"
        displayEmpty
        value={courseId}
        onChange={(e) => {
          const id = e.target.value as number;
          setCourseId(id);
          loadSubmissions(id);
        }}
        sx={{ minWidth: 260, mb: 2 }}
      >
        <MenuItem value="" disabled>Выберите опубликованный курс</MenuItem>
        {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
      </Select>

      {canRerun && courseId && (
        <Button
          size="small"
          variant="outlined"
          disabled={selected.size === 0}
          onClick={rerunSelected}
          sx={{ ml: 2, mb: 2 }}
        >
          Перепроверить выбранные ({selected.size})
        </Button>
      )}

      {loading ? <CircularProgress size={24} /> : courseId && (
        <Table size="small">
          <TableHead>
            <TableRow>
              {canRerun && <TableCell padding="checkbox" />}
              <TableCell>Ученик</TableCell>
              <TableCell>Задача</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Балл</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.map((s) => (
              <TableRow key={s.submission_id}>
                {canRerun && (
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(s.submission_id)} onChange={() => toggleSelected(s.submission_id)} />
                  </TableCell>
                )}
                <TableCell>{s.student_full_name}</TableCell>
                <TableCell>{s.item_title}</TableCell>
                <TableCell>{s.verdict || s.status}</TableCell>
                <TableCell>
                  {s.manual_score_override !== null ? `${s.manual_score_override} (ручная)` : s.score ?? '—'}
                  {s.manual_comment && (
                    <Typography variant="caption" color="text.secondary" display="block">{s.manual_comment}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={() => { setGrading(s); setGradeScore(String(s.score ?? '')); setGradeComment(''); }}>
                    Оценить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {submissions.length === 0 && (
              <TableRow><TableCell colSpan={canRerun ? 6 : 5}><Typography variant="caption" color="text.secondary">Посылок пока нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!grading} onClose={() => setGrading(null)} fullWidth maxWidth="sm">
        <DialogTitle>Ручная оценка — {grading?.student_full_name}</DialogTitle>
        <DialogContent>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, maxHeight: 200, overflow: 'auto' }}>
            <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {grading?.code}
            </Typography>
          </Paper>
          <TextField
            fullWidth type="number" label="Балл" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} sx={{ mb: 2 }}
          />
          <TextField
            fullWidth multiline rows={3} label="Комментарий (обязателен)" value={gradeComment}
            onChange={(e) => setGradeComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGrading(null)}>Отмена</Button>
          <Button variant="contained" disabled={!gradeComment.trim() || gradeScore === ''} onClick={submitGrade}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─────────────────────────── Аналитика (ANA-001/002/005) ───────────────────────

function AnalyticsTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [courses, setCourses] = useState<CodelabCourse[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [data, setData] = useState<CodelabCourseAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listCourses()
      .then((cs) => setCourses(cs.filter((c) => c.status === 'published')))
      .catch((e) => onToast({ msg: e.message, err: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: number) => {
    setCourseId(id);
    setLoading(true);
    try {
      setData(await api.getAnalytics(id));
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Select
        size="small"
        displayEmpty
        value={courseId}
        onChange={(e) => load(e.target.value as number)}
        sx={{ minWidth: 260, mb: 2 }}
      >
        <MenuItem value="" disabled>Выберите опубликованный курс</MenuItem>
        {courses.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
      </Select>

      {loading && <CircularProgress size={24} />}

      {data && !loading && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Данные на {new Date(data.generated_at).toLocaleString('ru-RU')}
          </Typography>

          <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 3 }}>
            {[
              ['Зачислено', data.overview.enrolled_count],
              ['Завершили', `${data.overview.completed_count} (${data.overview.completion_percent}%)`],
              ['Средний балл', data.overview.avg_score],
              ['Медианный балл', data.overview.median_score],
              ['Всего попыток', data.overview.total_attempts],
              ['Просрочено', data.overview.overdue_count],
            ].map(([label, value]) => (
              <Paper key={label as string} variant="outlined" sx={{ p: 1.5, minWidth: 140 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h6">{value}</Typography>
              </Paper>
            ))}
          </Stack>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Рейтинг задач по сложности</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Задача</TableCell>
                <TableCell>Пытались</TableCell>
                <TableCell>Решили</TableCell>
                <TableCell>Отказались</TableCell>
                <TableCell>Доля ошибок</TableCell>
                <TableCell>Ср. попыток до решения</TableCell>
                <TableCell>Частая ошибка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tasks.map((t) => (
                <TableRow key={t.item_id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>{t.students_attempted}</TableCell>
                  <TableCell>{t.students_solved}</TableCell>
                  <TableCell>{t.students_not_attempted}</TableCell>
                  <TableCell>{t.failure_rate_percent}%</TableCell>
                  <TableCell>{t.avg_attempts_to_solve ?? '—'}</TableCell>
                  <TableCell>{t.most_common_failure_verdict ?? '—'}</TableCell>
                </TableRow>
              ))}
              {data.tasks.length === 0 && (
                <TableRow><TableCell colSpan={7}><Typography variant="caption" color="text.secondary">Нет задач или посылок</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  );
}

// ─────────────────────────── Статус (ADM-004, admin/owner) ─────────────────────

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} ГБ`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} МБ`;
}

function StatusTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [status, setStatus] = useState<CodelabSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getSystemStatus()
      .then(setStatus)
      .catch((e) => onToast({ msg: e.message, err: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <CircularProgress size={24} />;
  if (!status) return null;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Данные на {new Date(status.generated_at).toLocaleString('ru-RU')}
        </Typography>
        <Button size="small" onClick={load}>Обновить</Button>
      </Stack>

      {status.queue.worker_likely_stalled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Самая старая посылка в очереди ждёт больше 5 минут — похоже, воркер (`python -m app.worker`) не запущен или завис.
        </Alert>
      )}
      {status.errors.system_errors_last_24h > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Системных ошибок проверки за 24 часа: {status.errors.system_errors_last_24h}.
        </Alert>
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap">
        {[
          ['В очереди', status.queue.queued_count],
          ['Выполняется', status.queue.running_count],
          ['Ожидание самой старой (сек)', status.queue.oldest_queued_age_seconds ?? '—'],
          ['Ошибок за 24ч', status.errors.system_errors_last_24h],
          ['Загрузки на диске', formatBytes(status.storage.uploads_size_bytes)],
          ['Свободно места', formatBytes(status.storage.disk_free_bytes)],
        ].map(([label, value]) => (
          <Paper key={label as string} variant="outlined" sx={{ p: 1.5, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h6">{value}</Typography>
          </Paper>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />
      <UsersPanel onToast={onToast} />
    </Box>
  );
}

// ─────────────────────────── Пользователи Codelab (IAM-004, admin/owner) ────

function UsersPanel({ onToast }: { onToast: (t: Toast) => void }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<CodelabUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyFor, setHistoryFor] = useState<CodelabUser | null>(null);
  const [history, setHistory] = useState<CodelabLoginEvent[]>([]);

  const search = () => {
    setLoading(true);
    api.listUsers(q || undefined)
      .then(setUsers)
      .catch((e) => onToast({ msg: e.message, err: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBlocked = (u: CodelabUser) => {
    api.setUserBlocked(u.id, !u.is_blocked)
      .then((updated) => {
        setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        onToast({ msg: updated.is_blocked ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован' });
      })
      .catch((e) => onToast({ msg: e.message, err: true }));
  };

  const terminateSessions = (u: CodelabUser) => {
    api.terminateUserSessions(u.id)
      .then(() => onToast({ msg: 'Активные сессии завершены' }))
      .catch((e) => onToast({ msg: e.message, err: true }));
  };

  const openHistory = (u: CodelabUser) => {
    setHistoryFor(u);
    api.getUserLoginHistory(u.id)
      .then(setHistory)
      .catch((e) => onToast({ msg: e.message, err: true }));
  };

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Пользователи Codelab</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small" placeholder="Поиск по имени или external_ref" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Button size="small" onClick={search}>Найти</Button>
      </Stack>
      {loading ? <CircularProgress size={24} /> : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Имя</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Последний вход</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('ru-RU') : '—'}</TableCell>
                <TableCell>{u.is_blocked ? <Chip size="small" color="error" label="Заблокирован" /> : <Chip size="small" label="Активен" />}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openHistory(u)}>История входов</Button>
                  <Button size="small" onClick={() => terminateSessions(u)}>Завершить сессии</Button>
                  <Button size="small" color={u.is_blocked ? 'success' : 'error'} onClick={() => toggleBlocked(u)}>
                    {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!historyFor} onClose={() => setHistoryFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>История входов — {historyFor?.full_name}</DialogTitle>
        <DialogContent>
          {history.length === 0 ? (
            <Typography color="text.secondary">Входов не зафиксировано.</Typography>
          ) : (
            <List dense>
              {history.map((h, i) => (
                <ListItemText key={i} primary={new Date(h.created_at).toLocaleString('ru-RU')} />
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryFor(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
