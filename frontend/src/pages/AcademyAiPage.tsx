import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import Layout from '../components/Layout';
import { extractApiError } from '../utils/extractApiError';
import * as academyAi from '../services/academyAiApi';

const SECTION_LABELS: Record<string, string> = {
  niche: 'Ниша и продукты',
  finance: 'Финансы',
  marketing: 'Маркетинг',
  sales: 'Продажи',
  clients: 'Клиенты и удержание',
  team: 'Команда',
};

const CONTENT_KIND_LABELS: Record<academyAi.ContentKind, string> = {
  post: 'Пост для соцсетей',
  summary: 'Выжимка услуги',
  image_prompt: 'Промпт для картинки',
  newsletter: 'Текст рассылки',
  script: 'Сценарий видео/сторис',
};

const DRAFT_STATUS_LABELS: Record<academyAi.DraftStatus, string> = {
  draft: 'Черновик',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  published: 'Опубликован',
};

function useToast() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return { error, setError, message, setMessage };
}

// ─── Консультант ───────────────────────────────────────────────────────────

const ConsultTab: React.FC = () => {
  const { error, setError } = useToast();
  const [messages, setMessages] = useState<academyAi.DialogMessage[]>([]);
  const [dialogId, setDialogId] = useState<number | undefined>();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', content: text, used_sources: null, created_at: null },
    ]);
    setInput('');
    try {
      const res = await academyAi.consult(text, dialogId);
      setDialogId(res.dialog_id);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: res.answer,
          used_sources: res.used_sources,
          created_at: null,
        },
      ]);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось получить ответ консультанта'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, minHeight: 320, maxHeight: 480, overflowY: 'auto' }}>
        {messages.length === 0 && (
          <Typography color="text.secondary">
            Задайте вопрос по управлению академией — консультант ответит, опираясь на методику,
            базу знаний и данные LMS.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {messages.map((m) => (
            <Box
              key={m.id}
              sx={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                bgcolor: m.role === 'user' ? 'primary.main' : 'grey.100',
                color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                whiteSpace: 'pre-wrap',
              }}
            >
              <Typography variant="body2">{m.content}</Typography>
              {m.used_sources && Object.keys(m.used_sources).length > 0 && (
                <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mt: 0.5 }}>
                  {JSON.stringify(m.used_sources)}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
        <div ref={endRef} />
      </Paper>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Ваш вопрос…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <Button variant="contained" endIcon={sending ? <CircularProgress size={16} /> : <SendIcon />} onClick={sendMessage} disabled={sending}>
          Отправить
        </Button>
      </Stack>
    </Stack>
  );
};

// ─── База знаний ───────────────────────────────────────────────────────────

const KnowledgeTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [entries, setEntries] = useState<academyAi.KbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [section, setSection] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await academyAi.listKbEntries({ limit: 100 });
      setEntries(data.items);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить базу знаний'));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const addFact = async () => {
    if (!title.trim()) return;
    try {
      await academyAi.createKbEntry({ kind: 'fact', title: title.trim(), body_text: body.trim() || null, section: section || null });
      setTitle('');
      setBody('');
      setSection('');
      setMessage('Запись добавлена');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось добавить запись'));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await academyAi.uploadKbFile(file, { section: section || undefined });
      setMessage('Файл загружен');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить файл'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const enrich = async (id: number) => {
    try {
      await academyAi.enrichKbEntry(id);
      setMessage('Обогащение запущено');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось обогатить запись'));
    }
  };

  const archive = async (id: number) => {
    if (!window.confirm('Архивировать запись?')) return;
    try {
      await academyAi.archiveKbEntry(id);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось архивировать'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Добавить факт / заметку
        </Typography>
        <Stack spacing={1}>
          <TextField size="small" label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField size="small" label="Текст" multiline minRows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <TextField select size="small" label="Раздел" value={section} onChange={(e) => setSection(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">—</MenuItem>
              {Object.entries(SECTION_LABELS).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </TextField>
            <Button variant="contained" onClick={addFact}>Добавить</Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
              Загрузить файл
            </Button>
            <input ref={fileRef} type="file" hidden onChange={onFile} />
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <CircularProgress />
      ) : (
        <Stack spacing={1}>
          {entries.map((entry) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="subtitle2">{entry.title}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ my: 0.5 }}>
                    <Chip size="small" label={entry.kind} />
                    {entry.section && <Chip size="small" label={SECTION_LABELS[entry.section] || entry.section} />}
                    {(entry.tags || []).map((t) => (
                      <Chip key={t} size="small" variant="outlined" label={t} />
                    ))}
                  </Stack>
                  {entry.body_text && <Typography variant="body2" color="text.secondary">{entry.body_text.slice(0, 240)}</Typography>}
                  {entry.ai_description && (
                    <Typography variant="caption" color="text.secondary">ИИ: {entry.ai_description}</Typography>
                  )}
                </Box>
                <Stack direction="row">
                  <Tooltip title="Обогатить через ИИ">
                    <IconButton size="small" onClick={() => enrich(entry.id)}><AutoAwesomeIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <IconButton size="small" onClick={() => archive(entry.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

// ─── Экспертиза ────────────────────────────────────────────────────────────

const ExpertiseTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [sources, setSources] = useState<academyAi.ExpertiseSource[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setSources(await academyAi.listExpertise());
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить библиотеку экспертизы'));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const addText = async () => {
    if (!title.trim() || !text.trim()) return;
    try {
      await academyAi.createTextExpertise({ title: title.trim(), text: text.trim() });
      setTitle('');
      setText('');
      setMessage('Источник добавлен');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось добавить источник'));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await academyAi.uploadExpertise(file);
      setMessage(`Загружено: ${res.chunks} фрагментов${res.ocr_used ? ' (OCR)' : ''}`);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить источник'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggle = async (s: academyAi.ExpertiseSource) => {
    try {
      await academyAi.setExpertiseStatus(s.id, s.status === 'active' ? 'disabled' : 'active');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось изменить статус'));
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Удалить источник?')) return;
    try {
      await academyAi.deleteExpertise(id);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось удалить'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Добавить источник экспертизы</Typography>
        <Stack spacing={1}>
          <TextField size="small" label="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField size="small" label="Текст (или загрузите файл)" multiline minRows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={addText}>Добавить текст</Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>
              Загрузить файл (PDF/EPUB/скан)
            </Button>
            <input ref={fileRef} type="file" hidden onChange={onFile} />
          </Stack>
        </Stack>
      </Paper>

      <Stack spacing={1}>
        {sources.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1.5, opacity: s.status === 'active' ? 1 : 0.55 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2">{s.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.type} · {s.chunk_count} фрагментов{s.ai_description ? ` · ${s.ai_description}` : ''}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => toggle(s)}>
                  {s.status === 'active' ? 'Отключить' : 'Включить'}
                </Button>
                <IconButton size="small" onClick={() => remove(s.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Аудит ─────────────────────────────────────────────────────────────────

const AuditTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [questions, setQuestions] = useState<academyAi.AuditQuestion[]>([]);
  const [session, setSession] = useState<academyAi.AuditSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    academyAi.listAuditQuestions().then(setQuestions).catch((err) => setError(extractApiError(err, 'Ошибка загрузки вопросов')));
  }, [setError]);

  const start = async () => {
    try {
      setSession(await academyAi.startAuditSession());
      setMessage('Сессия аудита создана');
    } catch (err) {
      setError(extractApiError(err, 'Не удалось начать аудит'));
    }
  };

  const saveAnswer = async (q: academyAi.AuditQuestion) => {
    if (!session || !answers[q.id]?.trim()) return;
    try {
      await academyAi.submitAuditAnswer(session.id, { question_id: q.id, section: q.section, answer_text: answers[q.id].trim() });
      setMessage(`Ответ сохранён: ${q.prompt.slice(0, 40)}…`);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить ответ'));
    }
  };

  const grouped = questions.reduce<Record<string, academyAi.AuditQuestion[]>>((acc, q) => {
    (acc[q.section] ||= []).push(q);
    return acc;
  }, {});

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {!session ? (
        <Button variant="contained" onClick={start}>Начать аудит</Button>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={`Сессия #${session.id}`} />
          <Button size="small" onClick={() => academyAi.completeAuditSession(session.id).then(() => setMessage('Аудит завершён'))}>
            Завершить
          </Button>
        </Stack>
      )}
      {Object.entries(grouped).map(([sec, qs]) => (
        <Paper key={sec} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>{SECTION_LABELS[sec] || sec}</Typography>
          <Stack spacing={1.5}>
            {qs.map((q) => (
              <Box key={q.id}>
                <Typography variant="body2">{q.prompt}</Typography>
                {q.hint && <Typography variant="caption" color="text.secondary">{q.hint}</Typography>}
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    disabled={!session}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                  <Button size="small" disabled={!session} onClick={() => saveAnswer(q)}>Сохранить</Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
};

// ─── Контент ───────────────────────────────────────────────────────────────

const ContentTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [kind, setKind] = useState<academyAi.ContentKind>('post');
  const [brief, setBrief] = useState('');
  const [direction, setDirection] = useState('');
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<academyAi.ContentDraft[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await academyAi.listDrafts();
      setDrafts(data.items);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить черновики'));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    if (!brief.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      await academyAi.generateContent({ kind, brief: brief.trim(), direction: direction || undefined });
      setBrief('');
      setMessage('Черновик создан');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сгенерировать контент'));
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (id: number, status: academyAi.DraftStatus) => {
    let feedback: string | undefined;
    if (status === 'rejected') {
      feedback = window.prompt('Что не так с черновиком? (по желанию)') || undefined;
    }
    try {
      await academyAi.setDraftStatus(id, status, feedback);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось изменить статус'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <TextField select size="small" label="Тип" value={kind} onChange={(e) => setKind(e.target.value as academyAi.ContentKind)} sx={{ minWidth: 220 }}>
              {Object.entries(CONTENT_KIND_LABELS).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Направление" value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="программирование / ОГЭ / ЕГЭ" />
          </Stack>
          <TextField size="small" label="Бриф" multiline minRows={2} value={brief} onChange={(e) => setBrief(e.target.value)} />
          <Button variant="contained" onClick={generate} disabled={generating} startIcon={generating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}>
            Сгенерировать черновик
          </Button>
        </Stack>
      </Paper>

      <Typography variant="subtitle2">Очередь черновиков</Typography>
      <Stack spacing={1}>
        {drafts.map((d) => (
          <Paper key={d.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                  <Chip size="small" label={CONTENT_KIND_LABELS[d.kind] || d.kind} />
                  <Chip size="small" color={d.status === 'draft' ? 'default' : d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'error' : 'info'} label={DRAFT_STATUS_LABELS[d.status]} />
                  {d.direction && <Chip size="small" variant="outlined" label={d.direction} />}
                </Stack>
                {d.title && <Typography variant="subtitle2">{d.title}</Typography>}
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{(d.body || '').slice(0, 400)}</Typography>
                {d.image_prompt && <Typography variant="caption" color="text.secondary">🖼 {d.image_prompt.slice(0, 160)}</Typography>}
                {d.feedback_note && <Typography variant="caption" color="error.main" display="block">Замечание: {d.feedback_note}</Typography>}
              </Box>
              {d.status === 'draft' && (
                <Stack spacing={0.5}>
                  <Button size="small" color="success" onClick={() => setStatus(d.id, 'approved')}>Одобрить</Button>
                  <Button size="small" color="error" onClick={() => setStatus(d.id, 'rejected')}>Отклонить</Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Расписание ────────────────────────────────────────────────────────────

const ScheduleTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [rules, setRules] = useState<academyAi.ScheduleRule[]>([]);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('0 9 * * 1,3,5');
  const [topics, setTopics] = useState('');

  const load = useCallback(async () => {
    try {
      setRules(await academyAi.listScheduleRules());
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить правила'));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await academyAi.createScheduleRule({
        name: name.trim(),
        cadence: cadence.trim(),
        topics: topics.split('\n').map((t) => t.trim()).filter(Boolean),
      });
      setName('');
      setTopics('');
      setMessage('Правило создано');
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось создать правило'));
    }
  };

  const runNow = async () => {
    try {
      const res = await academyAi.runScheduleNow();
      setMessage(`Сгенерировано черновиков: ${res.generated}`);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось запустить прогон'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Новое правило регулярных постов</Typography>
        <Stack spacing={1}>
          <TextField size="small" label="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField size="small" label="Периодичность (cron, 5 полей)" value={cadence} onChange={(e) => setCadence(e.target.value)} helperText="напр. 0 9 * * 1,3,5 — пн/ср/пт в 9:00" />
          <TextField size="small" label="Темы (по строке)" multiline minRows={2} value={topics} onChange={(e) => setTopics(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={create}>Создать</Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={runNow}>Прогнать сейчас</Button>
          </Stack>
        </Stack>
      </Paper>

      <Stack spacing={1}>
        {rules.map((r) => (
          <Paper key={r.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2">{r.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.cadence} · след. запуск: {r.next_run_at ? new Date(r.next_run_at).toLocaleString() : '—'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={r.is_active ? 'активно' : 'выкл'} color={r.is_active ? 'success' : 'default'} />
                <Button size="small" onClick={() => academyAi.updateScheduleRule(r.id, { is_active: !r.is_active }).then(load)}>
                  {r.is_active ? 'Выключить' : 'Включить'}
                </Button>
                <IconButton size="small" onClick={() => academyAi.deleteScheduleRule(r.id).then(load)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Подсказки ─────────────────────────────────────────────────────────────

const InsightsTab: React.FC = () => {
  const { error, setError, message, setMessage } = useToast();
  const [insights, setInsights] = useState<academyAi.Insight[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await academyAi.listInsights('open');
      setInsights(data.items);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить подсказки'));
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  const scan = async () => {
    try {
      const res = await academyAi.scanInsights();
      setMessage(`Новых: ${res.created.length}, закрыто: ${res.resolved.length}`);
      load();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось выполнить скан'));
    }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={scan}>Пересканировать</Button>
      </Box>
      {insights.length === 0 && <Typography color="text.secondary">Открытых подсказок нет.</Typography>}
      <Stack spacing={1}>
        {insights.map((i) => (
          <Alert
            key={i.id}
            severity={i.severity === 'warn' ? 'warning' : 'info'}
            action={<Button color="inherit" size="small" onClick={() => academyAi.dismissInsight(i.id).then(load)}>Скрыть</Button>}
          >
            <Typography variant="subtitle2">{i.title}</Typography>
            {i.body && <Typography variant="body2">{i.body}</Typography>}
          </Alert>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Страница ──────────────────────────────────────────────────────────────

const TABS = [
  { label: 'Консультант', component: <ConsultTab /> },
  { label: 'База знаний', component: <KnowledgeTab /> },
  { label: 'Экспертиза', component: <ExpertiseTab /> },
  { label: 'Аудит', component: <AuditTab /> },
  { label: 'Контент', component: <ContentTab /> },
  { label: 'Расписание', component: <ScheduleTab /> },
  { label: 'Подсказки', component: <InsightsTab /> },
];

const AcademyAiPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState<academyAi.AcademyModuleStatus | null>(null);

  useEffect(() => {
    academyAi.getStatus().then(setStatus).catch(() => undefined);
  }, []);

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          ИИ-консультант академии
        </Typography>
        {status && !status.enabled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Модуль выключен на бэкенде (ACADEMY_AI_ENABLED=0). Консультации и генерация недоступны, база знаний работает.
          </Alert>
        )}
        {status && status.enabled && !status.ai_gateway_configured && (
          <Alert severity="info" sx={{ mb: 2 }}>
            AI Tunnel не настроен — ответы консультанта и генерация работают в ограниченном режиме.
          </Alert>
        )}
        {status && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
            <Chip size="small" label={`Записей БЗ: ${status.kb_entries}`} />
            <Chip size="small" label={`Источников: ${status.expertise_sources}`} />
            <Chip size="small" label={`Поиск: ${status.search_backend}`} />
            <Chip size="small" label={`Черновиков: ${status.pending_drafts}`} />
            <Chip size="small" color={status.open_insights ? 'warning' : 'default'} label={`Подсказок: ${status.open_insights}`} />
          </Stack>
        )}
        <Paper variant="outlined">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {TABS.map((t) => (
              <Tab key={t.label} label={t.label} />
            ))}
          </Tabs>
          <Divider />
          <Box sx={{ p: 2 }}>{TABS[tab].component}</Box>
        </Paper>
      </Box>
    </Layout>
  );
};

export default AcademyAiPage;
