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
  Drawer,
  Fab,
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
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  KeyboardArrowDown,
  Psychology as PsychologyIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { kodexApi, KodexCaseFull, KodexCaseSummary } from '../services/kodexApi';

type KodexApiClient = typeof kodexApi;

// ─── Colour palette matching Kodex theme ────────────────────────────────────
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
const EMPTY_CASE = (): Partial<KodexCaseFull> => ({
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
  briefing: [],
  materials: [],
  evidence: [],
  hints: {},
  versions: [],
  finale: [],
  theory: [],
});

// ─── JSON editor helper ──────────────────────────────────────────────────────
interface JsonFieldProps {
  label: string;
  value: any;
  onChange: (v: any) => void;
}

const JsonField: React.FC<JsonFieldProps> = ({ label, value, onChange }) => {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text);
      setError('');
      onChange(parsed);
    } catch {
      setError('Некорректный JSON');
    }
  };

  return (
    <Box>
      <TextField
        label={label}
        multiline
        minRows={4}
        maxRows={16}
        fullWidth
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        error={!!error}
        helperText={error || 'Редактируется как JSON'}
        inputProps={{ style: { fontFamily: K.mono, fontSize: 12 } }}
        sx={{ '& .MuiOutlinedInput-root': { borderColor: K.panelBorder } }}
      />
    </Box>
  );
};

// ─── Theory block editor ─────────────────────────────────────────────────────
interface TheoryBlock {
  type: 'text' | 'code' | 'image' | 'tip';
  content: string;
  lang?: string;
  caption?: string;
}

interface TheoryEditorProps {
  blocks: TheoryBlock[];
  onChange: (blocks: TheoryBlock[]) => void;
}

