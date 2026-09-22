import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, List, ListItemText, Menu, MenuItem, Paper, Select,
  Snackbar, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Delete as DeleteIcon, MoreVert as MoreVertIcon, Publish as PublishIcon, UnpublishedOutlined as UnpublishIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import NotesEditor from '../components/NotesEditor';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import {
  CODELAB_CHILD_STRUCTURAL_TYPE, CODELAB_STRUCTURAL_LABEL, CodelabCourse, CodelabCourseAnalytics,
  CodelabLearningItem, CodelabLoginEvent, CodelabProblemTest, CodelabSnapStep, CodelabStructuralType, CodelabSubmissionReview,
  CodelabSystemStatus, CodelabUser, codelabStudioApi as api,
} from '../services/codelabApi';

const CONTENT_TYPE_LABEL: Record<string, string> = { theory: 'Материал', task: 'Задача', snap_task: 'Snap!' };

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
        <Stack
          direction="row" alignItems="center" spacing={1}
          onClick={() => onEdit(item)}
          sx={{ flex: 1, minWidth: 0, cursor: 'pointer', '&:hover .tree-item-title': { textDecoration: 'underline' } }}
        >
          <Chip
            size="small"
            label={isStructural ? CODELAB_STRUCTURAL_LABEL[item.type as CodelabStructuralType] : (CONTENT_TYPE_LABEL[item.type] || item.type)}
            color={isStructural ? 'primary' : 'default'}
            variant={isStructural ? 'filled' : 'outlined'}
          />
          <Typography className="tree-item-title" sx={{ flex: 1 }}>{item.title}</Typography>
        </Stack>
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
          {isStructural && <MenuItem onClick={() => { onAddChild(item.id, 'snap_task'); close(); }}>+ Snap-задание</MenuItem>}
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
  const [deleteTarget, setDeleteTarget] = useState<CodelabLearningItem | null>(null);
  const [showArchivedCourses, setShowArchivedCourses] = useState(false);
  const [courseMenuAnchor, setCourseMenuAnchor] = useState<{ el: HTMLElement; course: CodelabCourse } | null>(null);
  const [editCourse, setEditCourse] = useState<CodelabCourse | null>(null);
  const [editCourseTitle, setEditCourseTitle] = useState('');
  const [editCourseDescription, setEditCourseDescription] = useState('');
  const [deleteCourseTarget, setDeleteCourseTarget] = useState<CodelabCourse | null>(null);

  // Задача: условие (rich-text), формат ввода/вывода, тесты (видимые ученику —
  // примеры, скрытые — только для проверки решения).
  const [taskStatement, setTaskStatement] = useState('');
  const [taskInputFormat, setTaskInputFormat] = useState('');
  const [taskOutputFormat, setTaskOutputFormat] = useState('');
  const [taskTests, setTaskTests] = useState<CodelabProblemTest[]>([{ input: '', expected: '', is_hidden: false }]);
  const [taskLoading, setTaskLoading] = useState(false);

  // Snap!-задание: пошаговая инструкция слева (см. CoursePage в Codelab),
  // панель snap.tirskix.space справа — одна на весь элемент, шагами не управляется.
  const [snapSteps, setSnapSteps] = useState<CodelabSnapStep[]>([{ title: '', content: '' }]);

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
    setTaskStatement('');
    setTaskInputFormat('');
    setTaskOutputFormat('');
    setTaskTests([{ input: '', expected: '', is_hidden: false }]);
    setSnapSteps([{ title: '', content: '' }]);
  };

  const openEdit = (item: CodelabLearningItem) => {
    setNodeDialog({ parentId: item.parent_id, type: item.type, editing: item });
    setNodeTitle(item.title);
    setNodeContent(item.content || '');
    if (item.type === 'task' && item.problem_revision_id) {
      setTaskLoading(true);
      api.getTask(item.problem_revision_id)
        .then((task) => {
          setTaskStatement(task.statement || '');
          setTaskInputFormat(task.input_format || '');
          setTaskOutputFormat(task.output_format || '');
          setTaskTests(task.tests.length > 0 ? task.tests : [{ input: '', expected: '', is_hidden: false }]);
        })
        .catch((e: any) => onToast({ msg: e.message, err: true }))
        .finally(() => setTaskLoading(false));
    }
    if (item.type === 'snap_task') {
      setSnapSteps(item.steps && item.steps.length > 0 ? item.steps : [{ title: '', content: '' }]);
    }
  };

  const addTestRow = () => setTaskTests((prev) => [...prev, { input: '', expected: '', is_hidden: false }]);
  const removeTestRow = (i: number) => setTaskTests((prev) => prev.filter((_, idx) => idx !== i));
  const updateTestRow = (i: number, patch: Partial<CodelabProblemTest>) =>
    setTaskTests((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const addStepRow = () => setSnapSteps((prev) => [...prev, { title: '', content: '' }]);
  const removeStepRow = (i: number) => setSnapSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStepRow = (i: number, patch: Partial<CodelabSnapStep>) =>
    setSnapSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const siblingCount = (parentId: number | null): number => {
    const siblings = parentId === null ? tree : findNode(tree, parentId)?.children ?? [];
    return siblings.length;
  };

  const saveNode = async () => {
    if (!selected || !nodeDialog) return;
    try {
      if (nodeDialog.type === 'task') {
        const payload = {
          title: nodeTitle,
          statement: taskStatement,
          input_format: taskInputFormat.trim() || null,
          output_format: taskOutputFormat.trim() || null,
          tests: taskTests
            .filter((t) => t.input.trim() || t.expected.trim())
            .map((t) => ({ input: t.input, expected: t.expected, is_hidden: t.is_hidden })),
        };
        if (nodeDialog.editing) {
          if (nodeDialog.editing.problem_revision_id) {
            await api.updateTask(nodeDialog.editing.problem_revision_id, payload);
          }
          await api.updateItem(nodeDialog.editing.id, { title: nodeTitle });
          onToast({ msg: 'Задача обновлена' });
        } else {
          const task = await api.createTask(selected.id, payload);
          await api.createItem(selected.id, {
            type: 'task', title: nodeTitle, problem_revision_id: task.id,
            parent_id: nodeDialog.parentId, position: siblingCount(nodeDialog.parentId),
          });
          onToast({ msg: 'Задача добавлена' });
        }
      } else if (nodeDialog.type === 'snap_task') {
        const steps = snapSteps.filter((s) => s.title.trim() || s.content.trim());
        if (nodeDialog.editing) {
          await api.updateItem(nodeDialog.editing.id, { title: nodeTitle, steps });
          onToast({ msg: 'Snap-задание обновлено' });
        } else {
          await api.createItem(selected.id, {
            type: 'snap_task', title: nodeTitle, steps,
            parent_id: nodeDialog.parentId, position: siblingCount(nodeDialog.parentId),
          });
          onToast({ msg: 'Snap-задание добавлено' });
        }
      } else if (nodeDialog.editing) {
        const patch: Record<string, unknown> = { title: nodeTitle };
        if (nodeDialog.type === 'theory') patch.content = nodeContent;
        await api.updateItem(nodeDialog.editing.id, patch);
        onToast({ msg: 'Сохранено' });
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

  const openEditCourse = (c: CodelabCourse) => {
    setEditCourse(c);
    setEditCourseTitle(c.title);
    setEditCourseDescription(c.description || '');
  };

  const saveEditCourse = async () => {
    if (!editCourse) return;
    try {
      const updated = await api.updateCourse(editCourse.id, { title: editCourseTitle, description: editCourseDescription });
      onToast({ msg: 'Курс обновлён' });
      setEditCourse(null);
      if (selected?.id === updated.id) setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const toggleArchiveCourse = async (c: CodelabCourse) => {
    try {
      const updated = await api.archiveCourse(c.id, !c.is_archived);
      onToast({ msg: c.is_archived ? 'Курс разархивирован' : 'Курс архивирован' });
      if (selected?.id === updated.id) setSelected(updated);
      await loadCourses();
    } catch (e: any) {
      onToast({ msg: e.message, err: true });
    }
  };

  const confirmDeleteCourse = async () => {
    if (!deleteCourseTarget) return;
    try {
      await api.deleteCourse(deleteCourseTarget.id);
      onToast({ msg: 'Курс удалён' });
      if (selected?.id === deleteCourseTarget.id) { setSelected(null); setTree([]); }
      setDeleteCourseTarget(null);
      await loadCourses();
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
          <Stack direction="row" spacing={1} alignItems="center">
            {courses.some((c) => c.is_archived) && (
              <FormControlLabel
                control={<Checkbox size="small" checked={showArchivedCourses} onChange={(e) => setShowArchivedCourses(e.target.checked)} />}
                label={<Typography variant="body2">Показывать архивные</Typography>}
              />
            )}
            <Button size="small" onClick={() => setCreateOpen(true)}>+ Новый</Button>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {courses.filter((c) => showArchivedCourses || !c.is_archived).map((c) => (
            <Card
              key={c.id}
              variant="outlined"
              sx={{
                width: 220,
                borderColor: selected?.id === c.id ? 'primary.main' : undefined,
                borderWidth: selected?.id === c.id ? 2 : 1,
                opacity: c.is_archived ? 0.55 : 1,
                position: 'relative',
              }}
            >
              <IconButton
                size="small"
                onClick={(e) => setCourseMenuAnchor({ el: e.currentTarget, course: c })}
                sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <CardActionArea onClick={() => selectCourse(c)} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" noWrap title={c.title} sx={{ mb: 1, pr: 3 }}>{c.title}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Chip size="small" label={c.status} color={c.status === 'published' ? 'success' : 'default'} />
                    {c.is_archived && <Chip size="small" label="в архиве" />}
                  </Stack>
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

      <Menu anchorEl={courseMenuAnchor?.el} open={!!courseMenuAnchor} onClose={() => setCourseMenuAnchor(null)}>
        <MenuItem onClick={() => { openEditCourse(courseMenuAnchor!.course); setCourseMenuAnchor(null); }}>Редактировать</MenuItem>
        <MenuItem onClick={() => { toggleArchiveCourse(courseMenuAnchor!.course); setCourseMenuAnchor(null); }}>
          {courseMenuAnchor?.course.is_archived ? 'Разархивировать' : 'Архивировать'}
        </MenuItem>
        <MenuItem
          onClick={() => { setDeleteCourseTarget(courseMenuAnchor!.course); setCourseMenuAnchor(null); }}
          disabled={courseMenuAnchor?.course.status !== 'draft'}
          sx={{ color: 'error.main' }}
        >
          Удалить{courseMenuAnchor && courseMenuAnchor.course.status !== 'draft' ? ' (курс публиковался)' : ''}
        </MenuItem>
      </Menu>

      <Dialog open={!!editCourse} onClose={() => setEditCourse(null)} fullWidth maxWidth="sm">
        <DialogTitle>Редактирование курса</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={editCourseTitle} onChange={(e) => setEditCourseTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth multiline minRows={3} label="Описание" value={editCourseDescription} onChange={(e) => setEditCourseDescription(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCourse(null)}>Отмена</Button>
          <Button variant="contained" disabled={!editCourseTitle.trim()} onClick={saveEditCourse}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteCourseTarget} onClose={() => setDeleteCourseTarget(null)}>
        <DialogTitle>Удалить курс «{deleteCourseTarget?.title}»?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Безвозвратно удалятся всё дерево курса, задачи и черновик. Отменить нельзя.
            Доступно только для курсов, которые ни разу не публиковались — иначе используйте архивацию.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCourseTarget(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteCourse}>Удалить</Button>
        </DialogActions>
      </Dialog>

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
                <Button size="small" variant="outlined" onClick={() => openCreate(null, 'snap_task')}>+ Snap-задание</Button>
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

      <Dialog
        open={!!nodeDialog && nodeDialog.type !== 'task' && nodeDialog.type !== 'snap_task'}
        onClose={() => setNodeDialog(null)} fullWidth
        maxWidth={nodeDialog?.type === 'theory' ? 'md' : 'sm'}
      >
        <DialogTitle>
          {nodeDialog?.editing ? 'Редактирование' : STRUCTURAL_TYPE_SET.has(nodeDialog?.type || '')
            ? `Новый узел «${CODELAB_STRUCTURAL_LABEL[nodeDialog?.type as CodelabStructuralType]}»`
            : 'Новый материал'}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Заголовок" value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          {nodeDialog?.type === 'theory' && (
            <NotesEditor
              value={nodeContent}
              onChange={setNodeContent}
              placeholder="Текст лекции — форматирование, изображения (вставьте через Ctrl+V), видео, ссылки…"
              onUploadImage={async (file) => (await api.uploadFile(file)).url}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!nodeTitle.trim()} onClick={saveNode}>{nodeDialog?.editing ? 'Сохранить' : 'Добавить'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={nodeDialog?.type === 'task'} onClose={() => setNodeDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{nodeDialog?.editing ? 'Редактирование задачи' : 'Новая задача (Python, stdin/stdout)'}</DialogTitle>
        <DialogContent>
          {taskLoading ? <CircularProgress size={24} sx={{ mt: 2 }} /> : (
            <>
              <TextField autoFocus fullWidth label="Название" value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>Условие задачи</Typography>
              <NotesEditor
                value={taskStatement}
                onChange={setTaskStatement}
                placeholder="Условие задачи — форматирование, изображения (Ctrl+V), видео, ссылки…"
                onUploadImage={async (file) => (await api.uploadFile(file)).url}
              />

              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <TextField fullWidth label="Формат ввода" value={taskInputFormat} onChange={(e) => setTaskInputFormat(e.target.value)} />
                <TextField fullWidth label="Формат вывода" value={taskOutputFormat} onChange={(e) => setTaskOutputFormat(e.target.value)} />
              </Stack>

              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 3, mb: 1 }}>
                <Typography variant="subtitle2">Тесты</Typography>
                <Button size="small" onClick={addTestRow}>+ Добавить тест</Button>
              </Stack>
              <Stack spacing={1.5}>
                {taskTests.map((t, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1.5}>
                      <TextField
                        fullWidth multiline minRows={2} label={`Вход #${i + 1}`}
                        value={t.input} onChange={(e) => updateTestRow(i, { input: e.target.value })}
                      />
                      <TextField
                        fullWidth multiline minRows={2} label="Ожидаемый вывод"
                        value={t.expected} onChange={(e) => updateTestRow(i, { expected: e.target.value })}
                      />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={!t.is_hidden} onChange={(e) => updateTestRow(i, { is_hidden: !e.target.checked })} />}
                        label={<Typography variant="body2">Виден ученику (пример)</Typography>}
                      />
                      <IconButton size="small" onClick={() => removeTestRow(i)} disabled={taskTests.length === 1}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!nodeTitle.trim() || taskLoading} onClick={saveNode}>
            {nodeDialog?.editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={nodeDialog?.type === 'snap_task'} onClose={() => setNodeDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{nodeDialog?.editing ? 'Редактирование Snap-задания' : 'Новое Snap-задание'}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Название" value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ученик увидит инструкцию слева, а справа — постоянную панель Snap! (snap.tirskix.space), которая
            не перезагружается при переходе между этапами. Этапы ниже — то, что листается слева.
          </Typography>

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Этапы</Typography>
            <Button size="small" onClick={addStepRow}>+ Добавить этап</Button>
          </Stack>
          <Stack spacing={2}>
            {snapSteps.map((s, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <TextField
                    fullWidth size="small" label={`Заголовок этапа ${i + 1}`}
                    value={s.title} onChange={(e) => updateStepRow(i, { title: e.target.value })}
                  />
                  <IconButton size="small" onClick={() => removeStepRow(i)} disabled={snapSteps.length === 1}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <NotesEditor
                  value={s.content}
                  onChange={(v) => updateStepRow(i, { content: v })}
                  placeholder="Текст этапа — форматирование, изображения (Ctrl+V), видео, ссылки…"
                  onUploadImage={async (file) => (await api.uploadFile(file)).url}
                />
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNodeDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!nodeTitle.trim()} onClick={saveNode}>
            {nodeDialog?.editing ? 'Сохранить' : 'Добавить'}
          </Button>
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
