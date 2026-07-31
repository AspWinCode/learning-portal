import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  createTheme,
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
  ThemeProvider,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoAwesome as AiIcon,
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

// ─── Brand colours ────────────────────────────────────────────────────────────
const K = {
  void: '#05070a',
  surface: '#0d1117',
  surfaceUp: '#131a21',
  border: 'rgba(0,255,171,0.14)',
  borderHover: 'rgba(0,201,138,0.4)',
  neon: '#00ffab',
  neonSoft: '#58ffcb',
  neonDim: '#00c98a',
  cyan: '#35c7ff',
  danger: '#ff3d54',
  text: '#ddeae7',
  textDim: '#7a9490',
  textFaint: '#3e5450',
  mono: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
};

// ─── MUI dark theme scoped to this page ──────────────────────────────────────
const kodexTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: K.neon },
    error: { main: K.danger },
    background: { default: K.void, paper: K.surface },
    text: { primary: K.text, secondary: K.textDim },
    divider: K.border,
  },
  typography: { fontFamily: K.mono, fontSize: 13 },
  shape: { borderRadius: 6 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.03)',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: K.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: K.borderHover },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: K.neon, borderWidth: 1 },
          '&.Mui-focused': { backgroundColor: 'rgba(0,255,171,0.03)' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: K.textDim, fontSize: 12, '&.Mui-focused': { color: K.neon } },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { color: K.textFaint, fontSize: 11 } } },
    MuiTab: {
      styleOverrides: {
        root: { fontFamily: K.mono, fontSize: 12, letterSpacing: '0.05em', textTransform: 'none', minHeight: 44 },
      },
    },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontFamily: K.mono } } },
    MuiMenuItem: { styleOverrides: { root: { fontFamily: K.mono, fontSize: 13 } } },
    MuiChip: { styleOverrides: { root: { fontFamily: K.mono } } },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: K.neon }, '&.Mui-checked + .MuiSwitch-track': { backgroundColor: K.neonDim } },
      },
    },
  },
});

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: K.textDim },
  in_review: { label: 'На проверке', color: K.cyan },
  approved: { label: 'Одобрено', color: K.neon },
  changes_requested: { label: 'Нужны правки', color: K.danger },
};

const DIFFICULTY: Record<number, { label: string; color: string }> = {
  1: { label: 'Новичок', color: K.neonDim },
  2: { label: 'Агент', color: K.cyan },
  3: { label: 'Эксперт', color: K.danger },
};

const EMPTY_CASE = (): Partial<KodexExternalFull> => ({
  slug: '', num: '', title: '', curator: '', playable: false,
  rank: 1, difficulty: 1, reward_credits: 0, reward_rep: 0,
  goal: '', suspects: '', task: '', anno: '',
  fn_name: '', starter: '',
  briefing: [], materials: [], evidence: [], hints: {}, versions: [], finale: [],
  is_seed: false, is_override: false, status: null,
});

// ─── Section label ────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography sx={{ fontSize: 10, letterSpacing: '0.22em', color: K.textFaint, textTransform: 'uppercase', fontFamily: K.mono, mb: 1.5, mt: 0.5 }}>
    {children}
  </Typography>
);

// ─── JSON editor ──────────────────────────────────────────────────────────────
const JsonField: React.FC<{ label: string; value: any; onChange: (v: any) => void; minRows?: number }> = ({ label, value, onChange, minRows = 4 }) => {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState('');
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);
  return (
    <TextField label={label} multiline minRows={minRows} maxRows={18} fullWidth
      value={text} onChange={(e) => setText(e.target.value)}
      onBlur={() => { try { setErr(''); onChange(JSON.parse(text)); } catch { setErr('Некорректный JSON'); } }}
      error={!!err} helperText={err || 'JSON'} inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
    />
  );
};

// ─── Array helpers ────────────────────────────────────────────────────────────
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr]; const [item] = a.splice(from, 1); a.splice(to, 0, item); return a;
}

interface SortControlsProps { i: number; len: number; onUp: () => void; onDown: () => void; onRemove: () => void }
const SortControls: React.FC<SortControlsProps> = ({ i, len, onUp, onDown, onRemove }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0 }}>
    <IconButton size="small" disabled={i === 0} onClick={onUp} sx={{ color: K.textFaint, '&:not(:disabled):hover': { color: K.neon }, p: 0.5 }}>
      <ArrowUpIcon sx={{ fontSize: 16 }} />
    </IconButton>
    <IconButton size="small" disabled={i === len - 1} onClick={onDown} sx={{ color: K.textFaint, '&:not(:disabled):hover': { color: K.neon }, p: 0.5 }}>
      <ArrowDownIcon sx={{ fontSize: 16 }} />
    </IconButton>
    <IconButton size="small" onClick={onRemove} sx={{ color: K.danger, p: 0.5 }}>
      <DeleteIcon sx={{ fontSize: 15 }} />
    </IconButton>
  </Box>
);

