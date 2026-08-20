import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
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
  InputAdornment,
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
  CheckCircle as CheckIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Link as LinkIcon,
  RadioButtonUnchecked as CircleIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { kodexExternalApi, KodexExternalFull, KodexExternalSummary } from '../services/kodexApi';

const MONO = '"JetBrains Mono","SFMono-Regular",Consolas,monospace';

const DIFFICULTY_LABELS: Record<number, { label: string; color: 'default' | 'primary' | 'warning' | 'error' }> = {
  1: { label: 'Новичок', color: 'primary' },
  2: { label: 'Агент', color: 'warning' },
  3: { label: 'Эксперт', color: 'error' },
};

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'error' }> = {
  draft: { label: 'Черновик', color: 'default' },
  in_review: { label: 'На проверке', color: 'info' },
  approved: { label: 'Одобрено', color: 'success' },
  changes_requested: { label: 'Нужны правки', color: 'error' },
};

const EMPTY_CASE = (): Partial<KodexExternalFull> => ({
  slug: '', num: '', title: '', curator: '', playable: false,
  rank: 1, difficulty: 1, reward_credits: 0, reward_rep: 0,
  goal: '', suspects: '', task: '', anno: '',
  fn_name: '', starter: '',
  briefing: [], materials: [], evidence: [], hints: {}, versions: [], finale: [],
  is_seed: false, is_override: false, status: null,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
}

// Умный парсер: число → число, остальное → строка
function smartParse(s: string): any {
  const trimmed = s.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function smartDisplay(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// ─── Section heading ──────────────────────────────────────────────────────────
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="overline" color="text.secondary"
    sx={{ display: 'block', mb: 1.5, mt: 0.5, letterSpacing: '0.12em', fontSize: '0.68rem' }}>
    {children}
  </Typography>
);

// ─── Sort / remove controls ───────────────────────────────────────────────────
interface SortProps { i: number; len: number; onUp: () => void; onDown: () => void; onRemove: () => void }
const SortControls: React.FC<SortProps> = ({ i, len, onUp, onDown, onRemove }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0 }}>
    <IconButton size="small" disabled={i === 0} onClick={onUp} sx={{ p: 0.4 }}>
      <ArrowUpIcon sx={{ fontSize: 15 }} />
    </IconButton>
    <IconButton size="small" disabled={i === len - 1} onClick={onDown} sx={{ p: 0.4 }}>
      <ArrowDownIcon sx={{ fontSize: 15 }} />
    </IconButton>
    <IconButton size="small" onClick={onRemove} sx={{ p: 0.4, color: 'error.main' }}>
      <DeleteIcon sx={{ fontSize: 14 }} />
    </IconButton>
  </Box>
);

