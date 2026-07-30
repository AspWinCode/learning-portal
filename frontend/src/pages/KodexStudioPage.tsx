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
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { kodexExternalApi, KodexExternalFull, KodexExternalSummary } from '../services/kodexApi';

type KodexApiClient = typeof kodexExternalApi;

// ─── Colour palette ──────────────────────────────────────────────────────────
const K = {
  void: '#05070a',
  panel: 'rgba(10,15,18,0.90)',
  panelBorder: 'rgba(0,255,171,0.18)',
  neon: '#00ffab',
  neonSoft: '#58ffcb',
  neonDim: '#00c98a',
  cyan: '#35c7ff',
  danger: '#ff3d54',
  text: '#e9f3f1',
  textDim: '#8ea3a1',
  textFaint: '#52605f',
  mono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: K.textDim },
  in_review: { label: 'На проверке', color: K.cyan },
  approved: { label: 'Одобрено', color: K.neon },
  changes_requested: { label: 'Нужны правки', color: K.danger },
};

const DIFFICULTY_LABELS = ['', 'Новичок', 'Агент', 'Эксперт'];

// ─── Empty case template ─────────────────────────────────────────────────────
const EMPTY_CASE = (): Partial<KodexExternalFull> => ({
  slug: '',
  num: '',
  title: '',
  curator: '',
  playable: false,
  rank: 1,
  difficulty: 1,
  reward_credits: 0,
  reward_rep: 0,
  goal: '',
  suspects: '',
  task: '',
  anno: '',
  fn_name: '',
  starter: '',
  briefing: [],
  materials: [],
  evidence: [],
  hints: {},
  versions: [],
  finale: [],
  is_seed: false,
  is_override: false,
  status: null,
});

// ─── Field stylings shared ───────────────────────────────────────────────────
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: K.panelBorder },
    '&:hover fieldset': { borderColor: K.neonDim },
    '&.Mui-focused fieldset': { borderColor: K.neon },
    color: K.text,
  },
  '& .MuiInputLabel-root': { color: K.textFaint },
  '& .MuiInputLabel-root.Mui-focused': { color: K.neon },
  '& .MuiFormHelperText-root': { color: K.textFaint },
};

const monoSx = { fontFamily: K.mono, fontSize: 12 };

// ─── Raw JSON editor (fallback) ──────────────────────────────────────────────
interface JsonFieldProps {
  label: string;
  value: any;
  onChange: (v: any) => void;
  minRows?: number;
}

const JsonField: React.FC<JsonFieldProps> = ({ label, value, onChange, minRows = 4 }) => {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState('');
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);
  const handleBlur = () => {
    try { setErr(''); onChange(JSON.parse(text)); }
    catch { setErr('Некорректный JSON'); }
  };
  return (
    <TextField label={label} multiline minRows={minRows} maxRows={20} fullWidth
      value={text} onChange={(e) => setText(e.target.value)} onBlur={handleBlur}
      error={!!err} helperText={err || 'Редактируется как JSON'}
      inputProps={{ style: monoSx }}
      sx={{ ...fieldSx }}
    />
  );
};

// ─── Move item helpers ───────────────────────────────────────────────────────
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
}

// ─── Finale editor ──────────────────────────────────────────────────────────
// Structure: Array<{ curator: string; text: string } | { curator: string; body: any[]; expect?: string }>
interface FinaleEditorProps {
  items: any[];
  onChange: (v: any[]) => void;
}

