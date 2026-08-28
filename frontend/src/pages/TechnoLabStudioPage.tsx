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
import NotesEditor from '../components/NotesEditor';
import { mediaApi } from '../services/api';
import { markdownToHtml, htmlToMarkdown } from '../utils/markdownHtml';
import {
  technolabApi,
  TechnoLabCourse,
  TechnoLabNode,
  TechnoLabNodeContent,
  TechnoLabNodeType,
  TechnoLabRunnerType,
  TechnoLabTask,
  TechnoLabTaskLecture,
  TechnoLabTaskTest,
  TechnoLabTaskType,
  TechnoLabTestType,
} from '../services/technolabApi';

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
  selectedContentNodeId: number | null;
  onSelectTask: (nodeId: number, taskId: number) => void;
  onSelectNode: (node: TechnoLabNode) => void;
  onAddChild: (node: TechnoLabNode) => void;
  onAddTask: (node: TechnoLabNode) => void;
  onDeleteNode: (node: TechnoLabNode) => void;
  onDeleteNodeTask: (node: TechnoLabNode, nodeTaskId: number) => void;
}

function NodeTree({ nodes, depth, selectedTaskId, selectedContentNodeId, onSelectTask, onSelectNode, onAddChild, onAddTask, onDeleteNode, onDeleteNodeTask }: NodeTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          depth={depth}
          selectedTaskId={selectedTaskId}
          selectedContentNodeId={selectedContentNodeId}
          onSelectTask={onSelectTask}
          onSelectNode={onSelectNode}
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
  selectedContentNodeId: number | null;
  onSelectTask: (nodeId: number, taskId: number) => void;
  onSelectNode: (node: TechnoLabNode) => void;
  onAddChild: (node: TechnoLabNode) => void;
  onAddTask: (node: TechnoLabNode) => void;
  onDeleteNode: (node: TechnoLabNode) => void;
  onDeleteNodeTask: (node: TechnoLabNode, nodeTaskId: number) => void;
}

function NodeRow({ node, depth, selectedTaskId, selectedContentNodeId, onSelectTask, onSelectNode, onAddChild, onAddTask, onDeleteNode, onDeleteNodeTask }: NodeRowProps) {
  const [open, setOpen] = useState(true);
  const hasContent = (node.children && node.children.length > 0) || (node.tasks && node.tasks.length > 0);
  const isSelected = selectedContentNodeId === node.id;

  return (
    <Box>
      <Box
        onClick={() => onSelectNode(node)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, pl: 1 + depth * 2, pr: 1, py: 0.75, cursor: 'pointer',
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          borderLeft: '3px solid',
          borderColor: isSelected ? 'primary.main' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} sx={{ p: 0.25, visibility: hasContent ? 'visible' : 'hidden' }}>
          {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
        <Chip label={NODE_TYPE_LABEL[node.type]} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
        <Typography variant="body2" color={isSelected ? 'primary' : 'text.primary'} sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </Typography>
        {node.can_attach_tasks && (
          <Tooltip title="Добавить задачу">
            <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); onAddTask(node); }} sx={{ p: 0.4 }}>
              <TaskIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
        {node.can_create_children && CHILD_TYPE[node.type] && (
          <Tooltip title={`Добавить ${NODE_TYPE_LABEL[CHILD_TYPE[node.type] as TechnoLabNodeType].toLowerCase()}`}>
            <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); onAddChild(node); }} sx={{ p: 0.4 }}>
              <AddIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Удалить узел">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDeleteNode(node); }} sx={{ p: 0.4, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            <DeleteIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {open && (
        <>
          {(node.tasks || []).map((nt) => (
            <Box
              key={nt.id}
              onClick={(e) => { e.stopPropagation(); onSelectTask(node.id, nt.task_id); }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, pl: 1 + (depth + 1) * 2, pr: 1, py: 0.6, cursor: 'pointer',
                bgcolor: selectedTaskId === nt.task_id ? 'action.selected' : 'transparent',
                borderLeft: '3px solid',
                borderColor: selectedTaskId === nt.task_id ? 'primary.main' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <TaskIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography
                variant="body2"
                color={selectedTaskId === nt.task_id ? 'primary' : 'text.secondary'}
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {nt.task_title}
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onDeleteNodeTask(node, nt.id); }}
                sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}
              >
                <DeleteIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Box>
          ))}
          {node.children && node.children.length > 0 && (
            <NodeTree
              nodes={node.children}
              depth={depth + 1}
              selectedTaskId={selectedTaskId}
              selectedContentNodeId={selectedContentNodeId}
              onSelectTask={onSelectTask}
              onSelectNode={onSelectNode}
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
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Select size="small" value={draft.test_type} onChange={(e) => change('test_type', e.target.value as TechnoLabTestType)} sx={{ minWidth: 200 }}>
          <MenuItem value="public">Открытый (виден ученику)</MenuItem>
          <MenuItem value="hidden">Скрытый</MenuItem>
        </Select>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Сохранить">
          <span>
            <IconButton size="small" color="primary" disabled={!dirty} onClick={() => { onUpdate(draft); setDirty(false); }}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Удалить">
          <IconButton size="small" onClick={onDelete} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <TextField
        label="Входные данные (input)" value={draft.input_data || ''} onChange={(e) => change('input_data', e.target.value)}
        size="small" multiline minRows={2} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
      />
      <TextField
        label="Ожидаемый вывод (expected)" value={draft.expected_output || ''} onChange={(e) => change('expected_output', e.target.value)}
        size="small" multiline minRows={2} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
      />
    </Box>
  );
}

