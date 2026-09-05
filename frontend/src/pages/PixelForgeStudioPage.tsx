import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, ArrowDownward, ArrowUpward, Delete as DeleteIcon, ExpandLess, ExpandMore,
  LinkOff as DetachIcon, Publish as PublishIcon, UnpublishedOutlined as UnpublishIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import {
  pixelforgeStudioApi as api, PFCard, PFCourse, PFCourseTree, PFHint, PFLecture,
  PFTest, PFTreeNode, PFTreeTask, PF_CHILD_TYPE, PF_NODE_LABEL, PixelForgeCardType,
  PixelForgeNodeType, PixelForgeStatus, PixelForgeTool,
} from '../services/pixelforgeApi';

type Toast = { msg: string; err?: boolean } | null;
const TOOLS: PixelForgeTool[] = ['SNAP', 'GDEVELOP'];
const CARD_TYPES: PixelForgeCardType[] = ['TEXT', 'IMAGE', 'VIDEO', 'SNAP_SNIPPET'];

const statusColor = (s: PixelForgeStatus) => (s === 'PUBLISHED' ? 'success' : s === 'ARCHIVED' ? 'default' : 'warning');

// ─────────────────────────── Tree ───────────────────────────

interface NodeRowProps {
  node: PFTreeNode;
  depth: number;
  selectedTaskId: number | null;
  onSelectTask: (nodeId: number, task: PFTreeTask) => void;
  onAddChild: (node: PFTreeNode) => void;
  onAddTask: (node: PFTreeNode) => void;
  onDeleteNode: (node: PFTreeNode) => void;
  onDetachTask: (nodeId: number, nodeTaskId: number) => void;
}

