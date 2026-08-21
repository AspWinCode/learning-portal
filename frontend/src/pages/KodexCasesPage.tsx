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
  AutoAwesome as AiIcon,
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
import { kodexExternalApi, KodexExternalFull, KodexExternalSummary, kodexModuleTheoryApi, KodexModuleTheory } from '../services/kodexApi';
import { mediaApi } from '../services/api';
import NotesEditor from '../components/NotesEditor';
import MenuBookIcon from '@mui/icons-material/MenuBook';

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
// Формат теста зависит от режима дела (см. runner harness.py):
//  - function-режим (задано case-level fnName): {args: [...], expect: ...} — вызов функции.
//  - script-режим (fnName пустой): {vars: {...}, expect: ...} — переменные подставляются
//    в код перед выполнением, expect сравнивается с тем, что напечатал print().
// Поле результата всегда называется expect (не expected!) — так его читает harness.py.
function varsToRows(vars: any): { key: string; value: any }[] {
  if (!vars || typeof vars !== 'object') return [];
  return Object.entries(vars).map(([key, value]) => ({ key, value }));
}
function rowsToVars(rows: { key: string; value: any }[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const r of rows) if (r.key) result[r.key] = r.value;
  return result;
}

const TestsEditor: React.FC<{ tests: any[]; onChange: (v: any[]) => void; mode: 'function' | 'script' }> = ({ tests, onChange, mode }) => {
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
  const updVarRow = (ti: number, ri: number, field: 'key' | 'value', val: string) => {
    onChange(tests.map((t, j) => {
      if (j !== ti) return t;
      const rows = varsToRows(t.vars);
      rows[ri] = { ...rows[ri], [field]: field === 'value' ? smartParse(val) : val };
      return { ...t, vars: rowsToVars(rows) };
    }));
  };
  const addVarRow = (ti: number) => {
    onChange(tests.map((t, j) => {
      if (j !== ti) return t;
      const rows = [...varsToRows(t.vars), { key: '', value: '' }];
      return { ...t, vars: rowsToVars(rows) };
    }));
  };
  const removeVarRow = (ti: number, ri: number) => {
    onChange(tests.map((t, j) => {
      if (j !== ti) return t;
      const rows = varsToRows(t.vars).filter((_, k) => k !== ri);
      return { ...t, vars: rowsToVars(rows) };
    }));
  };
  const updExpect = (ti: number, val: string) => {
    onChange(tests.map((t, j) => j !== ti ? t : { ...t, expect: smartParse(val) }));
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
          onClick={() => onChange([...tests, mode === 'function' ? { args: [''], expect: '' } : { vars: {}, expect: '' }])}>
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
            {mode === 'function' ? (
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Входные данные (аргументы функции)
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
            ) : (
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Переменные, подставляемые в код перед запуском
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {varsToRows(t.vars).map((row, ri) => (
                    <Box key={ri} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField size="small" sx={{ width: 110 }}
                        defaultValue={row.key}
                        key={`k-${ti}-${ri}`}
                        onBlur={(e) => updVarRow(ti, ri, 'key', e.target.value)}
                        placeholder="имя_переменной"
                        inputProps={{ style: { fontFamily: MONO, fontSize: 12 } }}
                      />
                      <Typography color="text.disabled">=</Typography>
                      <TextField size="small" sx={{ flex: 1 }}
                        defaultValue={smartDisplay(row.value)}
                        key={`v-${ti}-${ri}-${JSON.stringify(row.value)}`}
                        onBlur={(e) => updVarRow(ti, ri, 'value', e.target.value)}
                        placeholder="42 или «текст» или [1, 2, 3]"
                      />
                      <IconButton size="small" color="error" onClick={() => removeVarRow(ti, ri)} sx={{ p: 0.5 }}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon sx={{ fontSize: 12 }} />} onClick={() => addVarRow(ti)}
                    sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
                    Добавить переменную
                  </Button>
                </Box>
              </Box>
            )}
            <Divider orientation="vertical" flexItem />
            {/* Expect */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {mode === 'function' ? 'Ожидаемый результат (return)' : 'Ожидаемый вывод (print)'}
              </Typography>
              <TextField size="small" fullWidth
                defaultValue={smartDisplay(t.expect)}
                key={`exp-${ti}-${JSON.stringify(t.expect)}`}
                onBlur={(e) => updExpect(ti, e.target.value)}
                placeholder="42 или «текст» или [1, 2, 3]"
                helperText={mode === 'function' ? 'То, что должна вернуть функция' : 'То, что должно быть напечатано на экране'}
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
// Реальная схема улики (движок Player) — ровно три поля: id, name, tests.
// Имя функции и стартовый код общие на всё дело (см. поля fnName/starter выше,
// в разделе «Код») — у отдельной улики их нет, поэтому здесь не редактируются.
const EvidenceEditor: React.FC<{ items: any[]; onChange: (v: any[]) => void; testMode: 'function' | 'script' }> = ({ items, onChange, testMode }) => {
  const [open, setOpen] = useState<number | null>(null);
  const upd = (i: number, f: string, v: any) => onChange(items.map((it, j) => j === i ? { ...it, [f]: v } : it));
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <SectionTitle>Улики — задачи на программирование</SectionTitle>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          onClick={() => {
            const next = [...items, { id: String(items.length + 1), name: '', tests: [] }];
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
              <Typography sx={{ flex: 1, fontSize: 13, color: item.name ? 'text.primary' : 'text.disabled', fontStyle: item.name ? 'normal' : 'italic' }}>
                {item.name || '— без названия —'}
              </Typography>
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
                  <TextField label="Название улики" value={item.name ?? ''} onChange={(e) => upd(i, 'name', e.target.value)}
                    size="small" sx={{ flex: 1 }} placeholder="Зашифрованный файл" />
                </Box>
                <Divider />
                <TestsEditor tests={item.tests ?? []} onChange={(v) => upd(i, 'tests', v)} mode={testMode} />
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

// ─── Промт для AI-генерации дела ─────────────────────────────────────────────
const CASE_PROMPT = `Сгенерируй дело для платформы Кодэкс — детективной игры на программирование (Python).
Верни ТОЛЬКО валидный JSON без пояснений, строго по следующей схеме:

{
  "slug": "case-xxx",          // уникальный ID: только a-z, 0-9, дефис (например: case-b07)
  "num": "ДЕЛО-007",           // отображаемый номер
  "title": "Название дела",
  "curator": "viktor",         // имя куратора-персонажа
  "anno": "Краткое описание для карточки студента (1-2 предложения)",
  "difficulty": 1,             // 1 = Новичок, 2 = Агент, 3 = Эксперт
  "rank": 1,
  "reward_credits": 30,
  "reward_rep": 20,
  "playable": false,
  "goal": "Цель расследования",
  "suspects": "Подозреваемые или участники событий",
  "task": "Подробное задание для студента",
  "fn_name": "solve",          // имя функции Python, которую пишет студент
  "starter": "def solve(...):\\n    pass",
  "briefing": [
    {
      "curator": "viktor",
      "body": [
        "Текстовый параграф брифинга",
        { "code": "# Пример кода если нужен" }
      ]
    }
  ],
  "materials": [
    { "title": "Название ресурса", "url": "https://docs.python.org/..." }
  ],
  "evidence": [
    {
      "id": "e1",
      "name": "Название улики",
      "tests": [
        { "args": [1, 2], "expect": 3 },
        { "args": [0, 0], "expect": 0 }
      ]
    }
  ],
  "versions": [
    { "id": "1", "text": "Неверный вариант закрытия", "correct": false },
    { "id": "2", "text": "Правильный вариант закрытия", "correct": true }
  ],
  "hints": {
    "1": {
      "1": "Первая подсказка для улики 1",
      "2": "Вторая подсказка для улики 1"
    }
  },
  "finale": [
    { "curator": "viktor", "text": "Отличная работа, агент! Дело закрыто." }
  ]
}

Правила:
- slug должен быть уникальным, формат: case-[буквы/цифры/дефис]
- difficulty: только 1, 2 или 3
- briefing.body — массив: строки = текст, объекты { "code": "..." } = блоки кода
- у улики (evidence) ровно три поля: id, name, tests — имя функции и стартовый
  код общие на всё дело (fn_name/starter выше), у отдельной улики их нет
- evidence.tests — реальные тесты для автопроверки, поле результата всегда
  называется expect (не expected!)
- если fn_name задан (function-режим) — тесты вызывают функцию: { "args": [1, 2], "expect": 3 }
- если fn_name пустой (script-режим, код выполняется как скрипт, сверяется
  вывод print) — тесты подставляют переменные: { "vars": { "x": 1 }, "expect": "результат print" }
- versions — минимум 2 варианта, ровно один с correct: true
- Весь JSON должен быть на русском языке (кроме кода и slug)`;

// ─── Диалог импорта JSON ──────────────────────────────────────────────────────
const ImportJsonDialog: React.FC<{ open: boolean; onClose: () => void; onImport: (p: Partial<KodexExternalFull>) => void }> = ({ open, onClose, onImport }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [jsonText, setJsonText] = useState('');
  const [err, setErr] = useState('');
  const [parsed, setParsed] = useState<Partial<KodexExternalFull> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) { setJsonText(''); setErr(''); setParsed(null); setActiveTab(0); } }, [open]);

  const handleJson = (text: string) => {
    setJsonText(text);
    setErr('');
    setParsed(null);
    if (!text.trim()) return;
    try {
      const data = JSON.parse(text);
      if (!data.slug) { setErr('Поле slug обязательно'); return; }
      if (!data.title) { setErr('Поле title обязательно'); return; }
      setParsed(data);
    } catch {
      setErr('Некорректный JSON — проверьте структуру');
    }
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(CASE_PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Импорт дела из JSON</DialogTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="1. Промт для ИИ" />
          <Tab label="2. Вставить JSON" />
        </Tabs>
      </Box>
      <DialogContent sx={{ pt: 2.5, minHeight: 340 }}>
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info" icon={<AiIcon />}>
              Скопируйте промт, вставьте в ChatGPT или Claude, добавьте свою тему дела — и вернитесь со сгенерированным JSON.
            </Alert>
            <Box sx={{ position: 'relative' }}>
              <TextField
                multiline rows={16} fullWidth
                value={CASE_PROMPT}
                InputProps={{ readOnly: true, sx: { fontFamily: MONO, fontSize: 11 } }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="info" startIcon={<AiIcon />} onClick={copyPrompt} sx={{ minWidth: 180 }}>
                {copied ? 'Скопировано ✓' : 'Скопировать промт'}
              </Button>
              <Button variant="outlined" onClick={() => setActiveTab(1)}>
                У меня уже есть JSON →
              </Button>
            </Box>
          </Box>
        )}
        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Вставьте JSON, сгенерированный ИИ. Все поля заполнятся автоматически.
            </Typography>
            <TextField
              label="JSON дела"
              multiline rows={14} fullWidth
              value={jsonText}
              onChange={(e) => handleJson(e.target.value)}
              error={!!err}
              helperText={err || (parsed ? `✓ Дело «${parsed.title}» готово к импорту` : 'Вставьте JSON сюда')}
              inputProps={{ style: { fontFamily: MONO, fontSize: 12 } }}
              placeholder={'{\n  "slug": "case-b01",\n  "title": "Название дела",\n  ...\n}'}
            />
            {parsed && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="subtitle2">{parsed.num || parsed.slug} — {parsed.title}</Typography>
                  {parsed.difficulty != null && <Chip label={DIFFICULTY_LABELS[parsed.difficulty]?.label} size="small" color={DIFFICULTY_LABELS[parsed.difficulty]?.color} />}
                  {Array.isArray(parsed.briefing) && parsed.briefing.length > 0 && <Chip label={`Брифинг: ${parsed.briefing.length} блок(а)`} size="small" variant="outlined" />}
                  {Array.isArray(parsed.evidence) && parsed.evidence.length > 0 && <Chip label={`Улики: ${parsed.evidence.length}`} size="small" variant="outlined" />}
                  {Array.isArray(parsed.versions) && parsed.versions.length > 0 && <Chip label={`Версий: ${parsed.versions.length}`} size="small" variant="outlined" />}
                </Box>
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Отмена</Button>
        {activeTab === 1 && (
          <Button variant="contained" disabled={!parsed} onClick={() => { if (parsed) onImport(parsed); }}>
            Импортировать и открыть
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

// ─── AI черновик ─────────────────────────────────────────────────────────────
const AiDraftDialog: React.FC<{ open: boolean; onClose: () => void; onDraft: (p: Partial<KodexExternalFull>) => void }> = ({ open, onClose, onDraft }) => {
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Partial<KodexExternalFull> | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setIdea(''); setPreview(null); setErr(''); setLoading(false); } }, [open]);

  const generate = async () => {
    if (!idea.trim()) return;
    setLoading(true); setErr(''); setPreview(null);
    try { setPreview(await kodexExternalApi.aiDraft(idea.trim())); }
    catch (e: any) { setErr(e?.response?.data?.detail || 'Ошибка генерации'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AiIcon color="info" /> AI Черновик дела
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <TextField
          label="Опишите идею дела"
          multiline rows={4} fullWidth
          value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="Например: Дело о пропавшей переменной. Студент должен написать функцию, которая находит неиспользуемые переменные. Сложность — Агент."
          helperText="Опишите тему, задачу, сложность — AI сгенерирует полную структуру дела"
        />
        {err && <Alert severity="error">{err}</Alert>}
        {preview && (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.selected', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AiIcon color="info" sx={{ fontSize: 16 }} />
              <Typography variant="body2" color="text.secondary">Черновик сгенерирован</Typography>
              <Box sx={{ flex: 1 }} />
              <Chip label={preview.num || preview.slug} size="small" />
            </Box>
            <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>{preview.title}</Typography>
              {preview.anno && <Typography variant="body2" color="text.secondary">{preview.anno}</Typography>}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {preview.difficulty != null && <Chip label={DIFFICULTY_LABELS[preview.difficulty]?.label || `Сложность ${preview.difficulty}`} size="small" color={DIFFICULTY_LABELS[preview.difficulty]?.color} />}
                {preview.curator && <Chip label={`Куратор: ${preview.curator}`} size="small" />}
                {Array.isArray(preview.briefing) && preview.briefing.length > 0 && <Chip label={`Брифинг: ${preview.briefing.length} блок(а)`} size="small" />}
                {Array.isArray(preview.evidence) && preview.evidence.length > 0 && <Chip label={`Улики: ${preview.evidence.length}`} size="small" />}
              </Box>
              {preview.task && (
                <Box sx={{ borderLeft: 3, borderColor: 'primary.main', pl: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Задание</Typography>
                  <Typography variant="body2">{preview.task}</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose}>Отмена</Button>
        {!preview ? (
          <Button onClick={generate} variant="contained" color="info" disabled={loading || !idea.trim()}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <AiIcon sx={{ fontSize: 16 }} />}>
            {loading ? 'Генерирую...' : 'Сгенерировать'}
          </Button>
        ) : (
          <>
            <Button onClick={generate} disabled={loading} color="info"
              startIcon={loading ? <CircularProgress size={13} color="inherit" /> : <AiIcon sx={{ fontSize: 14 }} />}>
              Перегенерировать
            </Button>
            <Button onClick={() => { if (preview) onDraft(preview); }} variant="contained"
              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}>
              Создать дело
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
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

// ─── Теория по модулям ──────────────────────────────────────────────────────
// Один текст на модуль (1-9, то же поле, что и у дел) — попадает в материалы
// каждого дела модуля в Kodex Player. Форматирование — просто текст с блоками
// кода в ```тройных бэктиках```, без markdown-разметки (см. серверную сторону).
const MODULE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const ModuleTheoryPanel: React.FC = () => {
  const [items, setItems] = useState<Record<number, KodexModuleTheory>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { title: string; content_md: string }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await kodexModuleTheoryApi.list();
      const byModule: Record<number, KodexModuleTheory> = {};
      list.forEach((t) => { byModule[t.module] = t; });
      setItems(byModule);
    } catch {
      setToast({ msg: 'Ошибка загрузки теории', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftFor = (module: number) => drafts[module] ?? { title: items[module]?.title ?? '', content_md: items[module]?.content_md ?? '' };

  const openModule = (module: number) => {
    if (open === module) { setOpen(null); return; }
    setOpen(module);
    setDrafts((prev) => prev[module] ? prev : { ...prev, [module]: { title: items[module]?.title ?? '', content_md: items[module]?.content_md ?? '' } });
  };

  const updDraft = (module: number, field: 'title' | 'content_md', value: string) => {
    setDrafts((prev) => ({ ...prev, [module]: { ...draftFor(module), [field]: value } }));
  };

  const save = async (module: number) => {
    setSaving(module);
    try {
      const result = await kodexModuleTheoryApi.save(module, draftFor(module));
      setItems((prev) => ({ ...prev, [module]: result }));
      setToast(result.synced === false
        ? { msg: 'Сохранено, но не отправлено на Кодэкс — попробуйте ещё раз позже', sev: 'warning' }
        : { msg: 'Сохранено и отправлено на Кодэкс', sev: 'success' });
    } catch {
      setToast({ msg: 'Ошибка сохранения', sev: 'error' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress size={28} /></Box>;
  }

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Теория по модулям</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Один конспект на учебный модуль — появится в материалах каждого дела этого модуля в Кодэкс.
        Изображения можно вставить через Ctrl+V или кнопкой на панели инструментов — в Кодэксе
        покажутся текст, код и картинки; таблицы, цвет и шрифт там не отображаются.
      </Typography>
      {MODULE_NUMBERS.map((module) => {
        const isOpen = open === module;
        const item = items[module];
        const draft = draftFor(module);
        return (
          <Paper key={module} variant="outlined" sx={{ mb: 1.5, overflow: 'hidden', borderColor: isOpen ? 'primary.main' : 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none', bgcolor: isOpen ? 'action.selected' : 'background.paper' }}
              onClick={() => openModule(module)}>
              <Chip label={`Модуль ${module}`} size="small" color="primary" variant="outlined" sx={{ mr: 1.5 }} />
              <Typography sx={{ flex: 1, fontSize: 13, color: item?.title ? 'text.primary' : 'text.disabled', fontStyle: item?.title ? 'normal' : 'italic' }}>
                {item?.title || '— теория не заполнена —'}
              </Typography>
              {isOpen ? <ExpandLessIcon color="action" sx={{ fontSize: 18 }} /> : <ExpandMoreIcon color="action" sx={{ fontSize: 18 }} />}
            </Box>
            {isOpen && (
              <Box sx={{ px: 2, pb: 2.5, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Заголовок" value={draft.title} onChange={(e) => updDraft(module, 'title', e.target.value)}
                  size="small" fullWidth placeholder="Например: Переменные и вывод на экран" />
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <NotesEditor
                    value={draft.content_md}
                    onChange={(html) => updDraft(module, 'content_md', html)}
                    placeholder="Текст теории — вставьте конспект с картинками (Ctrl+V) или начните писать..."
                    onUploadImage={(file) => mediaApi.uploadImage(file).then((r) => r.url)}
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="contained" startIcon={<SaveIcon />} disabled={saving === module} onClick={() => save(module)}>
                    {saving === module ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </Box>
              </Box>
            )}
          </Paper>
        );
      })}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
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
  const [aiDialog, setAiDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cases' | 'theory'>('cases');

  const loadCases = useCallback(async () => {
    setLoading(true);
    try { setCases(await kodexExternalApi.list()); }
    catch { setToast({ msg: 'Ошибка загрузки дел', sev: 'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCases(); }, [loadCases]);

  const openCase = async (slug: string) => {
    setViewMode('cases');
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
          <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button fullWidth variant={viewMode === 'theory' ? 'contained' : 'outlined'} color="secondary"
              startIcon={<MenuBookIcon />} onClick={() => setViewMode(viewMode === 'theory' ? 'cases' : 'theory')}>
              Теория по модулям
            </Button>
            <Button fullWidth variant="outlined" color="info" startIcon={<AiIcon />} onClick={() => setAiDialog(true)}>
              AI Черновик
            </Button>
            <Button fullWidth variant="outlined" onClick={() => setImportDialog(true)}>
              Импорт JSON
            </Button>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setNewDialog(true)}>
              Новое дело
            </Button>
          </Box>
        </Box>

        {/* ── Правая панель: редактор ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
          {viewMode === 'theory' ? (
            <ModuleTheoryPanel />
          ) : !editing ? (
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
                      <EvidenceEditor items={editing.evidence || []} onChange={(v) => patch('evidence', v)}
                        testMode={(editing.fn_name || '').trim() ? 'function' : 'script'} />
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

      <AiDraftDialog open={aiDialog} onClose={() => setAiDialog(false)} onDraft={createCase} />
      <ImportJsonDialog open={importDialog} onClose={() => setImportDialog(false)} onImport={createCase} />
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