// ─── Body blocks (текст + код) ────────────────────────────────────────────────
const BodyBlocks: React.FC<{ blocks: any[]; onChange: (v: any[]) => void }> = ({ blocks, onChange }) => {
  const upd = (i: number, v: any) => onChange(blocks.map((b, j) => j === i ? v : b));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {blocks.map((block, i) => {
        const isCode = typeof block === 'object' && block !== null && 'code' in block;
        return (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 1, bgcolor: isCode ? 'info.main' : 'success.main', flexShrink: 0, opacity: 0.7 }} />
            <TextField multiline minRows={isCode ? 3 : 1} maxRows={10} fullWidth size="small"
              label={isCode ? 'Блок кода' : 'Текст'}
              value={isCode ? block.code : block}
              onChange={(e) => upd(i, isCode ? { code: e.target.value } : e.target.value)}
              inputProps={isCode ? { style: { fontFamily: MONO, fontSize: 12 } } : {}}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Tooltip title={isCode ? 'Преобразовать в текст' : 'Преобразовать в код'} placement="left">
                <IconButton size="small" onClick={() => upd(i, isCode ? (block.code || '') : { code: String(block) })}
                  color={isCode ? 'info' : 'success'} sx={{ width: 28, height: 28, fontSize: 11 }}>
                  {isCode ? 'T' : '</>'}
                </IconButton>
              </Tooltip>
              <SortControls i={i} len={blocks.length}
                onUp={() => onChange(moveItem(blocks, i, i - 1))}
                onDown={() => onChange(moveItem(blocks, i, i + 1))}
                onRemove={() => onChange(blocks.filter((_, j) => j !== i))} />
            </Box>
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button size="small" color="success" onClick={() => onChange([...blocks, ''])}
          startIcon={<AddIcon sx={{ fontSize: 13 }} />}>Текст</Button>
        <Button size="small" color="info" onClick={() => onChange([...blocks, { code: '' }])}
          startIcon={<AddIcon sx={{ fontSize: 13 }} />}>Блок кода</Button>
      </Box>
    </Box>
  );
};

// ─── Тесты — редактор ─────────────────────────────────────────────────────────
const TestsEditor: React.FC<{ tests: any[]; onChange: (v: any[]) => void }> = ({ tests, onChange }) => {
  const updArg = (ti: number, ai: number, val: string) => {
    onChange(tests.map((t, j) => {
      if (j !== ti) return t;
      const args = [...(t.args ?? [])];
      args[ai] = smartParse(val);
      return { ...t, args };
    }));
  };
  const addArg = (ti: number) => {
    onChange(tests.map((t, j) => j !== ti ? t : { ...t, args: [...(t.args ?? []), ''] }));
  };
  const removeArg = (ti: number, ai: number) => {
    onChange(tests.map((t, j) => j !== ti ? t : { ...t, args: (t.args ?? []).filter((_: any, k: number) => k !== ai) }));
  };
  const updExpected = (ti: number, val: string) => {
    onChange(tests.map((t, j) => j !== ti ? t : { ...t, expected: smartParse(val) }));
  };
  const updDesc = (ti: number, val: string) => {
    onChange(tests.map((t, j) => j !== ti ? t : { ...t, desc: val }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Тесты ({tests.length})
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => onChange([...tests, { args: [''], expected: '' }])}>
          Добавить тест
        </Button>
      </Box>
      {tests.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 0.5 }}>
          Тесты не добавлены
        </Typography>
      )}
      {tests.map((t, ti) => (
        <Paper key={ti} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
            <Chip label={`Тест ${ti + 1}`} size="small" variant="outlined" color="primary" sx={{ mr: 1 }} />
            <TextField label="Описание теста (необязательно)" size="small" sx={{ flex: 1 }} value={t.desc ?? ''}
              onChange={(e) => updDesc(ti, e.target.value)} />
            <IconButton size="small" color="error" onClick={() => onChange(tests.filter((_, j) => j !== ti))} sx={{ ml: 1 }}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* Arguments */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Входные данные (аргументы)
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(t.args ?? []).map((arg: any, ai: number) => (
                  <Box key={ai} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.disabled" sx={{ minWidth: 68 }}>
                      Аргумент {ai + 1}
                    </Typography>
                    <TextField size="small" sx={{ flex: 1 }}
                      defaultValue={smartDisplay(arg)}
                      key={`${ti}-${ai}-${JSON.stringify(arg)}`}
                      onBlur={(e) => updArg(ti, ai, e.target.value)}
                      placeholder="42 или «текст» или [1, 2, 3]"
                    />
                    <IconButton size="small" color="error" onClick={() => removeArg(ti, ai)} sx={{ p: 0.5 }}>
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 12 }} />} onClick={() => addArg(ti)}
                  sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
                  Добавить аргумент
                </Button>
              </Box>
            </Box>
            <Divider orientation="vertical" flexItem />
            {/* Expected */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Ожидаемый результат
              </Typography>
              <TextField size="small" fullWidth
                defaultValue={smartDisplay(t.expected)}
                key={`exp-${ti}-${JSON.stringify(t.expected)}`}
                onBlur={(e) => updExpected(ti, e.target.value)}
                placeholder="42 или «текст» или [1, 2, 3]"
                helperText="Введите то, что должна вернуть функция"
              />
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
};

// ─── Версии закрытия дела ─────────────────────────────────────────────────────
const VersionsEditor: React.FC<{ versions: any[]; onChange: (v: any[]) => void }> = ({ versions, onChange }) => {
  const upd = (i: number, f: string, v: any) => onChange(versions.map((it, j) => j === i ? { ...it, [f]: v } : it));
  const add = () => onChange([...versions, { id: String(versions.length + 1), text: '', correct: false }]);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Варианты закрытия дела</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={add}>
          Добавить вариант
        </Button>
      </Box>
      {versions.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>
          Варианты не заданы
        </Typography>
      )}
      {versions.map((v, i) => (
        <Paper key={i} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, mb: 1, borderColor: v.correct ? 'success.main' : 'divider' }}>
          <Tooltip title={v.correct ? 'Правильный ответ' : 'Отметить как правильный'}>
            <IconButton size="small" color={v.correct ? 'success' : 'default'} onClick={() => upd(i, 'correct', !v.correct)} sx={{ flexShrink: 0 }}>
              {v.correct ? <CheckIcon sx={{ fontSize: 20 }} /> : <CircleIcon sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
          <TextField label={`Вариант ${i + 1}`} value={v.text ?? ''} onChange={(e) => upd(i, 'text', e.target.value)}
            size="small" sx={{ flex: 1 }} placeholder="Опишите версию событий..." />
          <IconButton size="small" color="error" onClick={() => onChange(versions.filter((_, j) => j !== i))}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
      ))}
      {versions.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Отметьте галочкой правильный вариант
        </Typography>
      )}
    </Box>
  );
};

