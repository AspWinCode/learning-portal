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
  MenuItem,
  Select,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Assignment as TaskIcon,
  Delete as DeleteIcon,
  ExpandLess,
  ExpandMore,
  Save as SaveIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import {
  technolabApi,
  TechnoLabCourse,
  TechnoLabNode,
  TechnoLabNodeType,
  TechnoLabRunnerType,
  TechnoLabTask,
  TechnoLabTaskLecture,
  TechnoLabTaskTest,
  TechnoLabTaskType,
  TechnoLabTestType,
} from '../services/technolabApi';

// ─── Brand ───────────────────────────────────────────────────────────────────
const K = {
  void: '#05070a',
  surface: '#0d1117',
  surfaceUp: '#131a21',
  border: 'rgba(53,199,255,0.18)',
  accent: '#35c7ff',
  accentDim: '#1e94c4',
  accentBg: 'rgba(53,199,255,0.08)',
  neonDim: '#00c98a',
  danger: '#ff3d54',
  text: '#ddeae7',
  textDim: '#7a9490',
  textFaint: '#3e5450',
  mono: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
};

const textFieldSx = {
  '& .MuiInputBase-root': { fontFamily: K.mono, fontSize: 13, bgcolor: K.surface },
  '& .MuiInputLabel-root': { fontFamily: K.mono, fontSize: 13 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: K.border },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(53,199,255,0.4)' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: K.accent },
};

const NODE_TYPE_LABEL: Record<TechnoLabNodeType, string> = {
  module: 'Модуль',
  submodule: 'Подмодуль',
  topic: 'Тема',
  subtopic: 'Подтема',
};

const CHILD_TYPE: Record<TechnoLabNodeType, TechnoLabNodeType | null> = {
  module: 'submodule',
  submodule: 'topic',
  topic: 'subtopic',
  subtopic: null,
};

const TASK_TYPES: TechnoLabTaskType[] = ['python_io', 'python_oop', 'python_numpy', 'sql_query', 'cpp_io', 'js_io'];
const RUNNER_TYPES: TechnoLabRunnerType[] = ['stdin_runner', 'pytest_runner', 'sql_runner', 'cpp_runner', 'js_runner'];

type Toast = { msg: string; err?: boolean } | null;

// ─── Node tree (recursive) ────────────────────────────────────────────────────
interface NodeTreeProps {
  nodes: TechnoLabNode[];
  depth: number;
  selectedTaskId: number | null;
  onSelectTask: (nodeId: number, taskId: number) => void;
  onAddChild: (node: TechnoLabNode) => void;
  onAddTask: (node: TechnoLabNode) => void;
  onDeleteNode: (node: TechnoLabNode) => void;
  onDeleteNodeTask: (node: TechnoLabNode, nodeTaskId: number) => void;
}

function NodeTree({ nodes, depth, selectedTaskId, onSelectTask, onAddChild, onAddTask, onDeleteNode, onDeleteNodeTask }: NodeTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          depth={depth}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          onAddChild={onAddChild}
          onAddTask={onAddTask}
          onDeleteNode={onDeleteNode}
          onDeleteNodeTask={onDeleteNodeTask}
        />
      ))}
    </>
  );
}

interface NodeRowProps {
  node: TechnoLabNode;
  depth: number;
  selectedTaskId: number | null;
  onSelectTask: (nodeId: number, taskId: number) => void;
  onAddChild: (node: TechnoLabNode) => void;
  onAddTask: (node: TechnoLabNode) => void;
  onDeleteNode: (node: TechnoLabNode) => void;
  onDeleteNodeTask: (node: TechnoLabNode, nodeTaskId: number) => void;
}