// ─── Lecture row ──────────────────────────────────────────────────────────────
function LectureRow({ lecture, onUpdate, onDelete }: { lecture: TechnoLabTaskLecture; onUpdate: (l: TechnoLabTaskLecture) => void; onDelete: () => void }) {
  const [unlockAttempts, setUnlockAttempts] = useState(lecture.unlock_attempts);
  const [html, setHtml] = useState(() => markdownToHtml(lecture.content));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setUnlockAttempts(lecture.unlock_attempts);
    setHtml(markdownToHtml(lecture.content));
    setDirty(false);
  }, [lecture]);

  const uploadImage = useCallback(async (file: File) => {
    const res = await mediaApi.uploadImage(file);
    return res.url;
  }, []);

  const save = () => {
    onUpdate({ ...lecture, content: htmlToMarkdown(html), unlock_attempts: unlockAttempts });
    setDirty(false);
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <NotesEditor
        value={html}
        onChange={(v) => { setHtml(v); setDirty(true); }}
        onUploadImage={uploadImage}
        placeholder="Текст лекции… картинки — вставьте по Ctrl+V или кнопкой, видео — вставьте ссылку"
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TextField
          label="Открыть после N попыток" type="number" value={unlockAttempts}
          onChange={(e) => { setUnlockAttempts(Number(e.target.value)); setDirty(true); }}
          size="small" sx={{ width: 220 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" disabled={!dirty} onClick={save} startIcon={<SaveIcon fontSize="small" />}>
          Сохранить
        </Button>
        <Button size="small" color="error" onClick={onDelete} startIcon={<DeleteIcon fontSize="small" />}>
          Удалить
        </Button>
      </Box>
    </Box>
  );
}

// ─── Node content row (материалы/лекции уровня темы) ──────────────────────────
function NodeContentRow({ item, onUpdate, onDelete }: { item: TechnoLabNodeContent; onUpdate: (v: { title: string; content: string }) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [html, setHtml] = useState(() => markdownToHtml(item.content));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setHtml(markdownToHtml(item.content));
    setDirty(false);
  }, [item]);

  const uploadImage = useCallback(async (file: File) => {
    const res = await mediaApi.uploadImage(file);
    return res.url;
  }, []);

  const save = () => {
    onUpdate({ title, content: htmlToMarkdown(html) });
    setDirty(false);
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <TextField
        label="Заголовок" value={title} size="small"
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
      />
      <NotesEditor
        value={html}
        onChange={(v) => { setHtml(v); setDirty(true); }}
        onUploadImage={uploadImage}
        placeholder="Текст материала… картинки — вставьте по Ctrl+V или кнопкой, видео — вставьте ссылку"
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" disabled={!dirty} onClick={save} startIcon={<SaveIcon fontSize="small" />}>
          Сохранить
        </Button>
        <Button size="small" color="error" onClick={onDelete} startIcon={<DeleteIcon fontSize="small" />}>
          Удалить
        </Button>
      </Box>
    </Box>
  );
}