// ─── Body blocks editor (text + code) ────────────────────────────────────────
const BodyBlocks: React.FC<{ blocks: any[]; onChange: (v: any[]) => void }> = ({ blocks, onChange }) => {
  const upd = (i: number, v: any) => onChange(blocks.map((b, j) => j === i ? v : b));
  const rem = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {blocks.map((block, i) => {
        const isCode = typeof block === 'object' && block !== null && 'code' in block;
        return (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 1, bgcolor: isCode ? K.cyan : K.neonDim, flexShrink: 0 }} />
            <TextField multiline minRows={isCode ? 3 : 1} maxRows={10} fullWidth size="small"
              label={isCode ? 'Код' : 'Текст'}
              value={isCode ? block.code : block}
              onChange={(e) => upd(i, isCode ? { code: e.target.value } : e.target.value)}
              inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Tooltip title={isCode ? 'Преобразовать в текст' : 'Преобразовать в код'} placement="left">
                <IconButton size="small" onClick={() => upd(i, isCode ? (block.code || '') : { code: String(block) })}
                  sx={{ color: isCode ? K.cyan : K.neonDim, width: 28, height: 28, fontSize: 11, fontFamily: K.mono }}>
                  {isCode ? '</>' : 'T'}
                </IconButton>
              </Tooltip>
              <SortControls i={i} len={blocks.length} onUp={() => onChange(moveItem(blocks, i, i - 1))} onDown={() => onChange(moveItem(blocks, i, i + 1))} onRemove={() => rem(i)} />
            </Box>
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button size="small" onClick={() => onChange([...blocks, ''])} startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          sx={{ color: K.neonDim, fontSize: 11, px: 1.5 }}>Текст</Button>
        <Button size="small" onClick={() => onChange([...blocks, { code: '' }])} startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          sx={{ color: K.cyan, fontSize: 11, px: 1.5 }}>Код</Button>
      </Box>
    </Box>
  );
};

// ─── Briefing editor ──────────────────────────────────────────────────────────
const BriefingEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const [open, setOpen] = useState<number | null>(0);
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <SectionLabel>Брифинг</SectionLabel>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => { const next = [...items, { curator: '', body: [''], expect: '' }]; onChange(next); setOpen(next.length - 1); }}
          sx={{ color: K.neon, fontSize: 11, px: 1.5 }}>Добавить блок</Button>
      </Box>
      {items.length === 0 && <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>Брифинг пуст</Typography>}
      {items.map((entry, i) => {
        const isOpen = open === i;
        const body: any[] = Array.isArray(entry.body) ? entry.body : [''];
        return (
          <Paper key={i} sx={{ mb: 1.5, border: `1px solid ${isOpen ? K.borderHover : K.border}`, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setOpen(isOpen ? null : i)}>
              <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.neonDim, mr: 1.5, minWidth: 24 }}>#{i + 1}</Typography>
              <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: entry.curator ? K.text : K.textFaint, flex: 1 }}>
                {entry.curator || '— куратор не задан —'}
              </Typography>
              <SortControls i={i} len={items.length}
                onUp={(e?: any) => { if (e) e.stopPropagation(); onChange(moveItem(items, i, i - 1)); }}
                onDown={(e?: any) => { if (e) e.stopPropagation(); onChange(moveItem(items, i, i + 1)); }}
                onRemove={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }} />
              {isOpen ? <ExpandLessIcon sx={{ color: K.textFaint, fontSize: 18, ml: 0.5 }} /> : <ExpandMoreIcon sx={{ color: K.textFaint, fontSize: 18, ml: 0.5 }} />}
            </Box>
            {isOpen && (
              <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: `1px solid ${K.border}` }}>
                <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: 1.5 }}>
                  <TextField label="Куратор / спикер" value={entry.curator ?? ''} onChange={(e) => upd(i, 'curator', e.target.value)}
                    size="small" sx={{ width: 180 }} placeholder="viktor" />
                  {entry.expect !== undefined && (
                    <TextField label="Ожидаемый вывод (expect)" value={entry.expect ?? ''} onChange={(e) => upd(i, 'expect', e.target.value)}
                      size="small" sx={{ flex: 1 }} inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }} />
                  )}
                  <Button size="small" onClick={() => upd(i, 'expect', entry.expect !== undefined ? undefined : '')}
                    sx={{ color: K.textFaint, fontSize: 10, whiteSpace: 'nowrap', px: 1 }}>
                    {entry.expect !== undefined ? '− expect' : '+ expect'}
                  </Button>
                </Box>
                <Typography sx={{ fontSize: 10, color: K.textFaint, letterSpacing: '0.15em', mb: 1 }}>СОДЕРЖИМОЕ</Typography>
                <BodyBlocks blocks={body} onChange={(v) => upd(i, 'body', v)} />
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Finale editor ────────────────────────────────────────────────────────────
const FinaleEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <SectionLabel>Финальный диалог</SectionLabel>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => onChange([...items, { curator: '', text: '' }])}
          sx={{ color: K.neon, fontSize: 11, px: 1.5 }}>Добавить реплику</Button>
      </Box>
      {items.length === 0 && <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>Финал пуст</Typography>}
      {items.map((entry, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start' }}>
          <TextField label="Спикер" value={entry.curator ?? entry.speaker ?? ''}
            onChange={(e) => upd(i, 'curator' in entry ? 'curator' : 'speaker', e.target.value)}
            size="small" sx={{ width: 150, flexShrink: 0 }} placeholder="viktor"
            inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
          />
          <TextField label="Текст реплики" value={entry.text ?? ''} onChange={(e) => upd(i, 'text', e.target.value)}
            multiline minRows={2} maxRows={5} size="small" sx={{ flex: 1 }}
          />
          <SortControls i={i} len={items.length}
            onUp={() => onChange(moveItem(items, i, i - 1))}
            onDown={() => onChange(moveItem(items, i, i + 1))}
            onRemove={() => onChange(items.filter((_, j) => j !== i))} />
        </Box>
      ))}
    </Box>
  );
};