const FinaleEditor: React.FC<FinaleEditorProps> = ({ items, onChange }) => {
  const add = () => onChange([...items, { curator: '', text: '' }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const upd = (i: number, field: string, val: any) =>
    onChange(items.map((it, j) => j === i ? { ...it, [field]: val } : it));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, flex: 1 }}>
          Финальный диалог — показывается после решения дела
        </Typography>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={add}
          sx={{ color: K.neon, fontFamily: K.mono, fontSize: 11, letterSpacing: '0.05em' }}>
          Добавить реплику
        </Button>
      </Box>

      {items.length === 0 && (
        <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>
          Финал пуст — нажмите «Добавить реплику»
        </Typography>
      )}

      {items.map((entry, i) => (
        <Paper key={i} sx={{ p: 2, mb: 1.5, bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${K.panelBorder}`, borderRadius: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Спикер"
              value={entry.curator ?? entry.speaker ?? ''}
              onChange={(e) => upd(i, entry.curator !== undefined ? 'curator' : 'speaker', e.target.value)}
              size="small"
              sx={{ width: 150, ...fieldSx, '& input': monoSx }}
              placeholder="viktor"
            />
            <TextField
              label="Текст реплики"
              value={entry.text ?? ''}
              onChange={(e) => upd(i, 'text', e.target.value)}
              multiline minRows={2} maxRows={6}
              size="small" sx={{ flex: 1, ...fieldSx }}
              inputProps={{ style: monoSx }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <IconButton size="small" disabled={i === 0} onClick={() => onChange(moveItem(items, i, i - 1))}
                sx={{ color: K.textFaint, '&:not(:disabled):hover': { color: K.neon } }}>
                <ArrowUpIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, i + 1))}
                sx={{ color: K.textFaint, '&:not(:disabled):hover': { color: K.neon } }}>
                <ArrowDownIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => remove(i)} sx={{ color: K.danger }}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
};

// ─── Body block editor ───────────────────────────────────────────────────────
// body = Array<string | { code: string }>
// We render each block as a card with a type toggle (text / code)
interface BodyBlocksProps {
  blocks: any[];
  onChange: (v: any[]) => void;
}

const BodyBlocks: React.FC<BodyBlocksProps> = ({ blocks, onChange }) => {
  const addText = () => onChange([...blocks, '']);
  const addCode = () => onChange([...blocks, { code: '' }]);
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const upd = (i: number, val: any) => onChange(blocks.map((b, j) => j === i ? val : b));

  return (
    <Box>
      {blocks.map((block, i) => {
        const isCode = typeof block === 'object' && block !== null && 'code' in block;
        return (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
            <Box sx={{
              width: 4, alignSelf: 'stretch', borderRadius: 1, flexShrink: 0,
              bgcolor: isCode ? K.cyan : K.neonDim,
            }} />
            <TextField
              multiline minRows={isCode ? 3 : 2} maxRows={10}
              fullWidth size="small"
              label={isCode ? 'Код' : 'Текст'}
              value={isCode ? block.code : block}
              onChange={(e) => upd(i, isCode ? { code: e.target.value } : e.target.value)}
              inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
              sx={fieldSx}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Tooltip title={isCode ? 'Сделать текстом' : 'Сделать кодом'}>
                <IconButton size="small" onClick={() => upd(i, isCode ? (block.code || '') : { code: typeof block === 'string' ? block : '' })}
                  sx={{ color: isCode ? K.cyan : K.neonDim, fontSize: 11, fontFamily: K.mono, width: 28, height: 28 }}>
                  {isCode ? '<>' : 'T'}
                </IconButton>
              </Tooltip>
              <IconButton size="small" disabled={i === 0} onClick={() => onChange(moveItem(blocks, i, i - 1))}
                sx={{ color: K.textFaint }}>
                <ArrowUpIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" disabled={i === blocks.length - 1} onClick={() => onChange(moveItem(blocks, i, i + 1))}
                sx={{ color: K.textFaint }}>
                <ArrowDownIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={() => remove(i)} sx={{ color: K.danger }}>
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={addText}
          sx={{ color: K.neonDim, fontFamily: K.mono, fontSize: 11 }}>
          + Текст
        </Button>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={addCode}
          sx={{ color: K.cyan, fontFamily: K.mono, fontSize: 11 }}>
          + Код
        </Button>
      </Box>
    </Box>
  );
};

// ─── Briefing editor ─────────────────────────────────────────────────────────
// Structure: Array<{ curator: string; body: (string | { code: string })[]; expect?: string }>
interface BriefingEditorProps {
  items: any[];
  onChange: (v: any[]) => void;
}

const BriefingEditor: React.FC<BriefingEditorProps> = ({ items, onChange }) => {
  const [expanded, setExpanded] = useState<number | null>(0);
  const add = () => {
    const next = [...items, { curator: '', body: [''], expect: '' }];
    onChange(next);
    setExpanded(next.length - 1);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    setExpanded(null);
  };
  const upd = (i: number, field: string, val: any) =>
    onChange(items.map((it, j) => j === i ? { ...it, [field]: val } : it));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, flex: 1 }}>
          Брифинг — диалог куратора до начала задания
        </Typography>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={add}
          sx={{ color: K.neon, fontFamily: K.mono, fontSize: 11 }}>
          Добавить блок
        </Button>
      </Box>

      {items.length === 0 && (
        <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>
          Брифинг пуст — нажмите «Добавить блок»
        </Typography>
      )}

      {items.map((entry, i) => {
        const isOpen = expanded === i;
        const curator = entry.curator ?? '';
        const body: any[] = Array.isArray(entry.body) ? entry.body : (entry.body ? [entry.body] : ['']);
        return (
          <Paper key={i} sx={{ mb: 1.5, bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${K.panelBorder}`, borderRadius: 1.5, overflow: 'hidden' }}>
            {/* Header row */}
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1,
              bgcolor: isOpen ? 'rgba(0,255,171,0.05)' : 'transparent', cursor: 'pointer' }}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.neonDim, minWidth: 20 }}>
                #{i + 1}
              </Typography>
              <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: curator ? K.text : K.textFaint, flex: 1 }}>
                {curator || '(нет спикера)'}
              </Typography>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onChange(moveItem(items, i, i - 1)); }} disabled={i === 0}
                sx={{ color: K.textFaint }}>
                <ArrowUpIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onChange(moveItem(items, i, i + 1)); }} disabled={i === items.length - 1}
                sx={{ color: K.textFaint }}>
                <ArrowDownIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); remove(i); }} sx={{ color: K.danger }}>
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
              {isOpen ? <ExpandLessIcon sx={{ color: K.textFaint, fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: K.textFaint, fontSize: 18 }} />}
            </Box>

            {/* Expanded content */}
            {isOpen && (
              <Box sx={{ px: 2, pb: 2, pt: 1, borderTop: `1px solid ${K.panelBorder}` }}>
                <TextField
                  label="Куратор / спикер"
                  value={curator}
                  onChange={(e) => upd(i, 'curator', e.target.value)}
                  size="small" fullWidth sx={{ mb: 2, ...fieldSx, '& input': monoSx }}
                  placeholder="viktor"
                />
                <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint, mb: 1 }}>
                  Содержимое блока (блоки текста и кода)
                </Typography>
                <BodyBlocks blocks={body} onChange={(v) => upd(i, 'body', v)} />
                {('expect' in entry) && (
                  <TextField
                    label="Ожидаемый вывод (expect)"
                    value={entry.expect ?? ''}
                    onChange={(e) => upd(i, 'expect', e.target.value)}
                    size="small" fullWidth sx={{ mt: 2, ...fieldSx, '& input': monoSx }}
                    inputProps={{ style: monoSx }}
                  />
                )}
                <Button size="small" onClick={() => upd(i, 'expect', entry.expect !== undefined ? undefined : '')}
                  sx={{ mt: 1, color: K.textFaint, fontFamily: K.mono, fontSize: 10 }}>
                  {entry.expect !== undefined ? '− убрать expect' : '+ добавить expect'}
                </Button>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Evidence (улики) editor ──────────────────────────────────────────────────