function NodeRow({ node, depth, selectedTaskId, onSelectTask, onAddChild, onAddTask, onDeleteNode, onDeleteNodeTask }: NodeRowProps) {
  const [open, setOpen] = useState(true);
  const hasContent = (node.children && node.children.length > 0) || (node.tasks && node.tasks.length > 0);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, pl: 1 + depth * 2, pr: 1, py: 0.75,
          '&:hover': { bgcolor: K.accentBg },
        }}
      >
        <IconButton size="small" onClick={() => setOpen((v) => !v)} sx={{ p: 0.25, color: K.textDim, visibility: hasContent ? 'visible' : 'hidden' }}>
          {open ? <ExpandLess sx={{ fontSize: 15 }} /> : <ExpandMore sx={{ fontSize: 15 }} />}
        </IconButton>
        <Chip
          label={NODE_TYPE_LABEL[node.type]}
          size="small"
          sx={{ fontSize: 9, height: 16, fontFamily: K.mono, color: K.textDim, bgcolor: 'rgba(255,255,255,0.04)' }}
        />
        <Typography sx={{ fontSize: 12.5, color: K.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </Typography>
        {node.can_attach_tasks && (
          <Tooltip title="Добавить задачу">
            <IconButton size="small" onClick={() => onAddTask(node)} sx={{ p: 0.4, color: K.accent }}>
              <TaskIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        {node.can_create_children && CHILD_TYPE[node.type] && (
          <Tooltip title={`Добавить ${NODE_TYPE_LABEL[CHILD_TYPE[node.type] as TechnoLabNodeType].toLowerCase()}`}>
            <IconButton size="small" onClick={() => onAddChild(node)} sx={{ p: 0.4, color: K.accent }}>
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Удалить узел">
          <IconButton size="small" onClick={() => onDeleteNode(node)} sx={{ p: 0.4, color: K.textFaint, '&:hover': { color: K.danger } }}>
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {open && (
        <>
          {(node.tasks || []).map((nt) => (
            <Box
              key={nt.id}
              onClick={() => onSelectTask(node.id, nt.task_id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, pl: 1 + (depth + 1) * 2, pr: 1, py: 0.6, cursor: 'pointer',
                bgcolor: selectedTaskId === nt.task_id ? K.accentBg : 'transparent',
                borderLeft: `3px solid ${selectedTaskId === nt.task_id ? K.accent : 'transparent'}`,
                '&:hover': { bgcolor: K.accentBg },
              }}
            >
              <TaskIcon sx={{ fontSize: 13, color: K.textFaint }} />
              <Typography sx={{ fontSize: 12, color: selectedTaskId === nt.task_id ? K.accent : K.textDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nt.task_title}
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onDeleteNodeTask(node, nt.id); }}
                sx={{ p: 0.25, color: K.textFaint, '&:hover': { color: K.danger } }}
              >
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
          {node.children && node.children.length > 0 && (
            <NodeTree
              nodes={node.children}
              depth={depth + 1}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onAddChild={onAddChild}
              onAddTask={onAddTask}
              onDeleteNode={onDeleteNode}
              onDeleteNodeTask={onDeleteNodeTask}
            />
          )}
        </>
      )}
    </Box>
  );
}

// ─── Test row ─────────────────────────────────────────────────────────────────
function TestRow({ test, onUpdate, onDelete }: { test: TechnoLabTaskTest; onUpdate: (t: TechnoLabTaskTest) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(test);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDraft(test); setDirty(false); }, [test]);

  const change = (field: keyof TechnoLabTaskTest, val: any) => {
    setDraft((d) => ({ ...d, [field]: val }));
    setDirty(true);
  };

  return (
    <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: K.surface }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Select
          size="small"
          value={draft.test_type}
          onChange={(e) => change('test_type', e.target.value as TechnoLabTestType)}
          sx={{ fontFamily: K.mono, fontSize: 12, height: 32, ...textFieldSx }}
        >
          <MenuItem value="public" sx={{ fontFamily: K.mono, fontSize: 12 }}>Открытый (public)</MenuItem>
          <MenuItem value="hidden" sx={{ fontFamily: K.mono, fontSize: 12 }}>Скрытый (hidden)</MenuItem>
        </Select>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" disabled={!dirty} onClick={() => { onUpdate(draft); setDirty(false); }} sx={{ color: K.accent }}>
          <SaveIcon sx={{ fontSize: 15 }} />
        </IconButton>
        <IconButton size="small" onClick={onDelete} sx={{ color: K.textFaint, '&:hover': { color: K.danger } }}>
          <DeleteIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
      <TextField
        label="Входные данные (input)" value={draft.input_data || ''} onChange={(e) => change('input_data', e.target.value)}
        size="small" multiline minRows={2} sx={textFieldSx}
      />
      <TextField
        label="Ожидаемый вывод (expected)" value={draft.expected_output || ''} onChange={(e) => change('expected_output', e.target.value)}
        size="small" multiline minRows={2} sx={textFieldSx}
      />
    </Box>
  );
}

// ─── Lecture row ──────────────────────────────────────────────────────────────
function LectureRow({ lecture, onUpdate, onDelete }: { lecture: TechnoLabTaskLecture; onUpdate: (l: TechnoLabTaskLecture) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(lecture);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDraft(lecture); setDirty(false); }, [lecture]);

  return (
    <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: K.surface }}>
      <TextField
        label="Текст лекции (Markdown)" value={draft.content} multiline minRows={6}
        onChange={(e) => { setDraft((d) => ({ ...d, content: e.target.value })); setDirty(true); }}
        sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12, lineHeight: 1.6 } }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TextField
          label="Открыть после N попыток" type="number" value={draft.unlock_attempts}
          onChange={(e) => { setDraft((d) => ({ ...d, unlock_attempts: Number(e.target.value) })); setDirty(true); }}
          size="small" sx={{ width: 220, ...textFieldSx }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" disabled={!dirty} onClick={() => { onUpdate(draft); setDirty(false); }} startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
          sx={{ fontFamily: K.mono, fontSize: 11, color: K.accent }}>
          Сохранить
        </Button>
        <Button size="small" onClick={onDelete} startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
          sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint, '&:hover': { color: K.danger } }}>
          Удалить
        </Button>
      </Box>
    </Box>
  );
}