// ─── Evidence editor ──────────────────────────────────────────────────────────
const EvidenceEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const [open, setOpen] = useState<number | null>(null);
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <SectionLabel>Улики — задачи на программирование</SectionLabel>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => { const next = [...items, { id: String(items.length + 1), title: '', fnName: '', starter: '', tests: [] }]; onChange(next); setOpen(next.length - 1); }}
          sx={{ color: K.neon, fontSize: 11, px: 1.5 }}>Добавить улику</Button>
      </Box>
      {items.length === 0 && <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic', py: 1 }}>Улики отсутствуют</Typography>}
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <Paper key={i} sx={{ mb: 1.5, border: `1px solid ${isOpen ? K.borderHover : K.border}`, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setOpen(isOpen ? null : i)}>
              <Box sx={{ fontFamily: K.mono, fontSize: 10, fontWeight: 700, color: '#04140f', bgcolor: K.neonDim, borderRadius: 0.75, px: 0.75, py: 0.25, mr: 1.5, flexShrink: 0 }}>
                #{item.id || i + 1}
              </Box>
              <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: item.title ? K.text : K.textFaint, flex: 1 }}>
                {item.title || '— без названия —'}
              </Typography>
              {item.fnName && (
                <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.cyan, mr: 1 }}>{item.fnName}()</Typography>
              )}
              <SortControls i={i} len={items.length}
                onUp={() => onChange(moveItem(items, i, i - 1))}
                onDown={() => onChange(moveItem(items, i, i + 1))}
                onRemove={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }} />
              {isOpen ? <ExpandLessIcon sx={{ color: K.textFaint, fontSize: 18, ml: 0.5 }} /> : <ExpandMoreIcon sx={{ color: K.textFaint, fontSize: 18, ml: 0.5 }} />}
            </Box>
            {isOpen && (
              <Box sx={{ px: 2, pb: 2, pt: 1, borderTop: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField label="ID" value={item.id ?? ''} onChange={(e) => upd(i, 'id', e.target.value)}
                    size="small" sx={{ width: 80 }} inputProps={{ style: { fontFamily: K.mono } }} />
                  <TextField label="Название улики" value={item.title ?? ''} onChange={(e) => upd(i, 'title', e.target.value)}
                    size="small" sx={{ flex: 1 }} />
                  <TextField label="Имя функции" value={item.fnName ?? ''} onChange={(e) => upd(i, 'fnName', e.target.value)}
                    size="small" sx={{ width: 180 }} inputProps={{ style: { fontFamily: K.mono } }} placeholder="solve" />
                </Box>
                {Array.isArray(item.body) ? (
                  <Box>
                    <Typography sx={{ fontSize: 10, color: K.textFaint, letterSpacing: '0.15em', mb: 1 }}>ОПИСАНИЕ</Typography>
                    <BodyBlocks blocks={item.body} onChange={(v) => upd(i, 'body', v)} />
                  </Box>
                ) : typeof item.description === 'string' && (
                  <TextField label="Описание задачи" value={item.description}
                    onChange={(e) => upd(i, 'description', e.target.value)}
                    multiline minRows={2} size="small" fullWidth />
                )}
                <TextField label="Стартовый код" value={item.starter ?? ''} onChange={(e) => upd(i, 'starter', e.target.value)}
                  multiline minRows={3} maxRows={10} size="small" fullWidth
                  inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
                  helperText="Шаблон, который видит студент" />
                <JsonField label="Тесты" value={item.tests ?? []} onChange={(v) => upd(i, 'tests', v)} minRows={3} />
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Sidebar case card ────────────────────────────────────────────────────────
const CaseCard: React.FC<{ c: KodexExternalSummary; selected: boolean; onClick: () => void }> = ({ c, selected, onClick }) => {
  const diff = DIFFICULTY[c.difficulty] || DIFFICULTY[1];
  return (
    <Box onClick={onClick} sx={{
      px: 2, py: 1.5, cursor: 'pointer',
      borderLeft: `2px solid ${selected ? K.neon : 'transparent'}`,
      bgcolor: selected ? 'rgba(0,255,171,0.06)' : 'transparent',
      transition: 'all 0.15s',
      '&:hover': { bgcolor: selected ? 'rgba(0,255,171,0.06)' : 'rgba(255,255,255,0.03)' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint }}>
          {c.num || c.slug}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {c.is_override && (
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: K.cyan, mr: 0.75, flexShrink: 0 }} />
        )}
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: c.playable ? K.neonDim : K.textFaint, flexShrink: 0 }} />
      </Box>
      <Typography sx={{ fontSize: 13, color: selected ? K.neonSoft : K.text, lineHeight: 1.35, mb: 0.5, fontWeight: selected ? 600 : 400 }}>
        {c.title}
      </Typography>
      <Typography sx={{ fontSize: 10, color: diff.color, fontFamily: K.mono }}>
        {diff.label}
      </Typography>
    </Box>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const SIDEBAR_W = 268;

const KodexStudioPage: React.FC<{ api?: KodexApiClient }> = ({ api: apiClient = kodexExternalApi }) => {
  const [cases, setCases] = useState<KodexExternalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<KodexExternalFull> | null>(null);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [aiDialog, setAiDialog] = useState(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    try { setCases(await apiClient.list()); }
    catch { setToast({ msg: 'Ошибка загрузки дел', sev: 'error' }); }
    finally { setLoading(false); }
  }, [apiClient]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const openCase = async (slug: string) => {
    setSelectedId(slug); setTab(0);
    try { setEditing({ ...await apiClient.get(slug) }); }
    catch { setToast({ msg: 'Ошибка загрузки дела', sev: 'error' }); }
  };

  const save = async () => {
    if (!editing || !selectedId) return;
    setSaving(true);
    try {
      const updated = await apiClient.update(selectedId, editing as any);
      setEditing({ ...updated });
      setCases((prev) => prev.map((c) => c.slug === selectedId ? { ...c, ...updated } : c));
      setToast({ msg: 'Сохранено', sev: 'success' });
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setToast({ msg: String(Array.isArray(d?.errors) ? d.errors.join('; ') : d?.error || d || 'Ошибка сохранения'), sev: 'error' });
    } finally { setSaving(false); }
  };

  const createCase = async (payload: Partial<KodexExternalFull>) => {
    try {
      await apiClient.create(payload as any);
      setNewDialog(false);
      setAiDialog(false);
      await loadCases();
      if (payload.slug) await openCase(payload.slug);
      setToast({ msg: 'Дело создано', sev: 'success' });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail?.error || e?.response?.data?.detail || 'Ошибка', sev: 'error' });
    }
  };

  const deleteCase = async (slug: string) => {
    const isSeed = cases.find((c) => c.slug === slug)?.is_seed ?? true;
    try {
      await apiClient.delete(slug);
      if (selectedId === slug) { setSelectedId(null); setEditing(null); }
      setDelConfirm(null);
      setToast({ msg: isSeed ? 'Правки сброшены' : 'Дело удалено', sev: 'success' });
      await loadCases();
    } catch { setToast({ msg: 'Ошибка', sev: 'error' }); }
  };

  const patch = (f: string, v: any) => setEditing((p) => p ? { ...p, [f]: v } : p);

  const filtered = cases.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.slug || '').includes(search.toLowerCase()) ||
    (c.num || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ThemeProvider theme={kodexTheme}>
      <Box sx={{ height: '100vh', bgcolor: K.void, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Top bar ── */}
        <Box sx={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${K.border}`, bgcolor: K.surface }}>
          {/* Logo */}
          <Box sx={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5, px: 2 }}>
            <ShieldIcon sx={{ color: K.neon, fontSize: 20 }} />
            <Box>
              <Typography sx={{ fontFamily: K.mono, fontWeight: 700, letterSpacing: '0.2em', color: K.text, fontSize: 13, lineHeight: 1.1 }}>
                КОДЭКС
              </Typography>
              <Typography sx={{ fontSize: 9, color: K.textFaint, letterSpacing: '0.35em' }}>СТУДИЯ</Typography>
            </Box>
          </Box>

          <Box sx={{ width: 1, height: 28, bgcolor: K.border, flexShrink: 0 }} />

          {/* Case toolbar */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5 }}>
            {editing ? (
              <>
                <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.text, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {editing.num || editing.slug} — {editing.title}
                </Typography>
                {editing.status && (
                  <Chip label={STATUS_LABELS[editing.status]?.label || editing.status} size="small"
                    sx={{ fontSize: 10, height: 22, color: STATUS_LABELS[editing.status]?.color, bgcolor: 'rgba(0,0,0,0.4)', border: `1px solid ${STATUS_LABELS[editing.status]?.color || K.border}` }}
                  />
                )}
                {editing.is_override && (
                  <Chip label="Изменено" size="small"
                    sx={{ fontSize: 10, height: 22, color: K.cyan, bgcolor: 'rgba(53,199,255,0.08)', border: `1px solid ${K.cyan}` }}
                  />
                )}
                <Tooltip title={editing.is_seed ? 'Сбросить правки к оригиналу' : 'Удалить дело'}>
                  <IconButton size="small" onClick={() => setDelConfirm(selectedId!)} sx={{ color: K.danger, '&:hover': { bgcolor: 'rgba(255,61,84,0.1)' } }}>
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Button variant="contained" onClick={save} disabled={saving}
                  startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon sx={{ fontSize: 16 }} />}
                  sx={{ bgcolor: K.neon, color: '#04140f', fontWeight: 700, height: 34, fontSize: 12, letterSpacing: '0.06em', '&:hover': { bgcolor: K.neonSoft }, '&:disabled': { bgcolor: K.neonDim, color: '#04140f' } }}>
                  Сохранить
                </Button>
              </>
            ) : (
              <Typography sx={{ fontSize: 12, color: K.textFaint }}>Выберите дело из списка</Typography>
            )}
          </Box>
        </Box>

        {/* ── Sub bar: search + tabs ── */}
        <Box sx={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${K.border}`, bgcolor: K.surface }}>
          <Box sx={{ width: SIDEBAR_W, flexShrink: 0, px: 1.5 }}>
            <TextField size="small" fullWidth placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: K.textFaint, fontSize: 15, mr: 0.75 }} />,
                sx: { height: 32, fontSize: 12 },
              }}
            />
          </Box>
          <Box sx={{ width: 1, height: 24, bgcolor: K.border, flexShrink: 0 }} />
          {editing ? (
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{
              flex: 1, minHeight: 44,
              '& .MuiTabs-indicator': { bgcolor: K.neon, height: 2 },
              '& .Mui-selected': { color: `${K.neon} !important` },
              '& .MuiTab-root': { color: K.textDim, minHeight: 44, px: 2 },
            }}>
              <Tab label="Основное" />
              <Tab label="Брифинг" />
              <Tab label="Улики" />
              <Tab label="Финал" />
              <Tab label="JSON" />
            </Tabs>
          ) : <Box sx={{ flex: 1 }} />}
        </Box>

        {/* ── Content row ── */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <Box sx={{ width: SIDEBAR_W, flexShrink: 0, borderRight: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', bgcolor: K.surface }}>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', pt: 5 }}>
                  <CircularProgress size={22} sx={{ color: K.neon }} />
                </Box>
              ) : filtered.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 12, color: K.textFaint }}>
                    {search ? 'Ничего не найдено' : 'Дел нет'}
                  </Typography>
                </Box>
              ) : (
                filtered.map((c) => (
                  <React.Fragment key={c.slug}>
                    <CaseCard c={c} selected={c.slug === selectedId} onClick={() => openCase(c.slug)} />
                    <Divider />
                  </React.Fragment>
                ))
              )}
            </Box>
            <Box sx={{ p: 1.5, borderTop: `1px solid ${K.border}`, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button fullWidth variant="outlined" startIcon={<AiIcon sx={{ fontSize: 15 }} />} onClick={() => setAiDialog(true)}
                sx={{ color: K.cyan, borderColor: 'rgba(53,199,255,0.25)', fontSize: 12, height: 36,
                  '&:hover': { borderColor: K.cyan, bgcolor: 'rgba(53,199,255,0.06)' } }}>
                AI Черновик
              </Button>
              <Button fullWidth variant="outlined" startIcon={<AddIcon />} onClick={() => setNewDialog(true)}
                sx={{ color: K.neon, borderColor: K.border, fontSize: 12, height: 36, '&:hover': { borderColor: K.neon, bgcolor: 'rgba(0,255,171,0.06)' } }}>
                Новое дело
              </Button>
            </Box>
          </Box>

          {/* Editor */}
          {!editing ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1.5, opacity: 0.35 }}>
              <ShieldIcon sx={{ fontSize: 52, color: K.textFaint }} />
              <Typography sx={{ fontFamily: K.mono, color: K.textDim, letterSpacing: '0.12em', fontSize: 13 }}>
                Выберите дело из списка
              </Typography>
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: K.void }}>
              <Box sx={{ maxWidth: 740, px: 4, py: 3 }}>

                {/* ── Tab 0: Basic ── */}
                {tab === 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
                    {/* ID */}
                    <Box>
                      <SectionLabel>Идентификатор</SectionLabel>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField label="slug" value={editing.slug || ''} onChange={(e) => patch('slug', e.target.value)}
                          size="small" sx={{ flex: 1 }} inputProps={{ style: { fontFamily: K.mono } }}
                          helperText="case-b01 — только a-z, 0-9, дефис" />
                        <TextField label="num" value={editing.num || ''} onChange={(e) => patch('num', e.target.value)}
                          size="small" sx={{ width: 150 }} inputProps={{ style: { fontFamily: K.mono } }} placeholder="ДЕЛО-001" />
                      </Box>
                    </Box>

                    {/* Content */}
                    <Box>
                      <SectionLabel>Контент</SectionLabel>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField label="Название дела" value={editing.title || ''} onChange={(e) => patch('title', e.target.value)} fullWidth required />
                        <TextField label="Куратор" value={editing.curator || ''} onChange={(e) => patch('curator', e.target.value)} fullWidth placeholder="viktor" />
                        <TextField label="Аннотация (для карточки студента)" value={editing.anno || ''} onChange={(e) => patch('anno', e.target.value)} fullWidth multiline rows={2} />
                      </Box>
                    </Box>

                    {/* Parameters */}
                    <Box>
                      <SectionLabel>Параметры</SectionLabel>
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                          <InputLabel>Сложность</InputLabel>
                          <Select value={editing.difficulty || 1} onChange={(e) => patch('difficulty', Number(e.target.value))} label="Сложность">
                            <MenuItem value={1}>Новичок</MenuItem>
                            <MenuItem value={2}>Агент</MenuItem>
                            <MenuItem value={3}>Эксперт</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField label="Ранг" type="number" value={editing.rank || 1} onChange={(e) => patch('rank', Number(e.target.value))}
                          size="small" sx={{ width: 90 }} inputProps={{ min: 1 }} />
                        <TextField label="Кредиты" type="number" value={editing.reward_credits || 0} onChange={(e) => patch('reward_credits', Number(e.target.value))}
                          size="small" sx={{ width: 100 }} inputProps={{ min: 0 }} />
                        <TextField label="Репутация" type="number" value={editing.reward_rep || 0} onChange={(e) => patch('reward_rep', Number(e.target.value))}
                          size="small" sx={{ width: 100 }} inputProps={{ min: 0 }} />
                        <FormControlLabel
                          control={<Switch checked={!!editing.playable} onChange={(e) => patch('playable', e.target.checked)} />}
                          label={<Typography sx={{ fontSize: 12, color: K.textDim }}>Активно для учеников</Typography>}
                        />
                      </Box>
                    </Box>

                    {/* Investigation */}
                    <Box>
                      <SectionLabel>Расследование</SectionLabel>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField label="Цель расследования" value={editing.goal || ''} onChange={(e) => patch('goal', e.target.value)} fullWidth multiline rows={2} />
                        <TextField label="Подозреваемые / участники" value={editing.suspects || ''} onChange={(e) => patch('suspects', e.target.value)} fullWidth multiline rows={2} />
                        <TextField label="Задание для агента" value={editing.task || ''} onChange={(e) => patch('task', e.target.value)} fullWidth multiline rows={3} />
                      </Box>
                    </Box>

                    {/* Code */}
                    <Box>
                      <SectionLabel>Код</SectionLabel>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField label="Имя функции (fnName)" value={editing.fn_name || ''} onChange={(e) => patch('fn_name', e.target.value)}
                          fullWidth inputProps={{ style: { fontFamily: K.mono } }} helperText="Пусто = script mode" />
                        <TextField label="Стартовый код" value={editing.starter || ''} onChange={(e) => patch('starter', e.target.value)}
                          fullWidth multiline rows={6} inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
                          helperText="Шаблон кода для студента" />
                      </Box>
                    </Box>
                  </Box>
                )}

                {/* ── Tab 1: Briefing ── */}
                {tab === 1 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <BriefingEditor items={editing.briefing || []} onChange={(v) => patch('briefing', v)} />
                    <Box>
                      <SectionLabel>Материалы дела</SectionLabel>
                      <JsonField label="materials" value={editing.materials || []} onChange={(v) => patch('materials', v)} minRows={3} />
                    </Box>
                  </Box>
                )}

                {/* ── Tab 2: Evidence ── */}
                {tab === 2 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <EvidenceEditor items={editing.evidence || []} onChange={(v) => patch('evidence', v)} />
                    <Box>
                      <SectionLabel>Версии закрытия дела</SectionLabel>
                      <JsonField label={`versions — [{ id, text, correct: bool }]`} value={editing.versions || []} onChange={(v) => patch('versions', v)} minRows={3} />
                    </Box>
                    <Box>
                      <SectionLabel>Подсказки</SectionLabel>
                      <JsonField label={`hints — { "key": { "1": "...", "2": "..." } }`} value={editing.hints || {}} onChange={(v) => patch('hints', v)} minRows={3} />
                    </Box>
                  </Box>
                )}

                {/* ── Tab 3: Finale ── */}
                {tab === 3 && (
                  <FinaleEditor items={editing.finale || []} onChange={(v) => patch('finale', v)} />
                )}

                {/* ── Tab 4: JSON ── */}
                {tab === 4 && (
                  <Box>
                    <Typography sx={{ fontSize: 11, color: K.textFaint, mb: 2 }}>
                      Полный JSON дела (только чтение)
                    </Typography>
                    <TextField multiline fullWidth minRows={24} value={JSON.stringify(editing, null, 2)}
                      InputProps={{ readOnly: true, sx: { fontFamily: K.mono, fontSize: 11, bgcolor: 'rgba(0,0,0,0.3)' } }}
                    />
                  </Box>
                )}

              </Box>
            </Box>
          )}
        </Box>

        {/* ── AI draft dialog ── */}
        <AiDraftDialog open={aiDialog} onClose={() => setAiDialog(false)} onDraft={createCase} api={apiClient} />

        {/* ── New case dialog ── */}
        <NewCaseDialog open={newDialog} onClose={() => setNewDialog(false)} onCreate={createCase} />

        {/* ── Delete confirm ── */}
        <Dialog open={delConfirm !== null} onClose={() => setDelConfirm(null)}
          PaperProps={{ sx: { border: `1px solid ${K.danger}` } }}>
          <DialogTitle sx={{ color: K.danger, fontSize: 14 }}>
            {editing?.is_seed ? 'Сбросить правки?' : 'Удалить дело?'}
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13, color: K.textDim }}>
              {editing?.is_seed
                ? 'Все изменения будут удалены. Дело вернётся к оригиналу.'
                : 'Новое дело будет удалено из базы Кодэкс. Это необратимо.'}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDelConfirm(null)} sx={{ color: K.textDim }}>Отмена</Button>
            <Button onClick={() => deleteCase(delConfirm!)} sx={{ color: K.danger }}>
              {editing?.is_seed ? 'Сбросить' : 'Удалить'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Toast ── */}
        <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert severity={toast?.sev || 'success'} onClose={() => setToast(null)} sx={{ fontSize: 13 }}>
            {toast?.msg}
          </Alert>
        </Snackbar>

      </Box>
    </ThemeProvider>
  );
};