function NodeRow({ node, depth, selectedTaskId, onSelectTask, onAddChild, onAddTask, onDeleteNode, onDetachTask }: NodeRowProps) {
  const [open, setOpen] = useState(true);
  const childType = PF_CHILD_TYPE[node.type];
  const hasKids = (node.children?.length ?? 0) > 0 || (node.tasks?.length ?? 0) > 0;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: depth * 2, py: 0.4 }}>
        <IconButton size="small" onClick={() => setOpen((o) => !o)} sx={{ visibility: hasKids ? 'visible' : 'hidden' }}>
          {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
        <Chip size="small" label={PF_NODE_LABEL[node.type]} variant="outlined" />
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{node.title}</Typography>
        {node.status === 'PUBLISHED' && <Chip size="small" color="success" label="опубл." />}
        {childType && (
          <Tooltip title={`Добавить: ${PF_NODE_LABEL[childType]}`}>
            <IconButton size="small" onClick={() => onAddChild(node)}><AddIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        <Tooltip title="Добавить задачу">
          <IconButton size="small" onClick={() => onAddTask(node)}><AddIcon fontSize="small" color="primary" /></IconButton>
        </Tooltip>
        <Tooltip title="Удалить узел">
          <IconButton size="small" onClick={() => onDeleteNode(node)}><DeleteIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Box>
      {open && (
        <>
          {node.tasks?.map((t) => (
            <Box
              key={t.nodeTaskId}
              onClick={() => onSelectTask(node.id, t)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', py: 0.4,
                pl: (depth + 1) * 2 + 4, borderRadius: 1,
                bgcolor: selectedTaskId === t.assignmentId ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Chip size="small" label={t.tool} variant="outlined" />
              <Typography variant="body2" sx={{ flex: 1 }}>{t.title}</Typography>
              <Chip size="small" color={statusColor(t.status)} label={t.status === 'PUBLISHED' ? 'опубл.' : 'черн.'} />
              <Tooltip title="Отвязать от узла">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDetachTask(node.id, t.nodeTaskId); }}>
                  <DetachIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
          {node.children?.map((c) => (
            <NodeRow
              key={c.id} node={c} depth={depth + 1} selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask} onAddChild={onAddChild} onAddTask={onAddTask}
              onDeleteNode={onDeleteNode} onDetachTask={onDetachTask}
            />
          ))}
        </>
      )}
    </>
  );
}

// ─────────────────────────── Task detail ───────────────────────────

function TaskDetail({ assignmentId, onChanged, toast }: { assignmentId: number; onChanged: () => void; toast: (t: Toast) => void }) {
  const [task, setTask] = useState<any>(null);
  const [tests, setTests] = useState<PFTest[]>([]);
  const [hints, setHints] = useState<PFHint[]>([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newTest, setNewTest] = useState<{ inputData: string; expectedOutput: string; testType: 'PUBLIC' | 'HIDDEN' }>({ inputData: '', expectedOutput: '', testType: 'PUBLIC' });
  const [newHint, setNewHint] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, ts, hs] = await Promise.all([
        api.getTask(assignmentId), api.listTests(assignmentId), api.listHints(assignmentId),
      ]);
      setTask(t); setTests(ts); setHints(hs);
    } catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка загрузки задачи', err: true }); }
    finally { setLoading(false); }
  }, [assignmentId, toast]);
  useEffect(() => { load(); }, [load]);

  if (loading || !task) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>;

  const saveTask = async () => {
    try {
      await api.updateTask(assignmentId, {
        title: task.title, description: task.description, tool: task.tool,
        deadline: task.deadline || null, lectureId: task.lectureId ?? null,
      });
      toast({ msg: 'Задача сохранена' }); onChanged();
    } catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка сохранения', err: true }); }
  };
  const togglePublish = async () => {
    try {
      task.status === 'PUBLISHED' ? await api.unpublishTask(assignmentId) : await api.publishTask(assignmentId);
      toast({ msg: task.status === 'PUBLISHED' ? 'Снято с публикации' : 'Опубликовано' });
      await load(); onChanged();
    } catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Задача #{assignmentId}</Typography>
        <Chip size="small" color={statusColor(task.status)} label={task.status} />
        <Button size="small" onClick={togglePublish} startIcon={task.status === 'PUBLISHED' ? <UnpublishIcon /> : <PublishIcon />}>
          {task.status === 'PUBLISHED' ? 'Снять' : 'Опубликовать'}
        </Button>
      </Stack>
      <Stack spacing={1.5}>
        <TextField size="small" label="Название" value={task.title || ''} onChange={(e) => setTask({ ...task, title: e.target.value })} />
        <TextField size="small" label="Описание" multiline minRows={3} value={task.description || ''} onChange={(e) => setTask({ ...task, description: e.target.value })} />
        <Stack direction="row" spacing={1}>
          <Select size="small" value={task.tool} onChange={(e) => setTask({ ...task, tool: e.target.value })} sx={{ minWidth: 140 }}>
            {TOOLS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
          <TextField size="small" type="datetime-local" label="Дедлайн" InputLabelProps={{ shrink: true }}
            value={task.deadline ? String(task.deadline).slice(0, 16) : ''}
            onChange={(e) => setTask({ ...task, deadline: e.target.value ? `${e.target.value}:00Z` : '' })} />
        </Stack>
        <Button variant="contained" size="small" onClick={saveTask} sx={{ alignSelf: 'flex-start' }}>Сохранить</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2 }}>
        <Tab label={`Тесты (${tests.length})`} />
        <Tab label={`Подсказки (${hints.length})`} />
      </Tabs>
      <Divider />

      {tab === 0 && (
        <Box sx={{ pt: 1.5 }}>
          {tests.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={t.testType} />
                <Typography variant="caption" sx={{ flex: 1 }}>
                  in: {t.inputData || '∅'} → out: {t.expectedOutput || '∅'} · {t.checker} · w{t.weight}
                </Typography>
                <IconButton size="small" onClick={async () => { await api.deleteTest(t.id); load(); }}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField size="small" label="Ввод" value={newTest.inputData} onChange={(e) => setNewTest({ ...newTest, inputData: e.target.value })} />
            <TextField size="small" label="Ожидаемый вывод" value={newTest.expectedOutput} onChange={(e) => setNewTest({ ...newTest, expectedOutput: e.target.value })} />
            <Button size="small" variant="outlined" onClick={async () => {
              try { await api.createTest(assignmentId, newTest); setNewTest({ inputData: '', expectedOutput: '', testType: 'PUBLIC' }); load(); }
              catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
            }}>Добавить</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">Проверка ручная — тест хранится как «ожидаемый результат».</Typography>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ pt: 1.5 }}>
          {hints.map((h) => (
            <Paper key={h.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={`ур.${h.level}`} />
                <Typography variant="caption" sx={{ flex: 1 }}>{h.content}</Typography>
                <Typography variant="caption" color="text.secondary">{h.coinCost}💰 / {h.unlockAttempts} попыт.</Typography>
                <IconButton size="small" onClick={async () => { await api.deleteHint(h.id); load(); }}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField size="small" fullWidth label="Текст подсказки" value={newHint} onChange={(e) => setNewHint(e.target.value)} />
            <Button size="small" variant="outlined" disabled={!newHint.trim()} onClick={async () => {
              try { await api.createHint(assignmentId, { content: newHint.trim() }); setNewHint(''); load(); }
              catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
            }}>Добавить</Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

// ─────────────────────────── Lectures tab ───────────────────────────

function LecturesTab({ toast }: { toast: (t: Toast) => void }) {
  const [lectures, setLectures] = useState<PFLecture[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [cards, setCards] = useState<PFCard[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCard, setNewCard] = useState({ cardType: 'TEXT' as PixelForgeCardType, content: '' });

  const loadLectures = useCallback(async () => {
    try { setLectures(await api.listLectures()); } catch (e: any) { toast({ msg: 'Ошибка загрузки лекций', err: true }); }
  }, [toast]);
  const loadCards = useCallback(async (id: number) => {
    try { setCards(await api.listCards(id)); } catch (e: any) { toast({ msg: 'Ошибка загрузки карточек', err: true }); }
  }, [toast]);
  useEffect(() => { loadLectures(); }, [loadLectures]);
  useEffect(() => { if (sel) loadCards(sel); }, [sel, loadCards]);

  const move = async (idx: number, dir: -1 | 1) => {
    const ids = cards.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await api.reorderCards(sel!, ids);
    loadCards(sel!);
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
      <Paper variant="outlined" sx={{ width: 280, p: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField size="small" fullWidth placeholder="Новая лекция" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Button size="small" disabled={!newTitle.trim()} onClick={async () => {
            try { await api.createLecture(newTitle.trim()); setNewTitle(''); loadLectures(); } catch { toast({ msg: 'Ошибка', err: true }); }
          }}>+</Button>
        </Stack>
        {lectures.map((l) => (
          <Box key={l.id} onClick={() => setSel(l.id)} sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderRadius: 1, cursor: 'pointer',
            bgcolor: sel === l.id ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
          }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{l.title}</Typography>
            <IconButton size="small" onClick={async (e) => {
              e.stopPropagation();
              try { await api.deleteLecture(l.id); if (sel === l.id) setSel(null); loadLectures(); }
              catch (er: any) { toast({ msg: er.response?.data?.detail || 'На лекцию ссылается задача', err: true }); }
            }}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, p: 1.5 }}>
        {!sel ? <Typography variant="body2" color="text.secondary">Выберите лекцию</Typography> : (
          <>
            {cards.map((c, i) => (
              <Paper key={c.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={c.cardType} />
                  <Typography variant="caption" sx={{ flex: 1, whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
                  <IconButton size="small" onClick={() => move(i, -1)}><ArrowUpward fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => move(i, 1)}><ArrowDownward fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={async () => { await api.deleteCard(c.id); loadCards(sel); }}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Paper>
            ))}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Select size="small" value={newCard.cardType} onChange={(e) => setNewCard({ ...newCard, cardType: e.target.value as PixelForgeCardType })}>
                {CARD_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
              <TextField size="small" fullWidth multiline label="Содержимое (текст / URL / XML)" value={newCard.content}
                onChange={(e) => setNewCard({ ...newCard, content: e.target.value })} />
              <Button size="small" variant="outlined" onClick={async () => {
                try { await api.createCard(sel, newCard); setNewCard({ cardType: 'TEXT', content: '' }); loadCards(sel); }
                catch (e: any) { toast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
              }}>Добавить</Button>
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}

// ─────────────────────────── Page ───────────────────────────

export default function PixelForgeStudioPage() {
  const [tab, setTab] = useState(0);
  const [courses, setCourses] = useState<PFCourse[]>([]);
  const [tree, setTree] = useState<PFCourseTree | null>(null);
  const [selCourse, setSelCourse] = useState<number | null>(null);
  const [selTaskId, setSelTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  // dialogs
  const [courseDlg, setCourseDlg] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');
  const [nodeDlg, setNodeDlg] = useState<{ parent: PFTreeNode | null; type: PixelForgeNodeType } | null>(null);
  const [nodeTitle, setNodeTitle] = useState('');
  const [taskDlg, setTaskDlg] = useState<{ node: PFTreeNode } | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', tool: 'SNAP' as PixelForgeTool });

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try { setCourses(await api.listCourses()); } catch (e: any) { setToast({ msg: 'Ошибка загрузки курсов', err: true }); }
    finally { setLoading(false); }
  }, []);
  const loadTree = useCallback(async (id: number) => {
    try { setTree(await api.getTree(id)); } catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка загрузки дерева', err: true }); }
  }, []);
  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { if (selCourse) loadTree(selCourse); else setTree(null); }, [selCourse, loadTree]);

  const refreshTree = () => { if (selCourse) loadTree(selCourse); };

  const createCourse = async () => {
    try { await api.createCourse({ title: courseTitle.trim() }); setCourseDlg(false); setCourseTitle(''); loadCourses(); }
    catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const createNode = async () => {
    if (!nodeDlg || !selCourse) return;
    try {
      await api.createNode(selCourse, { type: nodeDlg.type, title: nodeTitle.trim(), parentId: nodeDlg.parent?.id });
      setNodeDlg(null); setNodeTitle(''); refreshTree();
    } catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const createTask = async () => {
    if (!taskDlg) return;
    try {
      await api.createNodeTask(taskDlg.node.id, { createNew: true, title: taskForm.title.trim(), tool: taskForm.tool });
      setTaskDlg(null); setTaskForm({ title: '', tool: 'SNAP' }); refreshTree();
    } catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const deleteNode = async (n: PFTreeNode) => {
    if (!window.confirm(`Удалить «${n.title}» со всем содержимым?`)) return;
    try { await api.deleteNode(n.id); refreshTree(); } catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const detachTask = async (nodeId: number, nodeTaskId: number) => {
    try { await api.detachNodeTask(nodeId, nodeTaskId); if (selTaskId) setSelTaskId(null); refreshTree(); }
    catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const toggleCoursePublish = async () => {
    if (!tree) return;
    try {
      tree.status === 'PUBLISHED'
        ? await api.updateCourse(tree.id, { status: 'DRAFT' })
        : await api.updateCourse(tree.id, { status: 'PUBLISHED' });
      refreshTree(); loadCourses();
    } catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };
  const deleteCourse = async () => {
    if (!tree || !window.confirm(`Удалить курс «${tree.title}»?`)) return;
    try { await api.deleteCourse(tree.id); setSelCourse(null); loadCourses(); }
    catch (e: any) { setToast({ msg: e.response?.data?.detail || 'Ошибка', err: true }); }
  };

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>PixelForge Studio</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Курсы, дерево (модуль → тема → подтема), задачи, тесты, подсказки и лекции PixelForge.
        </Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Курсы" />
          <Tab label="Лекции" />
        </Tabs>
        <Divider sx={{ mb: 2 }} />

        {tab === 1 && <LecturesTab toast={setToast} />}

        {tab === 0 && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* courses */}
            <Paper variant="outlined" sx={{ width: 260, p: 1.5, alignSelf: 'flex-start' }}>
              <Button fullWidth size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCourseDlg(true)} sx={{ mb: 1 }}>
                Курс
              </Button>
              {loading ? <CircularProgress size={20} /> : courses.map((c) => (
                <Box key={c.id} onClick={() => { setSelCourse(c.id); setSelTaskId(null); }} sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderRadius: 1, cursor: 'pointer',
                  bgcolor: selCourse === c.id ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{c.title}</Typography>
                  <Chip size="small" color={statusColor(c.status)} label={c.status[0]} />
                </Box>
              ))}
              {!loading && courses.length === 0 && <Typography variant="caption" color="text.secondary">Курсов ещё нет</Typography>}
            </Paper>

            {/* tree */}
            <Paper variant="outlined" sx={{ flex: 1, p: 1.5, minWidth: 0 }}>
              {!tree ? <Typography variant="body2" color="text.secondary">Выберите курс</Typography> : (
                <>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>{tree.title}</Typography>
                    <Chip size="small" color={statusColor(tree.status)} label={tree.status} />
                    <Button size="small" onClick={toggleCoursePublish}>
                      {tree.status === 'PUBLISHED' ? 'В черновик' : 'Опубликовать'}
                    </Button>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setNodeDlg({ parent: null, type: 'MODULE' })}>Модуль</Button>
                    <IconButton size="small" onClick={deleteCourse}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Divider sx={{ mb: 1 }} />
                  {(tree.nodes ?? []).map((n) => (
                    <NodeRow
                      key={n.id} node={n} depth={0} selectedTaskId={selTaskId}
                      onSelectTask={(_, t) => setSelTaskId(t.assignmentId)}
                      onAddChild={(node) => { const ct = PF_CHILD_TYPE[node.type]; if (ct) setNodeDlg({ parent: node, type: ct }); }}
                      onAddTask={(node) => setTaskDlg({ node })}
                      onDeleteNode={deleteNode}
                      onDetachTask={detachTask}
                    />
                  ))}
                  {!(tree.nodes ?? []).length && <Typography variant="caption" color="text.secondary">Добавьте модуль</Typography>}
                </>
              )}
            </Paper>

            {/* task detail */}
            {selTaskId && (
              <Paper variant="outlined" sx={{ width: 420, p: 1.5, alignSelf: 'flex-start' }}>
                <TaskDetail assignmentId={selTaskId} onChanged={refreshTree} toast={setToast} />
              </Paper>
            )}
          </Box>
        )}
      </Box>

      {/* dialogs */}
      <Dialog open={courseDlg} onClose={() => setCourseDlg(false)} fullWidth maxWidth="xs">
        <DialogTitle>Новый курс</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth size="small" label="Название" sx={{ mt: 1 }} value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setCourseDlg(false)}>Отмена</Button><Button variant="contained" disabled={!courseTitle.trim()} onClick={createCourse}>Создать</Button></DialogActions>
      </Dialog>

      <Dialog open={!!nodeDlg} onClose={() => setNodeDlg(null)} fullWidth maxWidth="xs">
        <DialogTitle>{nodeDlg && `Новый: ${PF_NODE_LABEL[nodeDlg.type]}`}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth size="small" label="Название" sx={{ mt: 1 }} value={nodeTitle} onChange={(e) => setNodeTitle(e.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setNodeDlg(null)}>Отмена</Button><Button variant="contained" disabled={!nodeTitle.trim()} onClick={createNode}>Создать</Button></DialogActions>
      </Dialog>

      <Dialog open={!!taskDlg} onClose={() => setTaskDlg(null)} fullWidth maxWidth="xs">
        <DialogTitle>Новая задача</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField autoFocus fullWidth size="small" label="Название" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            <Select size="small" value={taskForm.tool} onChange={(e) => setTaskForm({ ...taskForm, tool: e.target.value as PixelForgeTool })}>
              {TOOLS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setTaskDlg(null)}>Отмена</Button><Button variant="contained" disabled={!taskForm.title.trim()} onClick={createTask}>Создать</Button></DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.err ? 'error' : 'success'} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Layout>
  );
}
