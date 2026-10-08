import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';
import * as aiStudio from '../services/aiStudioApi';

interface Props {
  workspaceCode: string;
}

// ─── Консультант: спросить/проанализировать направление ────────────────────

const ConsultTab: React.FC<{ workspaceCode: string }> = ({ workspaceCode }) => {
  const [dialogs, setDialogs] = useState<aiStudio.Dialog[]>([]);
  const [activeDialog, setActiveDialog] = useState<aiStudio.DialogDetail | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const reloadDialogs = () => aiStudio.listDialogs(workspaceCode).then(setDialogs).catch(() => setDialogs([]));

  useEffect(() => {
    reloadDialogs();
    setActiveDialog(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeDialog?.messages.length]);

  const openDialog = (id: number) => {
    aiStudio.getDialog(workspaceCode, id).then(setActiveDialog).catch(() => undefined);
  };

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      await aiStudio.consult(workspaceCode, text, activeDialog?.id);
      setMessage('');
      const dialogId = activeDialog?.id;
      await reloadDialogs();
      if (dialogId) {
        await aiStudio.getDialog(workspaceCode, dialogId).then(setActiveDialog);
      } else {
        const refreshed = await aiStudio.listDialogs(workspaceCode);
        if (refreshed.length) await aiStudio.getDialog(workspaceCode, refreshed[0].id).then(setActiveDialog);
      }
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack direction="row" spacing={2} sx={{ minHeight: 420 }}>
      <Paper variant="outlined" sx={{ width: 220, p: 1, overflowY: 'auto' }}>
        <Button size="small" fullWidth onClick={() => setActiveDialog(null)} sx={{ mb: 1 }}>
          + Новый диалог
        </Button>
        <List dense>
          {dialogs.map((d) => (
            <ListItemButton key={d.id} selected={activeDialog?.id === d.id} onClick={() => openDialog(d.id)}>
              <ListItemText primary={d.title || `Диалог #${d.id}`} primaryTypographyProps={{ noWrap: true }} />
            </ListItemButton>
          ))}
          {dialogs.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
              Пока нет диалогов.
            </Typography>
          )}
        </List>
      </Paper>
      <Stack sx={{ flex: 1 }} spacing={1}>
        <Paper variant="outlined" sx={{ flex: 1, p: 2, overflowY: 'auto', maxHeight: 420, minHeight: 320 }}>
          {!activeDialog && (
            <Typography variant="body2" color="text.secondary">
              Задайте вопрос — например «проанализируй сильные и слабые стороны направления» или «какие темы контента
              лучше заходят судя по базе знаний».
            </Typography>
          )}
          {activeDialog?.messages.map((m) => (
            <Box key={m.id} sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {m.role === 'user' ? 'Вы' : 'Консультант'}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {m.content}
              </Typography>
              {!!m.used_knowledge?.length && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                  {m.used_knowledge.map((title) => (
                    <Chip key={title} size="small" variant="outlined" label={title} />
                  ))}
                </Stack>
              )}
            </Box>
          ))}
          <div ref={bottomRef} />
        </Paper>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            placeholder="Спросите что-нибудь о направлении…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            multiline
            maxRows={4}
          />
          <Button variant="contained" onClick={send} disabled={sending || !message.trim()}>
            {sending ? <CircularProgress size={20} /> : 'Отправить'}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
};

// ─── База знаний направления ────────────────────────────────────────────────