// ─── Материалы дела ───────────────────────────────────────────────────────────
const MaterialsEditor: React.FC<{ materials: any[]; onChange: (v: any[]) => void }> = ({ materials, onChange }) => {
  const norm = (m: any): { title: string; url: string; type: string } => {
    if (typeof m === 'string') return { title: m, url: '', type: 'text' };
    return { title: m.title ?? m.name ?? '', url: m.url ?? m.link ?? '', type: m.type ?? (m.url ? 'link' : 'text') };
  };
  const upd = (i: number, f: string, v: string) => {
    const updated = materials.map((m, j) => {
      if (j !== i) return m;
      const n = norm(m);
      return { ...n, [f]: v };
    });
    onChange(updated);
  };
  const add = () => onChange([...materials, { title: '', url: '', type: 'link' }]);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Материалы для студента</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={add}>
          Добавить материал
        </Button>
      </Box>
      {materials.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>
          Материалы не добавлены
        </Typography>
      )}
      {materials.map((m, i) => {
        const n = norm(m);
        return (
          <Paper key={i} variant="outlined" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, mb: 1 }}>
            <LinkIcon color="action" sx={{ mt: 1.2, flexShrink: 0, fontSize: 18 }} />
            <Box sx={{ flex: 1, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <TextField label="Название" value={n.title} onChange={(e) => upd(i, 'title', e.target.value)}
                size="small" sx={{ flex: 2, minWidth: 160 }} placeholder="Документация Python" />
              <TextField label="Ссылка (URL)" value={n.url} onChange={(e) => upd(i, 'url', e.target.value)}
                size="small" sx={{ flex: 3, minWidth: 200 }} placeholder="https://..." />
            </Box>
            <IconButton size="small" color="error" onClick={() => onChange(materials.filter((_, j) => j !== i))}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Подсказки ────────────────────────────────────────────────────────────────
// hints format: { "evidence_key": { "1": "text", "2": "text" } }
// Flat representation: [{ key, text }] — auto-number per key
interface HintRow { key: string; text: string }
function hintsToFlat(hints: any): HintRow[] {
  if (!hints || typeof hints !== 'object') return [];
  const rows: HintRow[] = [];
  for (const key of Object.keys(hints)) {
    const group = hints[key];
    if (typeof group === 'object') {
      for (const level of Object.keys(group).sort()) {
        rows.push({ key, text: group[level] ?? '' });
      }
    } else if (typeof group === 'string') {
      rows.push({ key, text: group });
    }
  }
  return rows;
}
function flatToHints(rows: HintRow[]): any {
  const result: any = {};
  for (const row of rows) {
    if (!result[row.key]) result[row.key] = {};
    const existing = Object.keys(result[row.key]).length;
    result[row.key][String(existing + 1)] = row.text;
  }
  return result;
}

const HintsEditor: React.FC<{ hints: any; evidenceIds: string[]; onChange: (v: any) => void }> = ({ hints, evidenceIds, onChange }) => {
  const [rows, setRows] = useState<HintRow[]>(() => hintsToFlat(hints));
  useEffect(() => { setRows(hintsToFlat(hints)); }, [hints]);

  const commit = (updated: HintRow[]) => {
    setRows(updated);
    onChange(flatToHints(updated));
  };
  const upd = (i: number, f: keyof HintRow, v: string) => commit(rows.map((r, j) => j === i ? { ...r, [f]: v } : r));
  const add = () => commit([...rows, { key: evidenceIds[0] ?? '', text: '' }]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Подсказки</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={add}>
          Добавить подсказку
        </Button>
      </Box>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>
          Подсказки не добавлены
        </Typography>
      )}
      {rows.map((row, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1, alignItems: 'flex-start' }}>
          <Chip label={`#${i + 1}`} size="small" color="default" sx={{ mt: 1, flexShrink: 0 }} />
          {evidenceIds.length > 0 ? (
            <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
              <InputLabel>Улика</InputLabel>
              <Select value={row.key} label="Улика" onChange={(e) => upd(i, 'key', e.target.value)}>
                {evidenceIds.map((id) => <MenuItem key={id} value={id}>{id}</MenuItem>)}
              </Select>
            </FormControl>
          ) : (
            <TextField label="Ключ улики" value={row.key} onChange={(e) => upd(i, 'key', e.target.value)}
              size="small" sx={{ width: 160, flexShrink: 0 }} />
          )}
          <TextField label={`Текст подсказки ${i + 1}`} value={row.text} onChange={(e) => upd(i, 'text', e.target.value)}
            size="small" sx={{ flex: 1 }} multiline maxRows={3} />
          <IconButton size="small" color="error" onClick={() => commit(rows.filter((_, j) => j !== i))} sx={{ mt: 0.5 }}>
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
};

// ─── Улики ────────────────────────────────────────────────────────────────────
const EvidenceEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const [open, setOpen] = useState<number | null>(null);
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Улики — задачи на программирование</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => {
            const next = [...items, { id: String(items.length + 1), title: '', fnName: '', starter: '', tests: [] }];
            onChange(next);
            setOpen(next.length - 1);
          }}>
          Добавить улику
        </Button>
      </Box>
      {items.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>
          Улики отсутствуют
        </Typography>
      )}
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <Paper key={i} variant="outlined" sx={{ mb: 1.5, overflow: 'hidden', borderColor: isOpen ? 'primary.main' : 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none', bgcolor: isOpen ? 'action.selected' : 'background.paper' }}
              onClick={() => setOpen(isOpen ? null : i)}>
              <Chip label={`#${item.id || i + 1}`} size="small" color="primary" variant="outlined" sx={{ mr: 1.5, fontFamily: MONO, fontSize: 11, height: 20 }} />
              <Typography sx={{ flex: 1, fontSize: 13, color: item.title ? 'text.primary' : 'text.disabled', fontStyle: item.title ? 'normal' : 'italic' }}>
                {item.title || '— без названия —'}
              </Typography>
              {item.fnName && (
                <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'info.main', mr: 1 }}>{item.fnName}()</Typography>
              )}
              {Array.isArray(item.tests) && item.tests.length > 0 && (
                <Chip label={`${item.tests.length} тест${item.tests.length === 1 ? '' : 'а'}`} size="small" sx={{ mr: 1, height: 18, fontSize: 10 }} />
              )}
              <SortControls i={i} len={items.length}
                onUp={() => onChange(moveItem(items, i, i - 1))}
                onDown={() => onChange(moveItem(items, i, i + 1))}
                onRemove={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }} />
              {isOpen ? <ExpandLessIcon color="action" sx={{ fontSize: 18, ml: 0.5 }} /> : <ExpandMoreIcon color="action" sx={{ fontSize: 18, ml: 0.5 }} />}
            </Box>
            {isOpen && (
              <Box sx={{ px: 2, pb: 2.5, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField label="ID улики" value={item.id ?? ''} onChange={(e) => upd(i, 'id', e.target.value)}
                    size="small" sx={{ width: 90 }} />
                  <TextField label="Название улики" value={item.title ?? ''} onChange={(e) => upd(i, 'title', e.target.value)}
                    size="small" sx={{ flex: 1 }} placeholder="Зашифрованный файл" />
                  <TextField label="Имя функции" value={item.fnName ?? ''} onChange={(e) => upd(i, 'fnName', e.target.value)}
                    size="small" sx={{ width: 190 }} inputProps={{ style: { fontFamily: MONO } }} placeholder="solve"
                    helperText="Название функции в коде" />
                </Box>
                {Array.isArray(item.body) ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Описание задачи
                    </Typography>
                    <BodyBlocks blocks={item.body} onChange={(v) => upd(i, 'body', v)} />
                  </Box>
                ) : typeof item.description === 'string' ? (
                  <TextField label="Описание задачи" value={item.description}
                    onChange={(e) => upd(i, 'description', e.target.value)}
                    multiline minRows={2} size="small" fullWidth />
                ) : null}
                <TextField label="Стартовый код" value={item.starter ?? ''} onChange={(e) => upd(i, 'starter', e.target.value)}
                  multiline minRows={3} maxRows={10} size="small" fullWidth
                  inputProps={{ style: { fontFamily: MONO, fontSize: 12 } }}
                  helperText="Шаблон кода — то, что студент видит в начале задачи" />
                <Divider />
                <TestsEditor tests={item.tests ?? []} onChange={(v) => upd(i, 'tests', v)} />
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Брифинг ──────────────────────────────────────────────────────────────────
const BriefingEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const [open, setOpen] = useState<number | null>(0);
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Блоки брифинга</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => { const next = [...items, { curator: '', body: [''] }]; onChange(next); setOpen(next.length - 1); }}>
          Добавить блок
        </Button>
      </Box>
      {items.length === 0 && <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>Брифинг пуст</Typography>}
      {items.map((entry, i) => {
        const isOpen = open === i;
        const body: any[] = Array.isArray(entry.body) ? entry.body : [''];
        return (
          <Paper key={i} variant="outlined" sx={{ mb: 1.5, overflow: 'hidden', borderColor: isOpen ? 'primary.main' : 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none', bgcolor: isOpen ? 'action.selected' : 'background.paper' }}
              onClick={() => setOpen(isOpen ? null : i)}>
              <Chip label={`Блок ${i + 1}`} size="small" variant="outlined" sx={{ mr: 1.5 }} />
              <Typography sx={{ flex: 1, fontSize: 13, color: entry.curator ? 'text.primary' : 'text.disabled', fontStyle: entry.curator ? 'normal' : 'italic' }}>
                {entry.curator ? `Спикер: ${entry.curator}` : '— спикер не задан —'}
              </Typography>
              <SortControls i={i} len={items.length}
                onUp={() => onChange(moveItem(items, i, i - 1))}
                onDown={() => onChange(moveItem(items, i, i + 1))}
                onRemove={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }} />
              {isOpen ? <ExpandLessIcon color="action" sx={{ fontSize: 18, ml: 0.5 }} /> : <ExpandMoreIcon color="action" sx={{ fontSize: 18, ml: 0.5 }} />}
            </Box>
            {isOpen && (
              <Box sx={{ px: 2, pb: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField label="Спикер / персонаж" value={entry.curator ?? ''} onChange={(e) => upd(i, 'curator', e.target.value)}
                    size="small" sx={{ width: 200 }} placeholder="viktor" />
                  {entry.expect !== undefined && (
                    <TextField label="Ожидаемый вывод" value={entry.expect ?? ''} onChange={(e) => upd(i, 'expect', e.target.value)}
                      size="small" sx={{ flex: 1 }} />
                  )}
                  <Button size="small" color="inherit" onClick={() => upd(i, 'expect', entry.expect !== undefined ? undefined : '')}
                    sx={{ whiteSpace: 'nowrap', fontSize: 11, flexShrink: 0 }}>
                    {entry.expect !== undefined ? '− ожидаемый вывод' : '+ ожидаемый вывод'}
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Содержание блока
                </Typography>
                <BodyBlocks blocks={body} onChange={(v) => upd(i, 'body', v)} />
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
};

// ─── Финал ────────────────────────────────────────────────────────────────────
const FinaleEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void }> = ({ items, onChange }) => {
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Финальный диалог</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => onChange([...items, { curator: '', text: '' }])}>
          Добавить реплику
        </Button>
      </Box>
      {items.length === 0 && <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', py: 1 }}>Финал пуст</Typography>}
      {items.map((entry, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start' }}>
          <TextField label="Персонаж" value={entry.curator ?? entry.speaker ?? ''}
            onChange={(e) => upd(i, 'curator' in entry ? 'curator' : 'speaker', e.target.value)}
            size="small" sx={{ width: 160, flexShrink: 0 }} placeholder="viktor"
          />
          <TextField label="Текст реплики" value={entry.text ?? ''} onChange={(e) => upd(i, 'text', e.target.value)}
            multiline minRows={2} maxRows={5} size="small" sx={{ flex: 1 }} />
          <SortControls i={i} len={items.length}
            onUp={() => onChange(moveItem(items, i, i - 1))}
            onDown={() => onChange(moveItem(items, i, i + 1))}
            onRemove={() => onChange(items.filter((_, j) => j !== i))} />
        </Box>
      ))}
    </Box>
  );
};

// ─── Карточка дела в списке ───────────────────────────────────────────────────
const CaseListItem: React.FC<{ c: KodexExternalSummary; selected: boolean; onClick: () => void }> = ({ c, selected, onClick }) => {
  const diff = DIFFICULTY_LABELS[c.difficulty] || DIFFICULTY_LABELS[1];
  return (
    <Box onClick={onClick} sx={{
      px: 2, py: 1.5, cursor: 'pointer',
      borderLeft: '3px solid',
      borderColor: selected ? 'primary.main' : 'transparent',
      bgcolor: selected ? 'action.selected' : 'transparent',
      transition: 'all 0.12s',
      '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
        <Typography variant="caption" color="text.disabled" sx={{ fontFamily: MONO }}>{c.num || c.slug}</Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.playable ? 'success.main' : 'action.disabled' }} />
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? 'primary.main' : 'text.primary', lineHeight: 1.3, mb: 0.5 }}>
        {c.title}
      </Typography>
      <Chip label={diff.label} size="small" color={diff.color} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
    </Box>
  );
};

// ─── Диалог создания дела ─────────────────────────────────────────────────────
const NewCaseDialog: React.FC<{ open: boolean; onClose: () => void; onCreate: (p: Partial<KodexExternalFull>) => void }> = ({ open, onClose, onCreate }) => {
  const [form, setForm] = useState({ slug: '', num: '', title: '', curator: '', difficulty: 1 });
  useEffect(() => { if (open) setForm({ slug: '', num: '', title: '', curator: '', difficulty: 1 }); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Новое дело</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="slug" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
            size="small" sx={{ flex: 1 }} helperText="case-b01 — a-z, 0-9, дефис" inputProps={{ style: { fontFamily: MONO } }} />
          <TextField label="Номер" value={form.num} onChange={(e) => setForm((p) => ({ ...p, num: e.target.value }))}
            size="small" sx={{ width: 130 }} placeholder="ДЕЛО-001" />
        </Box>
        <TextField label="Название дела" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} fullWidth required />
        <TextField label="Куратор (персонаж)" value={form.curator} onChange={(e) => setForm((p) => ({ ...p, curator: e.target.value }))} fullWidth placeholder="viktor" />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Сложность</InputLabel>
          <Select value={form.difficulty} onChange={(e) => setForm((p) => ({ ...p, difficulty: Number(e.target.value) }))} label="Сложность">
            <MenuItem value={1}>Новичок</MenuItem>
            <MenuItem value={2}>Агент</MenuItem>
            <MenuItem value={3}>Эксперт</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={!form.slug || !form.title}
          onClick={() => onCreate({ ...EMPTY_CASE(), ...form })}>Создать</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Главная страница ─────────────────────────────────────────────────────────
const SIDEBAR_W = 280;

export default function KodexCasesPage() {
  const [cases, setCases] = useState<KodexExternalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<KodexExternalFull> | null>(null);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    try { setCases(await kodexExternalApi.list()); }
    catch { setToast({ msg: 'Ошибка загрузки дел', sev: 'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);

  const openCase = async (slug: string) => {
    setSelectedId(slug);
    setTab(0);
    try { setEditing({ ...await kodexExternalApi.get(slug) }); }
    catch { setToast({ msg: 'Ошибка загрузки дела', sev: 'error' }); }
  };

  const save = async () => {
    if (!editing || !selectedId) return;
    setSaving(true);
    try {
      const updated = await kodexExternalApi.update(selectedId, editing as any);
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
      await kodexExternalApi.create(payload as any);
      setNewDialog(false);
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
      await kodexExternalApi.delete(slug);
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

  const evidenceIds = (editing?.evidence ?? []).map((e: any) => e.id ?? '').filter(Boolean);

  return (
    <Layout>
      <Box sx={{ m: { xs: -2, sm: -3 }, height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' }, display: 'flex', overflow: 'hidden' }}>

        {/* ── Левая панель: список дел ── */}
        <Box sx={{ width: SIDEBAR_W, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <TextField size="small" fullWidth placeholder="Поиск дел..." value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment> }}
            />
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 5 }}><CircularProgress size={24} /></Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.disabled">{search ? 'Ничего не найдено' : 'Дел нет'}</Typography>
              </Box>
            ) : filtered.map((c) => (
              <React.Fragment key={c.slug}>
                <CaseListItem c={c} selected={c.slug === selectedId} onClick={() => openCase(c.slug)} />
                <Divider />
              </React.Fragment>
            ))}
          </Box>
          <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialog(true)}>
              Новое дело
            </Button>
          </Box>
        </Box>

        {/* ── Правая панель: редактор ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
          {!editing ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, opacity: 0.4 }}>
              <ShieldIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
              <Typography color="text.disabled">Выберите дело из списка</Typography>
            </Box>
          ) : (
            <>
              {/* Шапка дела */}
              <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.paper' }}>
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {editing.num || editing.slug} — {editing.title}
                    </Typography>
                    {editing.status && STATUS_LABELS[editing.status] && (
                      <Chip label={STATUS_LABELS[editing.status].label} color={STATUS_LABELS[editing.status].color} size="small" />
                    )}
                    {editing.is_override && <Chip label="Изменено" color="info" size="small" variant="outlined" />}
                  </Box>
                </Box>
                <Tooltip title={editing.is_seed ? 'Сбросить правки к оригиналу' : 'Удалить дело'}>
                  <IconButton size="small" color="error" onClick={() => setDelConfirm(selectedId!)}>
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Button variant="contained" onClick={save} disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: 16 }} />}>
                  Сохранить
                </Button>
              </Box>

              {/* Вкладки */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                  <Tab label="Основное" />
                  <Tab label="Брифинг" />
                  <Tab label="Улики" />
                  <Tab label="Финал" />
                </Tabs>
              </Box>

              {/* Содержимое вкладки */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                <Box sx={{ maxWidth: 780 }}>

                  {/* ── Основное ── */}
                  {tab === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Card variant="outlined" sx={{ p: 2.5 }}>
                        <SectionTitle>Идентификатор</SectionTitle>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <TextField label="slug" value={editing.slug || ''} onChange={(e) => patch('slug', e.target.value)}
                            size="small" sx={{ flex: 1 }} inputProps={{ style: { fontFamily: MONO } }}
                            helperText="case-b01 — только a-z, 0-9, дефис" />
                          <TextField label="Номер дела" value={editing.num || ''} onChange={(e) => patch('num', e.target.value)}
                            size="small" sx={{ width: 160 }} placeholder="ДЕЛО-001" />
                        </Box>
                      </Card>

                      <Card variant="outlined" sx={{ p: 2.5 }}>
                        <SectionTitle>Основная информация</SectionTitle>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField label="Название дела" value={editing.title || ''} onChange={(e) => patch('title', e.target.value)} fullWidth required />
                          <TextField label="Куратор (персонаж-ведущий)" value={editing.curator || ''} onChange={(e) => patch('curator', e.target.value)} fullWidth placeholder="viktor" />
                          <TextField label="Аннотация — краткое описание для студента" value={editing.anno || ''} onChange={(e) => patch('anno', e.target.value)} fullWidth multiline rows={2} />
                        </Box>
                      </Card>

                      <Card variant="outlined" sx={{ p: 2.5 }}>
                        <SectionTitle>Параметры</SectionTitle>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Сложность</InputLabel>
                            <Select value={editing.difficulty || 1} onChange={(e) => patch('difficulty', Number(e.target.value))} label="Сложность">
                              <MenuItem value={1}>Новичок</MenuItem>
                              <MenuItem value={2}>Агент</MenuItem>
                              <MenuItem value={3}>Эксперт</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField label="Ранг" type="number" value={editing.rank || 1} onChange={(e) => patch('rank', Number(e.target.value))}
                            size="small" sx={{ width: 90 }} inputProps={{ min: 1 }} />
                          <TextField label="Кредиты за решение" type="number" value={editing.reward_credits || 0} onChange={(e) => patch('reward_credits', Number(e.target.value))}
                            size="small" sx={{ width: 130 }} inputProps={{ min: 0 }} />
                          <TextField label="Репутация за решение" type="number" value={editing.reward_rep || 0} onChange={(e) => patch('reward_rep', Number(e.target.value))}
                            size="small" sx={{ width: 140 }} inputProps={{ min: 0 }} />
                          <FormControlLabel
                            control={<Switch checked={!!editing.playable} onChange={(e) => patch('playable', e.target.checked)} />}
                            label="Активно для учеников"
                          />
                        </Box>
                      </Card>

                      <Card variant="outlined" sx={{ p: 2.5 }}>
                        <SectionTitle>Задание</SectionTitle>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField label="Цель расследования" value={editing.goal || ''} onChange={(e) => patch('goal', e.target.value)} fullWidth multiline rows={2} />
                          <TextField label="Подозреваемые / участники" value={editing.suspects || ''} onChange={(e) => patch('suspects', e.target.value)} fullWidth multiline rows={2} />
                          <TextField label="Задание для агента" value={editing.task || ''} onChange={(e) => patch('task', e.target.value)} fullWidth multiline rows={3} />
                        </Box>
                      </Card>

                      <Card variant="outlined" sx={{ p: 2.5 }}>
                        <SectionTitle>Код</SectionTitle>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField label="Имя функции (fnName)" value={editing.fn_name || ''} onChange={(e) => patch('fn_name', e.target.value)}
                            fullWidth inputProps={{ style: { fontFamily: MONO } }}
                            helperText="Имя функции, которую пишет студент. Оставьте пустым для script-режима." />
                          <TextField label="Стартовый код" value={editing.starter || ''} onChange={(e) => patch('starter', e.target.value)}
                            fullWidth multiline rows={6} inputProps={{ style: { fontFamily: MONO, fontSize: 12 } }}
                            helperText="Шаблон кода, который студент видит при открытии задачи" />
                        </Box>
                      </Card>
                    </Box>
                  )}

                  {/* ── Брифинг ── */}
                  {tab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <BriefingEditor items={editing.briefing || []} onChange={(v) => patch('briefing', v)} />
                      <Divider />
                      <MaterialsEditor materials={editing.materials || []} onChange={(v) => patch('materials', v)} />
                    </Box>
                  )}

                  {/* ── Улики ── */}
                  {tab === 2 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <EvidenceEditor items={editing.evidence || []} onChange={(v) => patch('evidence', v)} />
                      <Divider />
                      <VersionsEditor versions={editing.versions || []} onChange={(v) => patch('versions', v)} />
                      <Divider />
                      <HintsEditor hints={editing.hints || {}} evidenceIds={evidenceIds} onChange={(v) => patch('hints', v)} />
                    </Box>
                  )}

                  {/* ── Финал ── */}
                  {tab === 3 && (
                    <FinaleEditor items={editing.finale || []} onChange={(v) => patch('finale', v)} />
                  )}

                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>

      <NewCaseDialog open={newDialog} onClose={() => setNewDialog(false)} onCreate={createCase} />

      <Dialog open={delConfirm !== null} onClose={() => setDelConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle color="error">{editing?.is_seed ? 'Сбросить правки?' : 'Удалить дело?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {editing?.is_seed
              ? 'Все изменения будут удалены. Дело вернётся к оригиналу.'
              : 'Новое дело будет удалено из базы Кодэкс. Это необратимо.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelConfirm(null)}>Отмена</Button>
          <Button color="error" onClick={() => deleteCase(delConfirm!)}>
            {editing?.is_seed ? 'Сбросить' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.sev || 'success'} onClose={() => setToast(null)}>{toast?.msg}</Alert>
      </Snackbar>
    </Layout>
  );
}