const TheoryEditor: React.FC<TheoryEditorProps> = ({ blocks, onChange }) => {
  const add = (type: TheoryBlock['type']) => {
    onChange([...blocks, { type, content: '', lang: type === 'code' ? 'python' : undefined }]);
  };

  const update = (idx: number, patch: Partial<TheoryBlock>) => {
    const next = blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {blocks.map((block, idx) => (
        <Paper
          key={idx}
          sx={{
            p: 2,
            background: 'rgba(0,255,171,0.03)',
            border: `1px solid ${K.panelBorder}`,
            borderRadius: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={block.type}
              size="small"
              sx={{ fontFamily: K.mono, fontSize: 11, bgcolor: 'rgba(0,255,171,0.12)', color: K.neon, border: 'none' }}
            />
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={() => remove(idx)} sx={{ color: K.danger }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {block.type === 'code' && (
            <TextField
              label="Язык"
              size="small"
              value={block.lang || 'python'}
              onChange={(e) => update(idx, { lang: e.target.value })}
              sx={{ mb: 1, width: 140 }}
            />
          )}

          <TextField
            label={block.type === 'image' ? 'URL изображения' : 'Содержимое'}
            multiline={block.type !== 'image'}
            minRows={block.type === 'text' || block.type === 'tip' ? 3 : block.type === 'code' ? 4 : 1}
            fullWidth
            value={block.content}
            onChange={(e) => update(idx, { content: e.target.value })}
            inputProps={block.type === 'code' ? { style: { fontFamily: K.mono, fontSize: 12 } } : undefined}
          />

          {block.type === 'image' && (
            <TextField
              label="Подпись"
              size="small"
              fullWidth
              value={block.caption || ''}
              onChange={(e) => update(idx, { caption: e.target.value })}
              sx={{ mt: 1 }}
            />
          )}
        </Paper>
      ))}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {(['text', 'code', 'image', 'tip'] as TheoryBlock['type'][]).map((t) => (
          <Button
            key={t}
            size="small"
            variant="outlined"
            onClick={() => add(t)}
            sx={{ color: K.neonDim, borderColor: K.panelBorder, fontFamily: K.mono, fontSize: 11 }}
          >
            + {t}
          </Button>
        ))}
      </Box>
    </Box>
  );
};

// ─── Case card in sidebar ────────────────────────────────────────────────────
interface CaseCardProps {
  c: KodexCaseSummary;
  selected: boolean;
  onClick: () => void;
}

const CaseCard: React.FC<CaseCardProps> = ({ c, selected, onClick }) => {
  const st = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        borderLeft: `2px solid ${selected ? K.neon : 'transparent'}`,
        background: selected ? 'rgba(0,255,171,0.06)' : 'transparent',
        transition: 'all 0.2s',
        '&:hover': { background: 'rgba(0,255,171,0.04)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontFamily: K.mono, fontSize: 11, color: K.textFaint }}>
          {c.num || c.slug}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: st.color, flexShrink: 0 }} />
      </Box>
      <Typography sx={{ fontSize: 13, color: K.text, lineHeight: 1.3, mb: 0.5 }}>
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

// ─── Main page ───────────────────────────────────────────────────────────────
const SIDEBAR_WIDTH = 280;

const KodexStudioPage: React.FC<{ api?: KodexApiClient }> = ({ api: apiClient = kodexApi }) => {
  const [cases, setCases] = useState<KodexCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<KodexCaseFull> | null>(null);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const loadCases = useCallback(async () => {
    try {
      const data = await apiClient.list();
      setCases(data);
    } catch {
      setToast({ msg: 'Ошибка загрузки дел', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const openCase = async (id: number) => {
    setSelectedId(id);
    setTab(0);
    try {
      const full = await apiClient.get(id);
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
      setCases((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...updated } : c)));
      setToast({ msg: 'Сохранено', severity: 'success' });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || 'Ошибка сохранения', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const createCase = async (payload: Partial<KodexCaseFull>) => {
    try {
      const created = await apiClient.create(payload as any);
      setCases((prev) => [created, ...prev]);
      setNewDialog(false);
      await openCase(created.id);
      setToast({ msg: 'Дело создано', severity: 'success' });
    } catch (e: any) {
      setToast({ msg: e?.response?.data?.detail || 'Ошибка создания', severity: 'error' });
    }
  };

  const deleteCase = async (id: number) => {
    try {
      await apiClient.delete(id);
      setCases((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setEditing(null);
      }
      setDeleteConfirm(null);
      setToast({ msg: 'Дело удалено', severity: 'success' });
    } catch {
      setToast({ msg: 'Ошибка удаления', severity: 'error' });
    }
  };

  const patch = (field: string, value: any) => {
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const filtered = cases.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.slug || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.num || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: K.void,
        color: K.text,
        display: 'flex',
        fontFamily: K.mono,
      }}
    >
      {/* ── Sidebar ── */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: `1px solid ${K.panelBorder}`,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar header */}
        <Box
          sx={{
            p: 2,
            borderBottom: `1px solid ${K.panelBorder}`,
            background: 'rgba(0,255,171,0.04)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <ShieldIcon sx={{ color: K.neon, fontSize: 18 }} />
            <Typography sx={{ fontFamily: K.mono, fontWeight: 700, letterSpacing: '0.18em', color: K.text, fontSize: 14 }}>
              КОДЭКС
            </Typography>
            <Typography sx={{ fontSize: 10, color: K.textFaint, letterSpacing: '0.3em', ml: 0.5 }}>
              СТУДИЯ
            </Typography>
          </Box>
          <TextField
            placeholder="Поиск дел..."
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: K.textFaint, fontSize: 16, mr: 0.5 }} />,
              sx: { fontFamily: K.mono, fontSize: 12 },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(0,0,0,0.3)',
                '& fieldset': { borderColor: K.panelBorder },
              },
            }}
          />
        </Box>

        {/* Case list */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
              <CircularProgress size={24} sx={{ color: K.neon }} />
            </Box>
          ) : filtered.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 12, color: K.textFaint }}>
                {search ? 'Ничего не найдено' : 'Дел пока нет'}
              </Typography>
            </Box>
          ) : (
            filtered.map((c) => (
              <React.Fragment key={c.id}>
                <CaseCard
                  c={c}
                  selected={c.id === selectedId}
                  onClick={() => openCase(c.id)}
                />
                <Divider sx={{ borderColor: K.panelBorder, opacity: 0.4 }} />
              </React.Fragment>
            ))
          )}
        </Box>

        {/* Add button */}
        <Box sx={{ p: 2, borderTop: `1px solid ${K.panelBorder}` }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setNewDialog(true)}
            sx={{
              color: K.neon,
              borderColor: K.panelBorder,
              fontFamily: K.mono,
              fontSize: 12,
              letterSpacing: '0.1em',
              '&:hover': { borderColor: K.neon, bgcolor: 'rgba(0,255,171,0.06)' },
            }}
          >
            Новое дело
          </Button>
        </Box>
      </Box>

      {/* ── Editor panel ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100vh' }}>
        {!editing ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.4,
            }}
          >
            <SearchIcon sx={{ fontSize: 48, color: K.textFaint, mb: 2 }} />
            <Typography sx={{ fontFamily: K.mono, color: K.textDim, letterSpacing: '0.12em' }}>
              Выберите дело из списка слева
            </Typography>
          </Box>
        ) : (
          <>
            {/* Editor toolbar */}
            <Box
              sx={{
                px: 3,
                py: 1.5,
                borderBottom: `1px solid ${K.panelBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'rgba(0,255,171,0.02)',
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.text, flex: 1, fontWeight: 600 }}>
                {editing.num || editing.slug || 'Дело'} — {editing.title}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Status selector */}
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    value={editing.status || 'draft'}
                    onChange={(e) => patch('status', e.target.value)}
                    sx={{
                      fontFamily: K.mono,
                      fontSize: 12,
                      color: STATUS_LABELS[editing.status || 'draft']?.color || K.textDim,
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: K.panelBorder },
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <MenuItem key={k} value={k} sx={{ fontFamily: K.mono, fontSize: 12 }}>
                        {v.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Tooltip title="Удалить дело">
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirm(selectedId!)}
                    sx={{ color: K.danger }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                  onClick={save}
                  disabled={saving}
                  sx={{
                    bgcolor: K.neon,
                    color: '#04140f',
                    fontFamily: K.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    '&:hover': { bgcolor: K.neonSoft },
                    '&:disabled': { bgcolor: K.neonDim, color: '#04140f' },
                  }}
                >
                  Сохранить
                </Button>
              </Box>
            </Box>

            {/* Tabs */}
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                px: 3,
                borderBottom: `1px solid ${K.panelBorder}`,
                flexShrink: 0,
                '& .MuiTab-root': {
                  fontFamily: K.mono,
                  fontSize: 12,
                  color: K.textDim,
                  letterSpacing: '0.08em',
                  minHeight: 40,
                },
                '& .Mui-selected': { color: K.neon },
                '& .MuiTabs-indicator': { bgcolor: K.neon },
              }}
            >
              <Tab label="Основное" />
              <Tab label="Брифинг" />
              <Tab label="Улики" />
              <Tab label="Теория" />
              <Tab label="Финал" />
              <Tab label="JSON" />
            </Tabs>

            {/* Tab content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
              {/* ── Tab 0: Basic info ── */}
              {tab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 720 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="Идентификатор (slug)"
                      value={editing.slug || ''}
                      onChange={(e) => patch('slug', e.target.value)}
                      inputProps={{ style: { fontFamily: K.mono } }}
                      size="small"
                      sx={{ flex: 1 }}
                      helperText="Только латиница, цифры и дефис"
                    />
                    <TextField
                      label="Номер (num)"
                      value={editing.num || ''}
                      onChange={(e) => patch('num', e.target.value)}
                      inputProps={{ style: { fontFamily: K.mono } }}
                      size="small"
                      sx={{ width: 140 }}
                      placeholder="CASE-001"
                    />
                  </Box>

                  <TextField
                    label="Название дела"
                    value={editing.title || ''}
                    onChange={(e) => patch('title', e.target.value)}
                    fullWidth
                    required
                  />

                  <TextField
                    label="Куратор"
                    value={editing.curator || ''}
                    onChange={(e) => patch('curator', e.target.value)}
                    fullWidth
                    placeholder="Виктор Кодэкс"
                  />

                  <TextField
                    label="Аннотация (для карточки)"
                    value={editing.anno || ''}
                    onChange={(e) => patch('anno', e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                  />

                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Сложность</InputLabel>
                      <Select
                        value={editing.difficulty || 1}
                        onChange={(e) => patch('difficulty', Number(e.target.value))}
                        label="Сложность"
                      >
                        <MenuItem value={1}>Новичок</MenuItem>
                        <MenuItem value={2}>Агент</MenuItem>
                        <MenuItem value={3}>Эксперт</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      label="Ранг (уровень доступа)"
                      type="number"
                      value={editing.rank || 1}
                      onChange={(e) => patch('rank', Number(e.target.value))}
                      size="small"
                      sx={{ width: 140 }}
                      inputProps={{ min: 1 }}
                    />

                    <TextField
                      label="Кредиты"
                      type="number"
                      value={editing.reward_credits || 0}
                      onChange={(e) => patch('reward_credits', Number(e.target.value))}
                      size="small"
                      sx={{ width: 120 }}
                      inputProps={{ min: 0 }}
                    />

                    <TextField
                      label="Репутация"
                      type="number"
                      value={editing.reward_rep || 0}
                      onChange={(e) => patch('reward_rep', Number(e.target.value))}
                      size="small"
                      sx={{ width: 120 }}
                      inputProps={{ min: 0 }}
                    />

                    <FormControlLabel
                      control={
                        <Switch
                          checked={!!editing.playable}
                          onChange={(e) => patch('playable', e.target.checked)}
                          sx={{ '& .MuiSwitch-thumb': { bgcolor: editing.playable ? K.neon : undefined } }}
                        />
                      }
                      label={<Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim }}>Активно для учеников</Typography>}
                    />
                  </Box>

                  <Divider sx={{ borderColor: K.panelBorder }} />

                  <TextField
                    label="Цель расследования"
                    value={editing.goal || ''}
                    onChange={(e) => patch('goal', e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                  />

                  <TextField
                    label="Подозреваемые / участники"
                    value={editing.suspects || ''}
                    onChange={(e) => patch('suspects', e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                  />

                  <TextField
                    label="Задание для агента"
                    value={editing.task || ''}
                    onChange={(e) => patch('task', e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                  />
                </Box>
              )}

              {/* ── Tab 1: Briefing ── */}
              {tab === 1 && (
                <Box sx={{ maxWidth: 720 }}>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 2 }}>
                    Диалог брифинга — массив объектов: {`{ speaker, text }`}
                  </Typography>
                  <JsonField
                    label="Брифинг (JSON)"
                    value={editing.briefing || []}
                    onChange={(v) => patch('briefing', v)}
                  />
                  <Box sx={{ mt: 3 }}>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 2 }}>
                      Финальный диалог — массив объектов: {`{ speaker, text }`}
                    </Typography>
                    <JsonField
                      label="Финал (JSON)"
                      value={editing.finale || []}
                      onChange={(v) => patch('finale', v)}
                    />
                  </Box>
                </Box>
              )}

              {/* ── Tab 2: Evidence ── */}
              {tab === 2 && (
                <Box sx={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                      Улики и тесты — массив {`{ id, title, description, fnName?, starter?, tests: [...] }`}
                    </Typography>
                    <JsonField
                      label="Улики (JSON)"
                      value={editing.evidence || []}
                      onChange={(v) => patch('evidence', v)}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                      Материалы дела — произвольный JSON (документы, файлы)
                    </Typography>
                    <JsonField
                      label="Материалы (JSON)"
                      value={editing.materials || []}
                      onChange={(v) => patch('materials', v)}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                      Версии закрытия — массив {`{ id, text, correct: bool }`}
                    </Typography>
                    <JsonField
                      label="Версии (JSON)"
                      value={editing.versions || []}
                      onChange={(v) => patch('versions', v)}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 1 }}>
                      Подсказки — объект {`{ "key": { "1": "...", "2": "...", "3": "..." } }`}
                    </Typography>
                    <JsonField
                      label="Подсказки (JSON)"
                      value={editing.hints || {}}
                      onChange={(v) => patch('hints', v)}
                    />
                  </Box>
                </Box>
              )}

              {/* ── Tab 3: Theory ── */}
              {tab === 3 && (
                <Box sx={{ maxWidth: 800 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <PsychologyIcon sx={{ color: K.neon, fontSize: 18 }} />
                    <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.text }}>
                      Теория для учеников
                    </Typography>
                  </Box>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textFaint, mb: 3 }}>
                    Добавьте блоки теории: текст, код, изображения, подсказки. Они будут доступны ученикам при прохождении дела.
                  </Typography>
                  <TheoryEditor
                    blocks={(editing.theory as TheoryBlock[]) || []}
                    onChange={(v) => patch('theory', v)}
                  />
                </Box>
              )}

              {/* ── Tab 4: Finale ── */}
              {tab === 4 && (
                <Box sx={{ maxWidth: 720 }}>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textDim, mb: 2 }}>
                    Финальный диалог — показывается после решения дела
                  </Typography>
                  <JsonField
                    label="Финал (JSON)"
                    value={editing.finale || []}
                    onChange={(v) => patch('finale', v)}
                  />
                </Box>
              )}

              {/* ── Tab 5: Raw JSON ── */}
              {tab === 5 && (
                <Box sx={{ maxWidth: 900 }}>
                  <Typography sx={{ fontFamily: K.mono, fontSize: 12, color: K.textFaint, mb: 2 }}>
                    Полный JSON дела. Изменения здесь не применяются автоматически — используйте вкладки выше.
                  </Typography>
                  <TextField
                    multiline
                    fullWidth
                    minRows={20}
                    value={JSON.stringify(editing, null, 2)}
                    InputProps={{
                      readOnly: true,
                      sx: { fontFamily: K.mono, fontSize: 11 },
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.4)' } }}
                  />
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* ── New case dialog ── */}
      <NewCaseDialog
        open={newDialog}
        onClose={() => setNewDialog(false)}
        onCreate={createCase}
      />

      {/* ── Delete confirm ── */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        PaperProps={{ sx: { bgcolor: '#0a0f12', border: `1px solid ${K.danger}`, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontFamily: K.mono, color: K.danger, fontSize: 14 }}>
          Удалить дело?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: K.mono, fontSize: 13, color: K.textDim }}>
            Это действие необратимо. Все данные дела будут удалены.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: K.textDim, fontFamily: K.mono }}>
            Отмена
          </Button>
          <Button
            onClick={() => deleteCase(deleteConfirm!)}
            sx={{ color: K.danger, fontFamily: K.mono }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ── */}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity || 'success'}
          onClose={() => setToast(null)}
          sx={{ fontFamily: K.mono, fontSize: 13 }}
        >
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// ─── New case dialog ─────────────────────────────────────────────────────────
interface NewCaseDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Partial<KodexCaseFull>) => void;
}

const NewCaseDialog: React.FC<NewCaseDialogProps> = ({ open, onClose, onCreate }) => {
  const [form, setForm] = useState({ slug: '', num: '', title: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ slug: '', num: '', title: '' });
      setError('');
    }
  }, [open]);

  const handleCreate = () => {
    if (!form.slug.trim() || !form.title.trim()) {
      setError('Идентификатор и название обязательны');
      return;
    }
    if (!/^[a-z0-9\-]+$/.test(form.slug)) {
      setError('Идентификатор: только строчные латинские буквы, цифры и дефис');
      return;
    }
    onCreate({ ...EMPTY_CASE(), ...form });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { bgcolor: '#0a0f12', border: `1px solid ${K.panelBorder}`, borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ fontFamily: K.mono, color: K.neon, fontSize: 14, letterSpacing: '0.12em' }}>
        НОВОЕ ДЕЛО
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ fontFamily: K.mono, fontSize: 12 }}>
            {error}
          </Alert>
        )}
        <TextField
          label="Идентификатор (slug)"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, '') }))}
          fullWidth
          required
          inputProps={{ style: { fontFamily: K.mono } }}
          helperText="Например: case-001, mystery-cipher"
        />
        <TextField
          label="Номер дела"
          value={form.num}
          onChange={(e) => setForm((f) => ({ ...f, num: e.target.value }))}
          fullWidth
          placeholder="CASE-001"
          inputProps={{ style: { fontFamily: K.mono } }}
        />
        <TextField
          label="Название"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          fullWidth
          required
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: K.textDim, fontFamily: K.mono }}>
          Отмена
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          sx={{
            bgcolor: K.neon,
            color: '#04140f',
            fontFamily: K.mono,
            fontWeight: 700,
            fontSize: 12,
            '&:hover': { bgcolor: K.neonSoft },
          }}
        >
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KodexStudioPage;
