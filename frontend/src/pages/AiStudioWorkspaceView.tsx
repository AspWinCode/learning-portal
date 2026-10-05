import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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

// ─── Новый материал: карточка шаблона + динамическая форма по input_schema_json ──

const NewContentTab: React.FC<{ workspaceCode: string; canGenerate: boolean; onGenerated: () => void }> = ({
  workspaceCode,
  canGenerate,
  onGenerated,
}) => {
  const [templates, setTemplates] = useState<aiStudio.ContentTemplate[] | null>(null);
  const [selected, setSelected] = useState<aiStudio.ContentTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<aiStudio.GeneratedContent | null>(null);

  useEffect(() => {
    setSelected(null);
    setResult(null);
    aiStudio.listTemplates(workspaceCode).then(setTemplates).catch(() => setTemplates([]));
  }, [workspaceCode]);

  const openTemplate = (tpl: aiStudio.ContentTemplate) => {
    setSelected(tpl);
    setValues({});
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const content = await aiStudio.generateContent(workspaceCode, selected.code, values);
      setResult(content);
      onGenerated();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  if (!templates) return <CircularProgress size={24} />;

  if (!selected) {
    return (
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {templates.map((tpl) => (
          <Card key={tpl.code} sx={{ width: 220 }}>
            <CardActionArea onClick={() => openTemplate(tpl)} disabled={!canGenerate}>
              <CardContent>
                <Typography variant="subtitle1">{tpl.name}</Typography>
                {tpl.description && (
                  <Typography variant="body2" color="text.secondary">
                    {tpl.description}
                  </Typography>
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
        {templates.length === 0 && <Alert severity="info">Для этого направления пока нет шаблонов.</Alert>}
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">{selected.name}</Typography>
        <Button size="small" onClick={() => setSelected(null)}>
          ← к шаблонам
        </Button>
      </Stack>
      {(selected.input_schema_json?.fields || []).map((field) => (
        <Box key={field.key}>
          {field.type === 'select' ? (
            <FormControl fullWidth size="small">
              <InputLabel id={`field-${field.key}`}>{field.label}</InputLabel>
              <Select
                labelId={`field-${field.key}`}
                label={field.label}
                value={values[field.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              >
                {(field.options || []).map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <TextField
              fullWidth
              size="small"
              label={field.label + (field.required ? ' *' : '')}
              value={values[field.key] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              multiline={field.key === 'topic' || field.key === 'facts'}
              minRows={field.key === 'topic' || field.key === 'facts' ? 2 : 1}
            />
          )}
        </Box>
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" onClick={submit} disabled={loading || !canGenerate}>
        {loading ? 'Генерация…' : 'Сгенерировать'}
      </Button>
      {result && (
        <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap' }}>
          {result.output_text}
        </Paper>
      )}
    </Stack>
  );
};

// ─── Черновики: история генераций + быстрые AI-действия ──────────────────

const VARIANT_CHANNELS = ['vk', 'telegram', 'site', 'email', 'short'];

const DraftsTab: React.FC<{ workspaceCode: string; canGenerate: boolean; canManage: boolean; reloadKey: number }> = ({
  workspaceCode,
  canGenerate,
  canManage,
  reloadKey,
}) => {
  const [items, setItems] = useState<aiStudio.GeneratedContent[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantChannel, setVariantChannel] = useState<Record<number, string>>({});

  const reload = () => aiStudio.listContent(workspaceCode).then((r) => setItems(r.items)).catch(() => setItems([]));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCode, reloadKey]);

  const runTransform = async (id: number, action: aiStudio.TransformAction) => {
    setBusyId(id);
    setError(null);
    try {
      await aiStudio.transformContent(id, action);
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  const runVariant = async (id: number) => {
    const channel = variantChannel[id];
    if (!channel) return;
    setBusyId(id);
    setError(null);
    try {
      await aiStudio.createContentVariant(id, channel);
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (id: number, status: 'approved' | 'archived') => {
    await aiStudio.updateContent(id, { status });
    await reload();
  };

  if (!items) return <CircularProgress size={24} />;
  if (items.length === 0) return <Alert severity="info">Пока нет черновиков — создайте материал на вкладке «Новый материал».</Alert>;

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {items.map((item) => (
        <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1">{item.title || `#${item.id}`}</Typography>
              {item.channel && <Chip size="small" variant="outlined" label={item.channel} />}
            </Stack>
            <Chip
              size="small"
              label={item.status}
              color={item.status === 'approved' ? 'success' : item.status === 'archived' ? 'default' : 'warning'}
            />
          </Stack>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
            {item.output_text}
          </Typography>
          {canGenerate && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              {(Object.keys(aiStudio.TRANSFORM_ACTION_LABELS) as aiStudio.TransformAction[]).map((action) => (
                <Chip
                  key={action}
                  size="small"
                  variant="outlined"
                  clickable
                  disabled={busyId === item.id}
                  label={aiStudio.TRANSFORM_ACTION_LABELS[action]}
                  onClick={() => runTransform(item.id, action)}
                />
              ))}
            </Stack>
          )}
          {canGenerate && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id={`variant-channel-${item.id}`}>Версия для канала</InputLabel>
                <Select
                  labelId={`variant-channel-${item.id}`}
                  label="Версия для канала"
                  value={variantChannel[item.id] || ''}
                  onChange={(e) => setVariantChannel((v) => ({ ...v, [item.id]: e.target.value }))}
                >
                  {VARIANT_CHANNELS.map((ch) => (
                    <MenuItem key={ch} value={ch}>
                      {ch}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button size="small" disabled={!variantChannel[item.id] || busyId === item.id} onClick={() => runVariant(item.id)}>
                Сделать версию
              </Button>
            </Stack>
          )}
          {canManage && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" onClick={() => setStatus(item.id, 'approved')} disabled={item.status === 'approved'}>
                Одобрить
              </Button>
              <Button size="small" onClick={() => setStatus(item.id, 'archived')} disabled={item.status === 'archived'}>
                Архивировать
              </Button>
            </Stack>
          )}
        </Paper>
      ))}
    </Stack>
  );
};

// ─── База знаний направления ──────────────────────────────────────────────

const KnowledgeTab: React.FC<{ workspaceCode: string; canManage: boolean }> = ({ workspaceCode, canManage }) => {
  const [items, setItems] = useState<aiStudio.KnowledgeItem[] | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Stack spacing={2}>
      {canManage && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <TextField size="small" label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField
              size="small"
              label="Содержание"
              multiline
              minRows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
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

// ─── Настройки направления: бренд-профиль ─────────────────────────────────

const SettingsTab: React.FC<{ workspaceCode: string; canManage: boolean }> = ({ workspaceCode, canManage }) => {
  const [workspace, setWorkspace] = useState<aiStudio.Workspace | null>(null);
  const [fields, setFields] = useState<aiStudio.BrandContextField[]>([]);
  const [brand, setBrand] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiStudio.getWorkspace(workspaceCode).then((w) => {
      setWorkspace(w);
      setBrand(w.brand_context || {});
    }).catch(() => undefined);
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
        Эти поля AI подмешивает в промпт всегда — чтобы не писать общие тексты, а держать позиционирование направления.
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

// ─── Пакет по событию («Создать материалы по событию», п.12 ТЗ) ───────────

const EVENT_PACK_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: 'event_name', label: 'Название события' },
  { key: 'date', label: 'Дата' },
  { key: 'location', label: 'Место' },
  { key: 'participants_count', label: 'Количество участников' },
  { key: 'results', label: 'Результаты', multiline: true },
  { key: 'winners', label: 'Победители' },
  { key: 'key_facts', label: 'Важные факты', multiline: true },
  { key: 'partners', label: 'Партнёры' },
  { key: 'links_photo_description', label: 'Ссылки / описание фото', multiline: true },
];

const EventPackTab: React.FC<{ workspaceCode: string; canGenerate: boolean; onGenerated: () => void }> = ({
  workspaceCode,
  canGenerate,
  onGenerated,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<aiStudio.EventPackResult | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const pack = await aiStudio.createEventPack(workspaceCode, values);
      setResult(pack);
      onGenerated();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary">
        Один запуск создаёт сразу пакет материалов (VK, Telegram, короткий пост, новость на сайт, благодарность
        партнёрам, текст для родителей, подпись к фото, промпт для обложки) — все факты берутся только из того, что
        вы укажете ниже.
      </Typography>
      {EVENT_PACK_FIELDS.map((f) => (
        <TextField
          key={f.key}
          size="small"
          label={f.label}
          value={values[f.key] || ''}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          multiline={f.multiline}
          minRows={f.multiline ? 2 : 1}
        />
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" onClick={submit} disabled={loading || !canGenerate || !values.event_name}>
        {loading ? 'Генерация…' : 'Создать пакет материалов'}
      </Button>
      {result && (
        <Stack spacing={1}>
          <Alert severity="success">Создано материалов: {result.items.length}</Alert>
          {result.items.map((item) => (
            <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">{item.title}</Typography>
                {item.channel && <Chip size="small" variant="outlined" label={item.channel} />}
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                {item.output_text}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

// ─── Контент-план (п.11 ТЗ) ────────────────────────────────────────────────

const PLAN_ITEM_STATUS_COLOR: Record<aiStudio.ContentPlanItemStatus, 'default' | 'warning' | 'info' | 'success'> = {
  idea: 'default',
  draft: 'warning',
  ready: 'info',
  published: 'success',
  skipped: 'default',
};

const ContentPlanTab: React.FC<{ workspaceCode: string; canGenerate: boolean; canManage: boolean }> = ({
  workspaceCode,
  canGenerate,
  canManage,
}) => {
  const [plans, setPlans] = useState<aiStudio.ContentPlan[] | null>(null);
  const [activePlan, setActivePlan] = useState<aiStudio.ContentPlan | null>(null);
  const [newPlanName, setNewPlanName] = useState('');
  const [genCount, setGenCount] = useState(10);
  const [genChannels, setGenChannels] = useState('vk,telegram');
  const [genGoals, setGenGoals] = useState('');
  const [genEvents, setGenEvents] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadPlans = () => aiStudio.listContentPlans(workspaceCode).then(setPlans).catch(() => setPlans([]));

  useEffect(() => {
    reloadPlans();
    setActivePlan(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCode]);

  const openPlan = (plan: aiStudio.ContentPlan) => {
    aiStudio.getContentPlan(workspaceCode, plan.id).then(setActivePlan).catch(() => undefined);
  };

  const createPlan = async () => {
    if (!newPlanName.trim()) return;
    try {
      const plan = await aiStudio.createContentPlan(workspaceCode, { name: newPlanName.trim() });
      setNewPlanName('');
      await reloadPlans();
      openPlan(plan);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  const generateItems = async () => {
    if (!activePlan) return;
    setLoading(true);
    setError(null);
    try {
      await aiStudio.generateContentPlanItems(workspaceCode, activePlan.id, {
        count: genCount,
        channels: genChannels.split(',').map((c) => c.trim()).filter(Boolean),
        goals: genGoals || undefined,
        important_events: genEvents || undefined,
      });
      const refreshed = await aiStudio.getContentPlan(workspaceCode, activePlan.id);
      setActivePlan(refreshed);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const setItemStatus = async (itemId: number, status: aiStudio.ContentPlanItemStatus) => {
    if (!activePlan) return;
    await aiStudio.updateContentPlanItem(itemId, { status });
    const refreshed = await aiStudio.getContentPlan(workspaceCode, activePlan.id);
    setActivePlan(refreshed);
  };

  const removeItem = async (itemId: number) => {
    if (!activePlan) return;
    await aiStudio.deleteContentPlanItem(itemId);
    const refreshed = await aiStudio.getContentPlan(workspaceCode, activePlan.id);
    setActivePlan(refreshed);
  };

  if (activePlan) {
    return (
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">{activePlan.name}</Typography>
          <Button size="small" onClick={() => setActivePlan(null)}>
            ← к списку планов
          </Button>
        </Stack>
        {canGenerate && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1} sx={{ maxWidth: 480 }}>
              <Typography variant="subtitle2">Заполнить план с помощью AI</Typography>
              <TextField
                size="small"
                type="number"
                label="Количество публикаций"
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value) || 1)}
              />
              <TextField size="small" label="Каналы (через запятую)" value={genChannels} onChange={(e) => setGenChannels(e.target.value)} />
              <TextField size="small" label="Цели" value={genGoals} onChange={(e) => setGenGoals(e.target.value)} />
              <TextField size="small" label="Важные события в периоде" value={genEvents} onChange={(e) => setGenEvents(e.target.value)} />
              {error && <Alert severity="error">{error}</Alert>}
              <Button variant="contained" onClick={generateItems} disabled={loading}>
                {loading ? 'Генерация…' : 'Сгенерировать пункты плана'}
              </Button>
            </Stack>
          </Paper>
        )}
        {activePlan.items.length === 0 && <Alert severity="info">В плане пока нет пунктов.</Alert>}
        {activePlan.items.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">{item.title}</Typography>
                {item.channel && <Chip size="small" variant="outlined" label={item.channel} />}
                {item.publish_date && <Chip size="small" variant="outlined" label={item.publish_date} />}
              </Stack>
              <Chip size="small" label={item.status} color={PLAN_ITEM_STATUS_COLOR[item.status]} />
            </Stack>
            {item.brief && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {item.brief}
              </Typography>
            )}
            {canManage && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                {(['idea', 'draft', 'ready', 'published', 'skipped'] as aiStudio.ContentPlanItemStatus[]).map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    variant={item.status === s ? 'filled' : 'outlined'}
                    clickable
                    label={s}
                    onClick={() => setItemStatus(item.id, s)}
                  />
                ))}
                <Button size="small" color="error" onClick={() => removeItem(item.id)}>
                  Удалить
                </Button>
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {canGenerate && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Название плана" value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} fullWidth />
            <Button variant="contained" onClick={createPlan} disabled={!newPlanName.trim()}>
              Создать план
            </Button>
          </Stack>
        </Paper>
      )}
      {!plans && <CircularProgress size={24} />}
      {plans && plans.length === 0 && <Alert severity="info">Пока нет контент-планов.</Alert>}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {plans?.map((plan) => (
          <Card key={plan.id} sx={{ width: 240 }}>
            <CardActionArea onClick={() => openPlan(plan)}>
              <CardContent>
                <Typography variant="subtitle1">{plan.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {plan.date_from || '—'} — {plan.date_to || '—'} · {plan.items.length} пункт(ов)
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};

const AiStudioWorkspaceView: React.FC<Props> = ({ workspaceCode }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const canGenerate = hasPermission(user, 'ai_studio.generate');
  const canManageKnowledge = hasPermission(user, 'ai_studio.manage_knowledge');
  const canManageContent = hasPermission(user, 'ai_studio.manage_content');
  const canManageWorkspace = hasPermission(user, 'ai_studio.manage_workspace');

  const tabs = useMemo(
    () => [
      {
        label: 'Новый материал',
        node: (
          <NewContentTab
            workspaceCode={workspaceCode}
            canGenerate={canGenerate}
            onGenerated={() => setReloadKey((k) => k + 1)}
          />
        ),
      },
      {
        label: 'Черновики',
        node: (
          <DraftsTab
            workspaceCode={workspaceCode}
            canGenerate={canGenerate}
            canManage={canManageContent}
            reloadKey={reloadKey}
          />
        ),
      },
      {
        label: 'Пакет по событию',
        node: (
          <EventPackTab workspaceCode={workspaceCode} canGenerate={canGenerate} onGenerated={() => setReloadKey((k) => k + 1)} />
        ),
      },
      {
        label: 'Контент-план',
        node: <ContentPlanTab workspaceCode={workspaceCode} canGenerate={canGenerate} canManage={canManageContent} />,
      },
      { label: 'База знаний', node: <KnowledgeTab workspaceCode={workspaceCode} canManage={canManageKnowledge} /> },
      { label: 'Настройки направления', node: <SettingsTab workspaceCode={workspaceCode} canManage={canManageWorkspace} /> },
    ],
    [workspaceCode, canGenerate, canManageContent, canManageKnowledge, canManageWorkspace, reloadKey]
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