// ─── Node content editor (материалы темы, не привязанные к задаче) ────────────
function NodeContentEditor({ node, setToast }: { node: TechnoLabNode; setToast: (t: Toast) => void }) {
  const [items, setItems] = useState<TechnoLabNodeContent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await technolabApi.getNodeContent(node.id);
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setToast({ msg: 'Не удалось загрузить материалы темы', err: true });
    } finally {
      setLoading(false);
    }
  }, [node.id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    try {
      const created = await technolabApi.createNodeContent(node.id, { title: 'Новый материал', content: '', sort_order: items.length });
      setItems((prev) => [...prev, created]);
    } catch {
      setToast({ msg: 'Ошибка добавления материала', err: true });
    }
  };

  const updateItem = async (id: number, v: { title: string; content: string }) => {
    try {
      const saved = await technolabApi.updateNodeContent(node.id, id, v);
      setItems((prev) => prev.map((it) => (it.id === id ? saved : it)));
      setToast({ msg: 'Материал сохранён' });
    } catch {
      setToast({ msg: 'Ошибка сохранения материала', err: true });
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await technolabApi.deleteNodeContent(node.id, id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setToast({ msg: 'Материал удалён' });
    } catch {
      setToast({ msg: 'Ошибка удаления материала', err: true });
    }
  };

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="subtitle1">{node.title}</Typography>
        <Typography variant="caption" color="text.secondary">
          Материалы темы — тексты и лекции, которые ученик видит перед задачами этой темы.
        </Typography>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={22} /></Box>
      ) : (
        <>
          {items.map((it) => (
            <NodeContentRow key={it.id} item={it} onUpdate={(v) => updateItem(it.id, v)} onDelete={() => deleteItem(it.id)} />
          ))}
          <Button size="small" variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={addItem} sx={{ alignSelf: 'flex-start' }}>
            Добавить материал
          </Button>
        </>
      )}
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
    return <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={22} /></Box>;
  }
  if (!task) return null;

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 2.5, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">Задача</Typography>
          <Button size="small" color="error" onClick={deleteTask}>Удалить задачу</Button>
        </Box>
        <TextField label="Название" value={draft.title || ''} onChange={(e) => change('title', e.target.value)} size="small" fullWidth />
        <TextField
          label="Описание / условие" value={draft.description || ''} onChange={(e) => change('description', e.target.value)}
          size="small" fullWidth multiline minRows={4}
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Select size="small" value={draft.task_type || 'python_io'} onChange={(e) => change('task_type', e.target.value)} sx={{ minWidth: 180 }}>
            {TASK_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
          <Select size="small" value={draft.runner_type || 'stdin_runner'} onChange={(e) => change('runner_type', e.target.value)} sx={{ minWidth: 180 }}>
            {RUNNER_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
          <TextField
            label="Награда (coins)" type="number" size="small" value={draft.reward_coins ?? 10}
            onChange={(e) => change('reward_coins', Number(e.target.value))} sx={{ width: 160 }}
          />
        </Box>
        {draft.task_type === 'sql_query' && (
          <>
            <TextField label="SQL-схема" value={draft.sql_schema || ''} onChange={(e) => change('sql_schema', e.target.value)} multiline minRows={3} size="small" sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }} />
            <TextField label="SQL-сиды (данные)" value={draft.sql_seed || ''} onChange={(e) => change('sql_seed', e.target.value)} multiline minRows={3} size="small" sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }} />
          </>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" size="small" disabled={!dirty || saving} onClick={save} startIcon={<SaveIcon fontSize="small" />}>
            Сохранить задачу
          </Button>
        </Box>
      </Box>

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider', mb: 1.5 }}>
          <Tab label={`Тесты (${(task.tests || []).length})`} sx={{ minHeight: 36, textTransform: 'none' }} />
          <Tab label={`Лекции (${(task.lectures || []).length})`} sx={{ minHeight: 36, textTransform: 'none' }} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(task.tests || []).map((t) => (
              <TestRow key={t.id} test={t} onUpdate={updateTest} onDelete={() => deleteTest(t.id)} />
            ))}
            <Button size="small" variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={addTest} sx={{ alignSelf: 'flex-start' }}>
              Добавить автотест
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(task.lectures || []).map((l) => (
              <LectureRow key={l.id} lecture={l} onUpdate={updateLecture} onDelete={() => deleteLecture(l.id)} />
            ))}
            <Button size="small" variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={addLecture} sx={{ alignSelf: 'flex-start' }}>
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
  const [selectedContentNode, setSelectedContentNode] = useState<TechnoLabNode | null>(null);
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
      setSelectedContentNode(null);
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
      <Box sx={{ m: { xs: -2, sm: -3 }, height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, display: 'flex', overflow: 'hidden', bgcolor: 'background.default' }}>
        {/* Left — course list */}
        <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
          <Box sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScienceIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" sx={{ flex: 1 }}>ТехноЛаб</Typography>
            <Tooltip title="Создать курс">
              <IconButton size="small" color="primary" onClick={() => { setNewCourseTitle(''); setCreateCourseDialog(true); }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} /></Box>
            ) : courses.length === 0 ? (
              <Box sx={{ p: 2.5 }}>
                <Typography variant="body2" color="text.secondary" fontStyle="italic">Нет курсов</Typography>
              </Box>
            ) : (
              courses.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <Divider />}
                  <Box
                    onClick={() => { setSelectedCourseId(c.id); setSelectedTaskId(null); setSelectedContentNode(null); }}
                    sx={{
                      px: 2, py: 1.5, cursor: 'pointer',
                      bgcolor: selectedCourseId === c.id ? 'action.selected' : 'transparent',
                      borderLeft: '3px solid',
                      borderColor: selectedCourseId === c.id ? 'primary.main' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={selectedCourseId === c.id ? 600 : 400}
                      color={selectedCourseId === c.id ? 'primary' : 'text.primary'}
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {c.title}
                    </Typography>
                    <Chip label={c.status} size="small" variant="outlined" sx={{ mt: 0.5, fontSize: 10, height: 18 }} />
                  </Box>
                </React.Fragment>
              ))
            )}
          </Box>
        </Box>

        {/* Middle — node tree */}
        <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
          <Box sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Структура</Typography>
            {selectedCourseId && (
              <Tooltip title="Добавить модуль">
                <IconButton size="small" color="primary" onClick={addRootModule}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {!selectedCourseId ? (
              <Box sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary" fontStyle="italic">Выберите курс</Typography></Box>
            ) : treeLoading ? (
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={18} /></Box>
            ) : tree.length === 0 ? (
              <Box sx={{ p: 2.5 }}>
                <Typography variant="body2" color="text.secondary" fontStyle="italic">Нет модулей. Добавьте первый.</Typography>
              </Box>
            ) : (
              <NodeTree
                nodes={tree}
                depth={0}
                selectedTaskId={selectedTaskId}
                selectedContentNodeId={selectedContentNode?.id ?? null}
                onSelectTask={(_nodeId, taskId) => { setSelectedContentNode(null); setSelectedTaskId(taskId); }}
                onSelectNode={(node) => { setSelectedTaskId(null); setSelectedContentNode(node); }}
                onAddChild={(node) => { setNewNodeTitle(''); setAddChildFor(node); }}
                onAddTask={(node) => { setNewTaskTitle(''); setAddTaskFor(node); }}
                onDeleteNode={deleteNode}
                onDeleteNodeTask={deleteNodeTask}
              />
            )}
          </Box>
        </Box>

        {/* Right — task editor / node content editor */}
        {selectedTaskId ? (
          <TaskEditor
            key={selectedTaskId}
            taskId={selectedTaskId}
            onDeleted={() => { setSelectedTaskId(null); if (selectedCourseId) loadTree(selectedCourseId); }}
            setToast={setToast}
          />
        ) : selectedContentNode ? (
          <NodeContentEditor key={selectedContentNode.id} node={selectedContentNode} setToast={setToast} />
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary" fontStyle="italic">Выберите тему или задачу в структуре курса</Typography>
          </Box>
        )}

        {/* Create course dialog */}
        <Dialog open={createCourseDialog} onClose={() => setCreateCourseDialog(false)}>
          <DialogTitle>Новый курс ТехноЛаб</DialogTitle>
          <DialogContent>
            <TextField autoFocus label="Название курса" value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createCourse(); }} size="small" sx={{ mt: 1, minWidth: 340 }} />
          </DialogContent>
          <DialogActions sx={{ px: 2.5, pb: 2 }}>
            <Button onClick={() => setCreateCourseDialog(false)}>Отмена</Button>
            <Button variant="contained" disabled={!newCourseTitle.trim() || creating} onClick={createCourse}>Создать</Button>
          </DialogActions>
        </Dialog>

        {/* Add node dialog */}
        <Dialog open={!!addChildFor} onClose={() => setAddChildFor(null)}>
          <DialogTitle>
            {addChildFor && (addChildFor.id === 0 ? 'Новый модуль' : `Новый узел в «${addChildFor.title}»`)}
          </DialogTitle>
          <DialogContent>
            <TextField autoFocus label="Название" value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAddChild(); }} size="small" sx={{ mt: 1, minWidth: 340 }} />
          </DialogContent>
          <DialogActions sx={{ px: 2.5, pb: 2 }}>
            <Button onClick={() => setAddChildFor(null)}>Отмена</Button>
            <Button variant="contained" disabled={!newNodeTitle.trim()} onClick={submitAddChild}>Создать</Button>
          </DialogActions>
        </Dialog>

        {/* Add task dialog */}
        <Dialog open={!!addTaskFor} onClose={() => setAddTaskFor(null)}>
          <DialogTitle>Новая задача {addTaskFor ? `в «${addTaskFor.title}»` : ''}</DialogTitle>
          <DialogContent>
            <TextField autoFocus label="Название задачи" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAddTask(); }} size="small" sx={{ mt: 1, minWidth: 340 }} />
          </DialogContent>
          <DialogActions sx={{ px: 2.5, pb: 2 }}>
            <Button onClick={() => setAddTaskFor(null)}>Отмена</Button>
            <Button variant="contained" disabled={!newTaskTitle.trim()} onClick={submitAddTask}>Создать</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert severity={toast?.err ? 'error' : 'success'} onClose={() => setToast(null)}>
            {toast?.msg}
          </Alert>
        </Snackbar>
      </Box>
    </Layout>
  );
}