// ─── AI draft dialog ──────────────────────────────────────────────────────────
interface AiDraftDialogProps {
  open: boolean;
  onClose: () => void;
  onDraft: (p: Partial<KodexExternalFull>) => void;
  api: KodexApiClient;
}
const AiDraftDialog: React.FC<AiDraftDialogProps> = ({ open, onClose, onDraft, api }) => {
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Partial<KodexExternalFull> | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setIdea(''); setPreview(null); setErr(''); setLoading(false); } }, [open]);

  const generate = async () => {
    if (!idea.trim()) return;
    setLoading(true); setErr(''); setPreview(null);
    try {
      const draft = await api.aiDraft(idea.trim());
      setPreview(draft);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Ошибка генерации');
    } finally { setLoading(false); }
  };

  const save = () => { if (preview) onDraft(preview); };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ color: K.cyan, fontSize: 14, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 1 }}>
        <AiIcon sx={{ fontSize: 18 }} /> AI ЧЕРНОВИК ДЕЛА
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <TextField
          label="Опишите идею дела"
          multiline rows={4} fullWidth
          value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="Например: Дело о пропавшей переменной. Студент должен написать функцию, которая находит все неиспользуемые переменные в коде. Сложность — Агент."
          helperText="Опишите тему, задачу, сложность — AI сгенерирует полную структуру дела"
        />
        {err && <Alert severity="error">{err}</Alert>}
        {preview && (
          <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'rgba(0,255,171,0.04)', borderBottom: `1px solid ${K.border}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AiIcon sx={{ fontSize: 14, color: K.neonDim }} />
              <Typography sx={{ fontSize: 12, color: K.neonDim, fontFamily: K.mono }}>Черновик сгенерирован</Typography>
              <Box sx={{ flex: 1 }} />
              <Chip label={preview.num || preview.slug} size="small" sx={{ fontSize: 10, height: 20, color: K.textDim }} />
            </Box>
            <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography sx={{ fontSize: 15, color: K.text, fontWeight: 600 }}>{preview.title}</Typography>
              {preview.anno && <Typography sx={{ fontSize: 12, color: K.textDim }}>{preview.anno}</Typography>}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {preview.difficulty != null && (
                  <Chip label={DIFFICULTY[preview.difficulty]?.label || `Сложность ${preview.difficulty}`} size="small"
                    sx={{ fontSize: 10, height: 20, color: DIFFICULTY[preview.difficulty]?.color || K.textDim }} />
                )}
                {preview.curator && <Chip label={`Куратор: ${preview.curator}`} size="small" sx={{ fontSize: 10, height: 20, color: K.textDim }} />}
                {preview.fn_name && <Chip label={`fn: ${preview.fn_name}()`} size="small" sx={{ fontSize: 10, height: 20, color: K.cyan, fontFamily: K.mono }} />}
                {Array.isArray(preview.briefing) && preview.briefing.length > 0 && (
                  <Chip label={`Брифинг: ${preview.briefing.length} блок(а)`} size="small" sx={{ fontSize: 10, height: 20, color: K.textDim }} />
                )}
                {Array.isArray(preview.evidence) && preview.evidence.length > 0 && (
                  <Chip label={`Улики: ${preview.evidence.length}`} size="small" sx={{ fontSize: 10, height: 20, color: K.textDim }} />
                )}
              </Box>
              {preview.task && (
                <Box sx={{ borderLeft: `2px solid ${K.neonDim}`, pl: 1.5 }}>
                  <Typography sx={{ fontSize: 11, color: K.textFaint, mb: 0.5, letterSpacing: '0.12em' }}>ЗАДАНИЕ</Typography>
                  <Typography sx={{ fontSize: 12, color: K.textDim }}>{preview.task}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: K.textDim }}>Отмена</Button>
        {!preview ? (
          <Button onClick={generate} variant="contained" disabled={loading || !idea.trim()}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AiIcon sx={{ fontSize: 16 }} />}
            sx={{ bgcolor: K.cyan, color: '#021520', fontWeight: 700, '&:hover': { bgcolor: '#6dd9ff' }, '&:disabled': { bgcolor: 'rgba(53,199,255,0.3)', color: '#021520' } }}>
            {loading ? 'Генерирую...' : 'Сгенерировать'}
          </Button>
        ) : (
          <>
            <Button onClick={generate} disabled={loading}
              startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <AiIcon sx={{ fontSize: 14 }} />}
              sx={{ color: K.cyan, fontSize: 12 }}>
              Перегенерировать
            </Button>
            <Button onClick={save} variant="contained"
              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
              sx={{ bgcolor: K.neon, color: '#04140f', fontWeight: 700, '&:hover': { bgcolor: K.neonSoft } }}>
              Создать дело
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

// ─── New case dialog ──────────────────────────────────────────────────────────
interface NewCaseDialogProps { open: boolean; onClose: () => void; onCreate: (p: Partial<KodexExternalFull>) => void }
const NewCaseDialog: React.FC<NewCaseDialogProps> = ({ open, onClose, onCreate }) => {
  const [form, setForm] = useState({ slug: '', num: '', title: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setForm({ slug: '', num: '', title: '' }); setErr(''); } }, [open]);
  const submit = () => {
    if (!form.slug.trim() || !form.title.trim()) { setErr('Slug и название обязательны'); return; }
    if (!/^[a-z0-9\-]+$/.test(form.slug)) { setErr('Slug: только строчные буквы, цифры и дефис'); return; }
    onCreate({ ...EMPTY_CASE(), ...form });
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: K.neon, fontSize: 14, letterSpacing: '0.12em' }}>НОВОЕ ДЕЛО</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Slug (идентификатор)" value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, '') }))}
          fullWidth required inputProps={{ style: { fontFamily: K.mono } }} helperText="Например: case-001" />
        <TextField label="Номер (num)" value={form.num}
          onChange={(e) => setForm((f) => ({ ...f, num: e.target.value }))}
          fullWidth placeholder="ДЕЛО-001" inputProps={{ style: { fontFamily: K.mono } }} />
        <TextField label="Название" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          fullWidth required />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: K.textDim }}>Отмена</Button>
        <Button onClick={submit} variant="contained" sx={{ bgcolor: K.neon, color: '#04140f', fontWeight: 700, '&:hover': { bgcolor: K.neonSoft } }}>
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KodexStudioPage;