const KnowledgeTab: React.FC<{ workspaceCode: string; canManage: boolean }> = ({ workspaceCode, canManage }) => {
  const [items, setItems] = useState<aiStudio.KnowledgeItem[] | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const reload = () => aiStudio.listKnowledge(workspaceCode).then((r) => setItems(r.items)).catch(() => setItems([]));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCode]);

  const add = async () => {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    try {
      await aiStudio.createKnowledge(workspaceCode, { title, content });
      setTitle('');
      setContent('');
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  const remove = async (id: number) => {
    await aiStudio.deleteKnowledge(workspaceCode, id);
    await reload();
  };

  const reindex = async () => {
    setReindexResult(null);
    try {
      const r = await aiStudio.reindexKnowledge(workspaceCode);
      setReindexResult(`Переиндексировано: ${r.indexed} (${r.backend}${r.reason ? ', ' + r.reason : ''})`);
    } catch (e) {
      setReindexResult(extractApiError(e, 'Ошибка'));
    }
  };

  return (
    <Stack spacing={2}>
      {canManage && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">Добавить запись</Typography>
              <Button size="small" onClick={reindex}>
                Переиндексировать эмбеддинги
              </Button>
            </Stack>
            {reindexResult && <Alert severity="info">{reindexResult}</Alert>}
            <TextField size="small" label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField size="small" label="Содержание" multiline minRows={3} value={content} onChange={(e) => setContent(e.target.value)} />
            {error && <Alert severity="error">{error}</Alert>}
            <Button variant="contained" onClick={add} disabled={!title.trim() || !content.trim()}>
              Добавить
            </Button>
          </Stack>
        </Paper>
      )}
      {!items && <CircularProgress size={24} />}
      {items && items.length === 0 && <Alert severity="info">База знаний направления пока пуста.</Alert>}
      {items?.map((item) => (
        <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="subtitle2">{item.title}</Typography>
            {canManage && (
              <Button size="small" color="error" onClick={() => remove(item.id)}>
                Удалить
              </Button>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {item.content}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
};

// ─── Настройки направления: бренд-профиль ──────────────────────────────────

const SettingsTab: React.FC<{ workspaceCode: string; canManage: boolean }> = ({ workspaceCode, canManage }) => {
  const [workspace, setWorkspace] = useState<aiStudio.Workspace | null>(null);
  const [fields, setFields] = useState<aiStudio.BrandContextField[]>([]);
  const [brand, setBrand] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiStudio
      .getWorkspace(workspaceCode)
      .then((w) => {
        setWorkspace(w);
        setBrand(w.brand_context || {});
      })
      .catch(() => undefined);
    aiStudio.getBrandContextFields().then(setFields).catch(() => setFields([]));
  }, [workspaceCode]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await aiStudio.updateWorkspace(workspaceCode, { brand_context: brand });
      setSaved(true);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  if (!workspace) return <CircularProgress size={24} />;

  if (!canManage) {
    return <Alert severity="info">Редактирование бренд-профиля доступно с правом ai_studio.manage_workspace.</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary">
        Эти поля AI подмешивает в контекст консультации всегда — чтобы ответы учитывали позиционирование направления.
      </Typography>
      {fields.map((f) => (
        <TextField
          key={f.key}
          size="small"
          label={f.label}
          value={brand[f.key] || ''}
          onChange={(e) => setBrand((b) => ({ ...b, [f.key]: e.target.value }))}
          multiline
          minRows={1}
        />
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Сохранено</Alert>}
      <Button variant="contained" onClick={save}>
        Сохранить
      </Button>
    </Stack>
  );
};

// ─── Аналитика направления ──────────────────────────────────────────────────

const AnalyticsTab: React.FC<{ workspaceCode: string }> = ({ workspaceCode }) => {
  const [data, setData] = useState<aiStudio.WorkspaceAnalytics | null>(null);

  useEffect(() => {
    aiStudio.getWorkspaceAnalytics(workspaceCode).then(setData).catch(() => setData(null));
  }, [workspaceCode]);

  if (!data) return <CircularProgress size={24} />;

  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">Расход AI Tunnel по направлению</Typography>
          <Typography variant="body2">Вызовов всего: {data.ai_calls_total}</Typography>
          <Typography variant="body2">Из них с ошибкой: {data.ai_calls_error}</Typography>
          <Typography variant="body2">Токенов использовано: {data.ai_tokens_total}</Typography>
          <Typography variant="body2">Оценочная стоимость: ${data.ai_cost_usd_total.toFixed(4)}</Typography>
          <Typography variant="body2">Диалогов: {data.dialogs_total}</Typography>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2">Активных записей в базе знаний: {data.knowledge_items_active}</Typography>
      </Paper>
    </Stack>
  );
};

const AiStudioWorkspaceView: React.FC<Props> = ({ workspaceCode }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  const canManageKnowledge = hasPermission(user, 'ai_studio.manage_knowledge');
  const canManageWorkspace = hasPermission(user, 'ai_studio.manage_workspace');

  const tabs = useMemo(
    () => [
      { label: 'Консультант', node: <ConsultTab workspaceCode={workspaceCode} /> },
      { label: 'База знаний', node: <KnowledgeTab workspaceCode={workspaceCode} canManage={canManageKnowledge} /> },
      { label: 'Аналитика', node: <AnalyticsTab workspaceCode={workspaceCode} /> },
      { label: 'Настройки направления', node: <SettingsTab workspaceCode={workspaceCode} canManage={canManageWorkspace} /> },
    ],
    [workspaceCode, canManageKnowledge, canManageWorkspace]
  );

  return (
    <Paper variant="outlined">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {tabs.map((t) => (
          <Tab key={t.label} label={t.label} />
        ))}
      </Tabs>
      <Divider />
      <Box sx={{ p: 2 }}>{tabs[tab].node}</Box>
    </Paper>
  );
};

export default AiStudioWorkspaceView;