// Structure: Array<{ id: string; title: string; fnName?: string; starter?: string; tests?: any[]; body?: any[]; ... }>
interface EvidenceEditorProps {
  items: any[];
  onChange: (v: any[]) => void;
}

const EvidenceEditor: React.FC<EvidenceEditorProps> = ({ items, onChange }) => {
  const [expanded, setExpanded] = useState<number | null>(null);
  const add = () => {
    const next = [...items, { id: String(items.length + 1), title: '', fnName: '', starter: '', tests: [] }];
    onChange(next);
    setExpanded(next.length - 1);
  };
  const remove = (i: number) => { onChange(items.filter((_, j) => j !== i)); setExpanded(null); };
  const upd = (i: number, field: string, val: any) =>
    onChange(items.map((it, j) => j === i ? { ...it, [field]: val } : it));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, flex: 1 }}>
          Улики — задачи на программирование внутри дела
        </Typography>
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />} onClick={add}
          sx={{ color: K.neon, fontFamily: K.mono, fontSize: 11 }}>
          Добавить улику
        </Button>
      </Box>

      {items.length === 0 && (
        <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>
          Улики отсутствуют
        </Typography>
      )}

      {items.map((item, i) => {
        const isOpen = expanded === i;
        return (
          <Paper key={i} sx={{ mb: 1.5, bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${K.panelBorder}`, borderRadius: 1.5, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1,
              bgcolor: isOpen ? 'rgba(0,255,171,0.05)' : 'transparent', cursor: 'pointer' }}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <Box sx={{ bgcolor: K.neonDim, color: '#04140f', borderRadius: 0.5, px: 0.75, py: 0.25, fontFamily: K.mono, fontSize: 10, fontWeight: 700 }}>
                #{item.id || i + 1}
              </Box>
              <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: item.title ? K.text : K.textFaint, flex: 1 }}>
                {item.title || '(без названия)'}
              </Typography>
              {item.fnName && (
                <Typography sx={{ fontFamily: K.mono, fontSize: 10, color: K.cyan }}>
                  {item.fnName}()
                </Typography>
              )}
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onChange(moveItem(items, i, i - 1)); }} disabled={i === 0}
                sx={{ color: K.textFaint }}>
                <ArrowUpIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onChange(moveItem(items, i, i + 1)); }} disabled={i === items.length - 1}
                sx={{ color: K.textFaint }}>
                <ArrowDownIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); remove(i); }} sx={{ color: K.danger }}>
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
              {isOpen ? <ExpandLessIcon sx={{ color: K.textFaint, fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: K.textFaint, fontSize: 18 }} />}
            </Box>

            {/* Expanded fields */}
            {isOpen && (
              <Box sx={{ px: 2, pb: 2, pt: 1.5, borderTop: `1px solid ${K.panelBorder}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField label="ID улики" value={item.id ?? ''} onChange={(e) => upd(i, 'id', e.target.value)}
                    size="small" sx={{ width: 100, ...fieldSx, '& input': monoSx }} />
                  <TextField label="Название" value={item.title ?? ''} onChange={(e) => upd(i, 'title', e.target.value)}
                    size="small" sx={{ flex: 1, ...fieldSx }} />
                </Box>

                {/* Body (description blocks) if present */}
                {Array.isArray(item.body) && (
                  <Box>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint, mb: 1 }}>Описание (блоки)</Typography>
                    <BodyBlocks blocks={item.body} onChange={(v) => upd(i, 'body', v)} />
                  </Box>
                )}
                {/* Plain description if present */}
                {typeof item.description === 'string' && (
                  <TextField label="Описание" value={item.description} onChange={(e) => upd(i, 'description', e.target.value)}
                    multiline minRows={2} size="small" fullWidth sx={fieldSx} inputProps={{ style: monoSx }} />
                )}

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField label="Имя функции (fnName)" value={item.fnName ?? ''} onChange={(e) => upd(i, 'fnName', e.target.value)}
                    size="small" sx={{ flex: 1, ...fieldSx, '& input': monoSx }} placeholder="solve" />
                </Box>

                <TextField label="Стартовый код" value={item.starter ?? ''} onChange={(e) => upd(i, 'starter', e.target.value)}
                  multiline minRows={3} maxRows={10} size="small" fullWidth sx={fieldSx}
                  inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
                  helperText="Шаблон кода, который видит студент" />

                <JsonField label="Тесты (JSON)" value={item.tests ?? []}
                  onChange={(v) => upd(i, 'tests', v)} minRows={3} />

                {/* Hints per evidence if present */}
                {item.hints !== undefined && (
                  <JsonField label="Подсказки (JSON)" value={item.hints}
                    onChange={(v) => upd(i, 'hints', v)} minRows={2} />
                )}
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Case card in sidebar ─────────────────────────────────────────────────────
interface CaseCardProps {
  c: KodexExternalSummary;
  selected: boolean;
  onClick: () => void;
}

const CaseCard: React.FC<CaseCardProps> = ({ c, selected, onClick }) => {
  const st = STATUS_LABELS[c.status ?? ''] || STATUS_LABELS.draft;
  return (
    <Box onClick={onClick} sx={{
      p: 1.5, cursor: 'pointer',
      borderLeft: `2px solid ${selected ? K.neon : 'transparent'}`,
      background: selected ? 'rgba(0,255,171,0.06)' : 'transparent',
      transition: 'all 0.15s',
      '&:hover': { background: 'rgba(0,255,171,0.04)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint }}>
          {c.num || c.slug}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: st.color, flexShrink: 0 }} />
      </Box>
      <Typography sx={{ fontSize: 13, color: K.text, lineHeight: 1.3, mb: 0.3 }}>
        {c.title}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Typography sx={{ fontSize: 11, color: K.textFaint }}>
          {DIFFICULTY_LABELS[c.difficulty] || ''}
        </Typography>
        {c.playable && (
          <Typography sx={{ fontSize: 11, color: K.neonDim }}>● активно</Typography>
        )}
      </Box>
    </Box>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const SIDEBAR_WIDTH = 272;
const TOP_BAR_H = 52;
const SECOND_BAR_H = 44;

const KodexStudioPage: React.FC<{ api?: KodexApiClient }> = ({ api: apiClient = kodexExternalApi }) => {
  const [cases, setCases] = useState<KodexExternalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<KodexExternalFull> | null>(null);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.list();
      setCases(data);
    } catch {
      setToast({ msg: 'Ошибка загрузки дел', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const openCase = async (slug: string) => {
    setSelectedId(slug);
    setTab(0);
    try {
      const full = await apiClient.get(slug);
      setEditing({ ...full });
    } catch {
      setToast({ msg: 'Ошибка загрузки дела', severity: 'error' });
    }
  };

  const save = async () => {
    if (!editing || !selectedId) return;
    setSaving(true);
    try {
      const updated = await apiClient.update(selectedId, editing as any);
      setEditing({ ...updated });
      setCases((prev) => prev.map((c) => (c.slug === selectedId ? { ...c, ...updated } : c)));
      setToast({ msg: 'Сохранено', severity: 'success' });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const errMsg = Array.isArray(detail?.errors)
        ? detail.errors.join('; ')
        : (detail?.error || (typeof detail === 'string' ? detail : null) || 'Ошибка сохранения');
      setToast({ msg: String(errMsg), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const createCase = async (payload: Partial<KodexExternalFull>) => {
    try {
      await apiClient.create(payload as any);
      setNewDialog(false);
      await loadCases();
      if (payload.slug) await openCase(payload.slug);
      setToast({ msg: 'Дело создано', severity: 'success' });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail?.error || e?.response?.data?.detail || 'Ошибка создания', severity: 'error' });
    }
  };

  const deleteCase = async (slug: string) => {
    const isSeed = cases.find((c) => c.slug === slug)?.is_seed ?? true;
    try {
      await apiClient.delete(slug);
      setCases((prev) => prev.filter((c) => c.slug !== slug));
      if (selectedId === slug) { setSelectedId(null); setEditing(null); }
      setDeleteConfirm(null);
      setToast({ msg: isSeed ? 'Правки сброшены к исходному делу' : 'Дело удалено', severity: 'success' });
      if (isSeed) await loadCases();
    } catch {
      setToast({ msg: 'Ошибка', severity: 'error' });
    }
  };

  const patch = (field: string, value: any) =>
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));

  const filtered = cases.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.slug || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.num || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box sx={{ height: '100vh', bgcolor: K.void, color: K.text, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: K.mono }}>

      {/* ── Row 1: full-width top bar ── */}
      <Box sx={{
        height: TOP_BAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: `1px solid ${K.panelBorder}`, bgcolor: 'rgba(0,255,171,0.025)',
      }}>
        {/* Logo section (aligned with sidebar) */}
        <Box sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1, px: 2 }}>
          <ShieldIcon sx={{ color: K.neon, fontSize: 18 }} />
          <Typography sx={{ fontFamily: K.mono, fontWeight: 700, letterSpacing: '0.18em', color: K.text, fontSize: 13 }}>
            КОДЭКС
          </Typography>
          <Typography sx={{ fontSize: 10, color: K.textFaint, letterSpacing: '0.3em' }}>
            СТУДИЯ
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: K.panelBorder }} />

        {/* Case toolbar */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5 }}>
          {editing ? (
            <>
              <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editing.num || editing.slug || 'Дело'} — {editing.title}
              </Typography>
              {editing.status && (
                <Chip
                  label={STATUS_LABELS[editing.status]?.label || editing.status}
                  size="small"
                  sx={{ fontFamily: K.mono, fontSize: 10, color: STATUS_LABELS[editing.status]?.color || K.textDim, bgcolor: 'rgba(0,0,0,0.35)', border: `1px solid ${STATUS_LABELS[editing.status]?.color || K.panelBorder}` }}
                />
              )}
              <Tooltip title={editing.is_seed ? 'Сбросить правки к исходному' : 'Удалить дело'}>
                <IconButton size="small" onClick={() => setDeleteConfirm(selectedId!)} sx={{ color: K.danger }}>
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon sx={{ fontSize: 16 }} />}
                onClick={save} disabled={saving}
                sx={{ bgcolor: K.neon, color: '#04140f', fontFamily: K.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', height: 34, '&:hover': { bgcolor: K.neonSoft }, '&:disabled': { bgcolor: K.neonDim, color: '#04140f' } }}
              >
                Сохранить
              </Button>
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: K.textFaint, fontFamily: K.mono }}>
              Выберите дело из списка
            </Typography>
          )}
        </Box>
      </Box>

      {/* ── Row 2: search + tabs ── */}
      <Box sx={{
        height: SECOND_BAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: `1px solid ${K.panelBorder}`,
      }}>
        {/* Search (aligned with sidebar) */}
        <Box sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, px: 1.5, display: 'flex', alignItems: 'center' }}>
          <TextField
            placeholder="Поиск дел..."
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: K.textFaint, fontSize: 15, mr: 0.5 }} />,
              sx: { fontFamily: K.mono, fontSize: 12, height: 32 },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(0,0,0,0.3)',
                '& fieldset': { borderColor: K.panelBorder },
                '&:hover fieldset': { borderColor: K.neonDim },
                '&.Mui-focused fieldset': { borderColor: K.neon },
              },
            }}
          />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: K.panelBorder }} />

        {/* Tabs */}
        {editing ? (
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              flex: 1, minHeight: SECOND_BAR_H,
              '& .MuiTab-root': { fontFamily: K.mono, fontSize: 12, color: K.textFaint, letterSpacing: '0.06em', minHeight: SECOND_BAR_H, py: 0 },
              '& .Mui-selected': { color: K.neon },
              '& .MuiTabs-indicator': { bgcolor: K.neon },
            }}
          >
            <Tab label="Основное" />
            <Tab label="Брифинг" />
            <Tab label="Улики" />
            <Tab label="Финал" />
            <Tab label="JSON" />
          </Tabs>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
      </Box>

      {/* ── Main area ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <Box sx={{
          width: SIDEBAR_WIDTH, flexShrink: 0,
          borderRight: `1px solid ${K.panelBorder}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Case list */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                <CircularProgress size={22} sx={{ color: K.neon }} />
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 12, color: K.textFaint }}>
                  {search ? 'Ничего не найдено' : 'Дел пока нет'}
                </Typography>
              </Box>
            ) : (
              filtered.map((c) => (
                <React.Fragment key={c.slug}>
                  <CaseCard c={c} selected={c.slug === selectedId} onClick={() => openCase(c.slug)} />
                  <Divider sx={{ borderColor: K.panelBorder, opacity: 0.35 }} />
                </React.Fragment>
              ))
            )}
          </Box>

          {/* Add button */}
          <Box sx={{ p: 1.5, borderTop: `1px solid ${K.panelBorder}` }}>
            <Button
              fullWidth variant="outlined"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => setNewDialog(true)}
              sx={{ color: K.neon, borderColor: K.panelBorder, fontFamily: K.mono, fontSize: 11, letterSpacing: '0.08em', height: 34, '&:hover': { borderColor: K.neon, bgcolor: 'rgba(0,255,171,0.06)' } }}
            >
              Новое дело
            </Button>
          </Box>
        </Box>

        {/* ── Editor content ── */}
        {!editing ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <SearchIcon sx={{ fontSize: 48, color: K.textFaint, mb: 2 }} />
            <Typography sx={{ fontFamily: K.mono, color: K.textDim, letterSpacing: '0.1em' }}>
              Выберите дело из списка слева
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

            {/* ── Tab 0: Basic ── */}
            {tab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 720 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField label="Идентификатор (slug)"
                    value={editing.slug || ''}
                    onChange={(e) => patch('slug', e.target.value)}
                    inputProps={{ style: monoSx }} size="small" sx={{ flex: 1, ...fieldSx }}
                    helperText="Только латиница, цифры и дефис"
                  />
                  <TextField label="Номер (num)"
                    value={editing.num || ''}
                    onChange={(e) => patch('num', e.target.value)}
                    inputProps={{ style: monoSx }} size="small" sx={{ width: 140, ...fieldSx }}
                    placeholder="CASE-001"
                  />
                </Box>

                <TextField label="Название дела *"
                  value={editing.title || ''}
                  onChange={(e) => patch('title', e.target.value)}
                  fullWidth sx={fieldSx}
                />

                <TextField label="Куратор"
                  value={editing.curator || ''}
                  onChange={(e) => patch('curator', e.target.value)}
                  fullWidth sx={fieldSx} placeholder="viktor"
                />

                <TextField label="Аннотация (для карточки)"
                  value={editing.anno || ''}
                  onChange={(e) => patch('anno', e.target.value)}
                  fullWidth multiline rows={2} sx={fieldSx}
                />

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel sx={{ color: K.textFaint, '&.Mui-focused': { color: K.neon } }}>Сложность</InputLabel>
                    <Select value={editing.difficulty || 1}
                      onChange={(e) => patch('difficulty', Number(e.target.value))}
                      label="Сложность"
                      sx={{ color: K.text, '& .MuiOutlinedInput-notchedOutline': { borderColor: K.panelBorder } }}>
                      <MenuItem value={1}>Новичок</MenuItem>
                      <MenuItem value={2}>Агент</MenuItem>
                      <MenuItem value={3}>Эксперт</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField label="Ранг (уровень доступа)" type="number"
                    value={editing.rank || 1} onChange={(e) => patch('rank', Number(e.target.value))}
                    size="small" sx={{ width: 160, ...fieldSx }} inputProps={{ min: 1 }}
                  />
                  <TextField label="Кредиты" type="number"
                    value={editing.reward_credits || 0} onChange={(e) => patch('reward_credits', Number(e.target.value))}
                    size="small" sx={{ width: 110, ...fieldSx }} inputProps={{ min: 0 }}
                  />
                  <TextField label="Репутация" type="number"
                    value={editing.reward_rep || 0} onChange={(e) => patch('reward_rep', Number(e.target.value))}
                    size="small" sx={{ width: 110, ...fieldSx }} inputProps={{ min: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch checked={!!editing.playable} onChange={(e) => patch('playable', e.target.checked)}
                        sx={{ '& .MuiSwitch-thumb': { bgcolor: editing.playable ? K.neon : undefined } }}
                      />
                    }
                    label={<Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Активно для учеников</Typography>}
                  />
                </Box>

                <Divider sx={{ borderColor: K.panelBorder }} />

                <TextField label="Цель расследования"
                  value={editing.goal || ''} onChange={(e) => patch('goal', e.target.value)}
                  fullWidth multiline rows={2} sx={fieldSx}
                />
                <TextField label="Подозреваемые / участники"
                  value={editing.suspects || ''} onChange={(e) => patch('suspects', e.target.value)}
                  fullWidth multiline rows={2} sx={fieldSx}
                />
                <TextField label="Задание для агента"
                  value={editing.task || ''} onChange={(e) => patch('task', e.target.value)}
                  fullWidth multiline rows={3} sx={fieldSx}
                />

                <Divider sx={{ borderColor: K.panelBorder }} />

                <TextField label="Имя функции (fnName)"
                  value={editing.fn_name || ''} onChange={(e) => patch('fn_name', e.target.value)}
                  fullWidth inputProps={{ style: monoSx }} sx={fieldSx}
                  helperText="Пустое = script mode (студент пишет скрипт целиком)"
                />
                <TextField label="Стартовый код"
                  value={editing.starter || ''} onChange={(e) => patch('starter', e.target.value)}
                  fullWidth multiline rows={5} inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }} sx={fieldSx}
                  helperText="Шаблон кода, который видит студент в начале задачи"
                />
              </Box>
            )}

            {/* ── Tab 1: Briefing ── */}
            {tab === 1 && (
              <Box sx={{ maxWidth: 760 }}>
                <BriefingEditor
                  items={editing.briefing || []}
                  onChange={(v) => patch('briefing', v)}
                />
                <Divider sx={{ borderColor: K.panelBorder, my: 3 }} />
                <Box>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>Материалы дела</Typography>
                  <JsonField label="Материалы (JSON)" value={editing.materials || []} onChange={(v) => patch('materials', v)} minRows={3} />
                </Box>
              </Box>
            )}

            {/* ── Tab 2: Evidence / Tests ── */}
            {tab === 2 && (
              <Box sx={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <EvidenceEditor
                  items={editing.evidence || []}
                  onChange={(v) => patch('evidence', v)}
                />
                <Box>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                    Версии закрытия дела — {`[{ id, text, correct: bool }]`}
                  </Typography>
                  <JsonField label="Версии (JSON)" value={editing.versions || []} onChange={(v) => patch('versions', v)} minRows={3} />
                </Box>
                <Box>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                    Подсказки — {`{ "key": { "1": "...", "2": "..." } }`}
                  </Typography>
                  <JsonField label="Подсказки (JSON)" value={editing.hints || {}} onChange={(v) => patch('hints', v)} minRows={3} />
                </Box>
              </Box>
            )}

            {/* ── Tab 3: Finale ── */}
            {tab === 3 && (
              <Box sx={{ maxWidth: 760 }}>
                <FinaleEditor
                  items={editing.finale || []}
                  onChange={(v) => patch('finale', v)}
                />
              </Box>
            )}

            {/* ── Tab 4: Raw JSON ── */}
            {tab === 4 && (
              <Box sx={{ maxWidth: 900 }}>
                <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textFaint, mb: 2 }}>
                  Полный JSON дела (только чтение). Используйте вкладки выше для редактирования.
                </Typography>
                <TextField multiline fullWidth minRows={22}
                  value={JSON.stringify(editing, null, 2)}
                  InputProps={{ readOnly: true, sx: { fontFamily: K.mono, fontSize: 11 } }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.4)', '& fieldset': { borderColor: K.panelBorder } } }}
                />
              </Box>
            )}

          </Box>
        )}
      </Box>

      {/* ── Dialogs & toasts ── */}
      <NewCaseDialog open={newDialog} onClose={() => setNewDialog(false)} onCreate={createCase} />

      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}
        PaperProps={{ sx: { bgcolor: '#0a0f12', border: `1px solid ${K.danger}`, borderRadius: 2 } }}>
        <DialogTitle sx={{ fontFamily: K.mono, color: K.danger, fontSize: 14 }}>
          {editing?.is_seed ? 'Сбросить правки?' : 'Удалить дело?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.textDim }}>
            {editing?.is_seed
              ? 'Все изменения будут удалены. Дело вернётся к исходному виду из базы Кодэкс.'
              : 'Это действие необратимо. Новое дело будет удалено из базы Кодэкс.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: K.textDim, fontFamily: K.mono }}>Отмена</Button>
          <Button onClick={() => deleteCase(deleteConfirm!)} sx={{ color: K.danger, fontFamily: K.mono }}>
            {editing?.is_seed ? 'Сбросить' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.severity || 'success'} onClose={() => setToast(null)}
          sx={{ fontFamily: K.mono, fontSize: 13 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// ─── New case dialog ──────────────────────────────────────────────────────────
interface NewCaseDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Partial<KodexExternalFull>) => void;
}

const NewCaseDialog: React.FC<NewCaseDialogProps> = ({ open, onClose, onCreate }) => {
  const [form, setForm] = useState({ slug: '', num: '', title: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm({ slug: '', num: '', title: '' }); setError(''); }
  }, [open]);

  const handleCreate = () => {
    if (!form.slug.trim() || !form.title.trim()) { setError('Идентификатор и название обязательны'); return; }
    if (!/^[a-z0-9\-]+$/.test(form.slug)) { setError('Идентификатор: только строчные латинские буквы, цифры и дефис'); return; }
    onCreate({ ...EMPTY_CASE(), ...form });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: '#0a0f12', border: `1px solid ${K.panelBorder}`, borderRadius: 2 } }}>
      <DialogTitle sx={{ fontFamily: K.mono, color: K.neon, fontSize: 14, letterSpacing: '0.12em' }}>
        НОВОЕ ДЕЛО
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" sx={{ fontFamily: K.mono, fontSize: 12 }}>{error}</Alert>}
        <TextField label="Идентификатор (slug)" value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, '') }))}
          fullWidth required inputProps={{ style: monoSx }} helperText="Например: case-001, mystery-cipher"
          sx={fieldSx}
        />
        <TextField label="Номер дела" value={form.num}
          onChange={(e) => setForm((f) => ({ ...f, num: e.target.value }))}
          fullWidth placeholder="CASE-001" inputProps={{ style: monoSx }} sx={fieldSx}
        />
        <TextField label="Название" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          fullWidth required sx={fieldSx}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: K.textDim, fontFamily: K.mono }}>Отмена</Button>
        <Button onClick={handleCreate} variant="contained"
          sx={{ bgcolor: K.neon, color: '#04140f', fontFamily: K.mono, fontWeight: 700, fontSize: 12, '&:hover': { bgcolor: K.neonSoft } }}>
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KodexStudioPage;