// ─── Task editor ───────────────────────────────────────────────────────────────
function TaskEditor({ taskId, onDeleted, setToast }: { taskId: number; onDeleted: () => void; setToast: (t: Toast) => void }) {
  const [task, setTask] = useState<TechnoLabTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState<Partial<TechnoLabTask>>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await technolabApi.getTask(taskId);
      setTask(t);
      setDraft(t);
      setDirty(false);
    } catch {
      setToast({ msg: 'Не удалось загрузить задачу', err: true });
    } finally {
      setLoading(false);
    }
  }, [taskId]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const change = (field: keyof TechnoLabTask, val: any) => {
    setDraft((d) => ({ ...d, [field]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await technolabApi.updateTask(taskId, {
        title: draft.title, description: draft.description, task_type: draft.task_type,
        runner_type: draft.runner_type, status: draft.status, reward_coins: draft.reward_coins,
        sql_schema: draft.sql_schema, sql_seed: draft.sql_seed,
      });
      setTask((t) => t ? { ...t, ...updated } : t);
      setDirty(false);
      setToast({ msg: 'Задача сохранена' });
    } catch {
      setToast({ msg: 'Ошибка сохранения задачи', err: true });
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async () => {
    setSaving(true);
    try {
      await technolabApi.deleteTask(taskId);
      onDeleted();
    } catch {
      setToast({ msg: 'Ошибка удаления задачи', err: true });
      setSaving(false);
    }
  };

  const addTest = async () => {
    try {
      const t = await technolabApi.createTest(taskId, { test_type: 'public', input_data: '', expected_output: '' });
      setTask((prev) => prev ? { ...prev, tests: [...(prev.tests || []), t] } : prev);
    } catch {
      setToast({ msg: 'Ошибка создания теста', err: true });
    }
  };

  const updateTest = async (test: TechnoLabTaskTest) => {
    try {
      const saved = await technolabApi.updateTest(test.id, test);
      setTask((prev) => prev ? { ...prev, tests: (prev.tests || []).map((t) => t.id === saved.id ? saved : t) } : prev);
      setToast({ msg: 'Тест сохранён' });
    } catch {
      setToast({ msg: 'Ошибка сохранения теста', err: true });
    }
  };

  const deleteTest = async (testId: number) => {
    try {
      await technolabApi.deleteTest(testId);
      setTask((prev) => prev ? { ...prev, tests: (prev.tests || []).filter((t) => t.id !== testId) } : prev);
    } catch {
      setToast({ msg: 'Ошибка удаления теста', err: true });
    }
  };

  const addLecture = async () => {
    try {
      const l = await technolabApi.createLecture(taskId, { content: '', unlock_attempts: 0 });
      setTask((prev) => prev ? { ...prev, lectures: [...(prev.lectures || []), l] } : prev);
    } catch {
      setToast({ msg: 'Ошибка создания лекции', err: true });
    }
  };

  const updateLecture = async (lecture: TechnoLabTaskLecture) => {
    try {
      const saved = await technolabApi.updateLecture(lecture.id, lecture);
      setTask((prev) => prev ? { ...prev, lectures: (prev.lectures || []).map((l) => l.id === saved.id ? saved : l) } : prev);
      setToast({ msg: 'Лекция сохранена' });
    } catch {
      setToast({ msg: 'Ошибка сохранения лекции', err: true });
    }
  };

  const deleteLecture = async (lectureId: number) => {
    try {
      await technolabApi.deleteLecture(lectureId);
      setTask((prev) => prev ? { ...prev, lectures: (prev.lectures || []).filter((l) => l.id !== lectureId) } : prev);
    } catch {
      setToast({ msg: 'Ошибка удаления лекции', err: true });
    }
  };

  if (loading) {
    return <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={22} sx={{ color: K.accent }} /></Box>;
  }
  if (!task) return null;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, p: 2.5, bgcolor: K.surface, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontFamily: K.mono, fontSize: 10, color: K.textFaint, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Задача
          </Typography>
          <Button size="small" onClick={deleteTask} sx={{ fontSize: 11, fontFamily: K.mono, color: K.textFaint, '&:hover': { color: K.danger } }}>
            Удалить задачу
          </Button>
        </Box>
        <TextField label="Название" value={draft.title || ''} onChange={(e) => change('title', e.target.value)} size="small" fullWidth sx={textFieldSx} />
        <TextField
          label="Описание / условие" value={draft.description || ''} onChange={(e) => change('description', e.target.value)}
          size="small" fullWidth multiline minRows={4} sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12, lineHeight: 1.6 } }}
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Select size="small" value={draft.task_type || 'python_io'} onChange={(e) => change('task_type', e.target.value)} sx={{ minWidth: 180, fontFamily: K.mono, fontSize: 12, height: 36, ...textFieldSx }}>
            {TASK_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontFamily: K.mono, fontSize: 12 }}>{t}</MenuItem>)}
          </Select>
          <Select size="small" value={draft.runner_type || 'stdin_runner'} onChange={(e) => change('runner_type', e.target.value)} sx={{ minWidth: 180, fontFamily: K.mono, fontSize: 12, height: 36, ...textFieldSx }}>
            {RUNNER_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontFamily: K.mono, fontSize: 12 }}>{t}</MenuItem>)}
          </Select>
          <TextField
            label="Награда (coins)" type="number" size="small" value={draft.reward_coins ?? 10}
            onChange={(e) => change('reward_coins', Number(e.target.value))} sx={{ width: 160, ...textFieldSx }}
          />
        </Box>
        {draft.task_type === 'sql_query' && (
          <>
            <TextField label="SQL-схема" value={draft.sql_schema || ''} onChange={(e) => change('sql_schema', e.target.value)} multiline minRows={3} size="small" sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12 } }} />
            <TextField label="SQL-сиды (данные)" value={draft.sql_seed || ''} onChange={(e) => change('sql_seed', e.target.value)} multiline minRows={3} size="small" sx={{ ...textFieldSx, '& textarea': { fontFamily: K.mono, fontSize: 12 } }} />
          </>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" size="small" disabled={!dirty || saving} onClick={save} startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
            sx={{ bgcolor: K.accent, color: '#05070a', fontFamily: K.mono, fontSize: 11, '&:hover': { bgcolor: K.accentDim }, '&:disabled': { opacity: 0.4 } }}>
            Сохранить задачу
          </Button>
        </Box>
      </Box>

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{
          minHeight: 34, borderBottom: `1px solid ${K.border}`, mb: 1.5,
          '& .MuiTab-root': { fontFamily: K.mono, fontSize: 11, minHeight: 34, color: K.textDim, textTransform: 'none' },
          '& .Mui-selected': { color: K.accent }, '& .MuiTabs-indicator': { bgcolor: K.accent },
        }}>
          <Tab label={`Тесты (${(task.tests || []).length})`} />
          <Tab label={`Лекции (${(task.lectures || []).length})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(task.tests || []).map((t) => (
              <TestRow key={t.id} test={t} onUpdate={updateTest} onDelete={() => deleteTest(t.id)} />
            ))}
            <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={addTest}
              sx={{ alignSelf: 'flex-start', fontSize: 11, fontFamily: K.mono, color: K.accent, border: `1px solid ${K.border}`, px: 1.5, height: 30 }}>
              Добавить автотест
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(task.lectures || []).map((l) => (
              <LectureRow key={l.id} lecture={l} onUpdate={updateLecture} onDelete={() => deleteLecture(l.id)} />
            ))}
            <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={addLecture}
              sx={{ alignSelf: 'flex-start', fontSize: 11, fontFamily: K.mono, color: K.accent, border: `1px solid ${K.border}`, px: 1.5, height: 30 }}>
              Добавить лекцию
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TechnoLabStudioPage() {
  const [courses, setCourses] = useState<TechnoLabCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [tree, setTree] = useState<TechnoLabNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const [createCourseDialog, setCreateCourseDialog] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [addChildFor, setAddChildFor] = useState<TechnoLabNode | null>(null);
  const [newNodeTitle, setNewNodeTitle] = useState('');

  const [addTaskFor, setAddTaskFor] = useState<TechnoLabNode | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const list = await technolabApi.listCourses();
      setCourses(list);
      if (list.length > 0 && !selectedCourseId) setSelectedCourseId(list[0].id);
    } catch {
      setToast({ msg: 'Ошибка загрузки курсов ТехноЛаб', err: true });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadCourses(); }, [loadCourses]);

  const loadTree = useCallback(async (courseId: number) => {
    setTreeLoading(true);
    try {
      const t = await technolabApi.getCourseTree(courseId);
      setTree(Array.isArray(t) ? t : []);
    } catch {
      setToast({ msg: 'Ошибка загрузки структуры курса', err: true });
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCourseId) loadTree(selectedCourseId);
  }, [selectedCourseId, loadTree]);

  const createCourse = async () => {
    if (!newCourseTitle.trim()) return;
    setCreating(true);
    try {
      const created = await technolabApi.createCourse({ title: newCourseTitle.trim() });
      setCourses((prev) => [...prev, created]);
      setSelectedCourseId(created.id);
      setNewCourseTitle('');
      setCreateCourseDialog(false);
    } catch {
      setToast({ msg: 'Ошибка создания курса', err: true });
    } finally {
      setCreating(false);
    }
  };

  const addRootModule = async () => {
    if (!selectedCourseId) return;
    setNewNodeTitle('');
    setAddChildFor({ id: 0, course_id: selectedCourseId, parent_id: null, type: 'module', title: '', description: null, sort_order: 0, status: 'draft', has_children: false, task_count: 0, can_attach_tasks: false, can_create_children: true, children: [] });
  };

  const submitAddChild = async () => {
    if (!addChildFor || !selectedCourseId || !newNodeTitle.trim()) return;
    const childType: TechnoLabNodeType = addChildFor.id === 0 ? 'module' : (CHILD_TYPE[addChildFor.type] as TechnoLabNodeType);
    try {
      await technolabApi.createNode(selectedCourseId, {
        parent_id: addChildFor.id === 0 ? null : addChildFor.id,
        type: childType,
        title: newNodeTitle.trim(),
      });
      await loadTree(selectedCourseId);
      setAddChildFor(null);
      setToast({ msg: 'Узел добавлен' });
    } catch {
      setToast({ msg: 'Ошибка добавления узла', err: true });
    }
  };

  const submitAddTask = async () => {
    if (!addTaskFor || !selectedCourseId || !newTaskTitle.trim()) return;
    try {
      const nt = await technolabApi.createNodeTask(addTaskFor.id, { create_new_task: true, task_title: newTaskTitle.trim() });
      await loadTree(selectedCourseId);
      setAddTaskFor(null);
      setSelectedNodeId(addTaskFor.id);
      setSelectedTaskId(nt.task_id);
      setToast({ msg: 'Задача добавлена' });
    } catch {
      setToast({ msg: 'Ошибка добавления задачи', err: true });
    }
  };

  const deleteNode = async (node: TechnoLabNode) => {
    if (!selectedCourseId) return;
    try {
      await technolabApi.deleteNode(node.id);
      await loadTree(selectedCourseId);
      setToast({ msg: 'Узел удалён' });
    } catch {
      setToast({ msg: 'Ошибка удаления узла', err: true });
    }
  };

  const deleteNodeTask = async (node: TechnoLabNode, nodeTaskId: number) => {
    if (!selectedCourseId) return;
    try {
      await technolabApi.deleteNodeTask(node.id, nodeTaskId);
      await loadTree(selectedCourseId);
      setToast({ msg: 'Задача откреплена' });
    } catch {
      setToast({ msg: 'Ошибка удаления задачи', err: true });
    }
  };

  return (
    <Layout>
    <Box sx={{ m: { xs: -2, sm: -3 }, height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, display: 'flex', overflow: 'hidden', bgcolor: K.void, fontFamily: K.mono }}>
      {/* Left — course list */}
      <Box sx={{ width: 240, flexShrink: 0, borderRight: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', bgcolor: K.surface }}>
        <Box sx={{ px: 2, py: 1.75, borderBottom: `1px solid ${K.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon sx={{ fontSize: 16, color: K.accent }} />
          <Typography sx={{ fontFamily: K.mono, fontSize: 12, fontWeight: 700, color: K.text, flex: 1 }}>ТехноЛаб</Typography>
          <Tooltip title="Создать курс">
            <IconButton size="small" onClick={() => { setNewCourseTitle(''); setCreateCourseDialog(true); }} sx={{ color: K.accent, p: 0.5 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} sx={{ color: K.accent }} /></Box>
          ) : courses.length === 0 ? (
            <Box sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Нет курсов</Typography>
            </Box>
          ) : (
            courses.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.04)' }} />}
                <Box
                  onClick={() => { setSelectedCourseId(c.id); setSelectedTaskId(null); }}
                  sx={{
                    px: 2, py: 1.5, cursor: 'pointer',
                    bgcolor: selectedCourseId === c.id ? K.accentBg : 'transparent',
                    borderLeft: `3px solid ${selectedCourseId === c.id ? K.accent : 'transparent'}`,
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: selectedCourseId === c.id ? K.accent : K.text, fontWeight: selectedCourseId === c.id ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title}
                  </Typography>
                  <Chip label={c.status} size="small" sx={{ mt: 0.5, fontSize: 9, height: 16, fontFamily: K.mono, color: K.textFaint, bgcolor: 'rgba(255,255,255,0.04)' }} />
                </Box>
              </React.Fragment>
            ))
          )}
        </Box>
      </Box>

      {/* Middle — node tree */}
      <Box sx={{ width: 320, flexShrink: 0, borderRight: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', bgcolor: K.surface }}>
        <Box sx={{ px: 2, py: 1.75, borderBottom: `1px solid ${K.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontFamily: K.mono, fontSize: 10, color: K.textFaint, letterSpacing: '0.15em', textTransform: 'uppercase', flex: 1 }}>Структура</Typography>
          {selectedCourseId && (
            <Tooltip title="Добавить модуль">
              <IconButton size="small" onClick={addRootModule} sx={{ color: K.accent, p: 0.5 }}>
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {!selectedCourseId ? (
            <Box sx={{ p: 2.5 }}><Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Выберите курс</Typography></Box>
          ) : treeLoading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={18} sx={{ color: K.accent }} /></Box>
          ) : tree.length === 0 ? (
            <Box sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Нет модулей. Добавьте первый.</Typography>
            </Box>
          ) : (
            <NodeTree
              nodes={tree}
              depth={0}
              selectedTaskId={selectedTaskId}
              onSelectTask={(nodeId, taskId) => { setSelectedNodeId(nodeId); setSelectedTaskId(taskId); }}
              onAddChild={(node) => { setNewNodeTitle(''); setAddChildFor(node); }}
              onAddTask={(node) => { setNewTaskTitle(''); setAddTaskFor(node); }}
              onDeleteNode={deleteNode}
              onDeleteNodeTask={deleteNodeTask}
            />
          )}
        </Box>
      </Box>

      {/* Right — task editor */}
      {selectedTaskId ? (
        <TaskEditor
          key={selectedTaskId}
          taskId={selectedTaskId}
          onDeleted={() => { setSelectedTaskId(null); if (selectedCourseId) loadTree(selectedCourseId); }}
          setToast={setToast}
        />
      ) : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: K.textFaint }}>
          <Typography sx={{ fontSize: 13, fontStyle: 'italic' }}>Выберите задачу или создайте новую в структуре курса</Typography>
        </Box>
      )}

      {/* Create course dialog */}
      <Dialog open={createCourseDialog} onClose={() => setCreateCourseDialog(false)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Новый курс ТехноЛаб</DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Название курса" value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createCourse(); }} size="small" sx={{ mt: 1, minWidth: 340, ...textFieldSx }} />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setCreateCourseDialog(false)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button variant="contained" disabled={!newCourseTitle.trim() || creating} onClick={createCourse}
            sx={{ bgcolor: K.accent, color: '#05070a', fontFamily: K.mono, fontSize: 12 }}>Создать</Button>
        </DialogActions>
      </Dialog>

      {/* Add node dialog */}
      <Dialog open={!!addChildFor} onClose={() => setAddChildFor(null)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>
          {addChildFor && (addChildFor.id === 0 ? 'Новый модуль' : `Новый узел в «${addChildFor.title}»`)}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Название" value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAddChild(); }} size="small" sx={{ mt: 1, minWidth: 340, ...textFieldSx }} />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setAddChildFor(null)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button variant="contained" disabled={!newNodeTitle.trim()} onClick={submitAddChild}
            sx={{ bgcolor: K.accent, color: '#05070a', fontFamily: K.mono, fontSize: 12 }}>Создать</Button>
        </DialogActions>
      </Dialog>

      {/* Add task dialog */}
      <Dialog open={!!addTaskFor} onClose={() => setAddTaskFor(null)} PaperProps={{ sx: { bgcolor: K.surfaceUp, color: K.text, fontFamily: K.mono } }}>
        <DialogTitle sx={{ fontFamily: K.mono, fontSize: 14 }}>Новая задача {addTaskFor ? `в «${addTaskFor.title}»` : ''}</DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Название задачи" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAddTask(); }} size="small" sx={{ mt: 1, minWidth: 340, ...textFieldSx }} />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setAddTaskFor(null)} sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Отмена</Button>
          <Button variant="contained" disabled={!newTaskTitle.trim()} onClick={submitAddTask}
            sx={{ bgcolor: K.accent, color: '#05070a', fontFamily: K.mono, fontSize: 12 }}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)} sx={{ fontFamily: K.mono, fontSize: 12 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
    </Layout>
  );
}
