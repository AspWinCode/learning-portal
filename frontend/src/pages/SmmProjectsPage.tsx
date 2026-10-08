import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';
import * as smm from '../services/smmProjectsApi';

// ─── Новый материал ─────────────────────────────────────────────────────────

const NewContentTab: React.FC<{ projectCode: string; canGenerate: boolean; onGenerated: () => void }> = ({
  projectCode,
  canGenerate,
  onGenerated,
}) => {
  const [templates, setTemplates] = useState<smm.ContentTemplate[] | null>(null);
  const [selected, setSelected] = useState<smm.ContentTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<smm.GeneratedContent | null>(null);

  useEffect(() => {
    setSelected(null);
    setResult(null);
    smm.listTemplates(projectCode).then(setTemplates).catch(() => setTemplates([]));
  }, [projectCode]);

  const openTemplate = (tpl: smm.ContentTemplate) => {
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
      const content = await smm.generateContent(projectCode, selected.code, values);
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
        {templates.length === 0 && <Alert severity="info">В проекте пока нет шаблонов.</Alert>}
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

// ─── Черновики ──────────────────────────────────────────────────────────────

const DraftsTab: React.FC<{ projectCode: string; canGenerate: boolean; canManage: boolean; canPublish: boolean; reloadKey: number }> = ({
  projectCode,
  canGenerate,
  canManage,
  canPublish,
  reloadKey,
}) => {
  const [items, setItems] = useState<smm.GeneratedContent[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantChannel, setVariantChannel] = useState<Record<number, string>>({});
  const [publishChannels, setPublishChannels] = useState<smm.ChannelStatus[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Record<number, string[]>>({});
  const [scheduleAt, setScheduleAt] = useState<Record<number, string>>({});
  const [assetsByContent, setAssetsByContent] = useState<Record<number, smm.GeneratedAsset[]>>({});
  const [publications, setPublications] = useState<Record<number, smm.Publication[]>>({});

  const reload = () =>
    smm
      .listContent(projectCode)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));

  useEffect(() => {
    reload();
    smm.listChannels(projectCode).then(setPublishChannels).catch(() => setPublishChannels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, reloadKey]);

  const renderImage = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await smm.renderContentImage(id);
      const assets = await smm.listContentAssets(id);
      setAssetsByContent((a) => ({ ...a, [id]: assets }));
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  const runTransform = async (id: number, action: smm.TransformAction) => {
    setBusyId(id);
    setError(null);
    try {
      await smm.transformContent(id, action);
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
      await smm.createContentVariant(id, channel);
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (id: number, status: 'approved' | 'archived') => {
    if (status === 'approved') await smm.approveContent(id);
    else await smm.updateContent(id, { status });
    await reload();
  };

  const runPublish = async (id: number) => {
    const channels = selectedChannels[id] || [];
    if (!channels.length) return;
    setBusyId(id);
    setError(null);
    try {
      const rows = await smm.publishBundle(
        id,
        channels.map((channel) => ({ channel, content_id: id })),
        scheduleAt[id] ? new Date(scheduleAt[id]).toISOString() : null
      );
      setPublications((r) => ({ ...r, [id]: rows }));
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
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
              {item.auto_generated && <Chip size="small" color="info" label="авто" />}
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
              {(Object.keys(smm.TRANSFORM_ACTION_LABELS) as smm.TransformAction[]).map((action) => (
                <Chip
                  key={action}
                  size="small"
                  variant="outlined"
                  clickable
                  disabled={busyId === item.id}
                  label={smm.TRANSFORM_ACTION_LABELS[action]}
                  onClick={() => runTransform(item.id, action)}
                />
              ))}
            </Stack>
          )}
          {canGenerate && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel id={`variant-channel-${item.id}`}>Версия для канала</InputLabel>
                <Select
                  labelId={`variant-channel-${item.id}`}
                  label="Версия для канала"
                  value={variantChannel[item.id] || ''}
                  onChange={(e) => setVariantChannel((v) => ({ ...v, [item.id]: e.target.value }))}
                >
                  {smm.VARIANT_CHANNELS.map((ch) => (
                    <MenuItem key={ch} value={ch}>
                      {ch}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button size="small" disabled={!variantChannel[item.id] || busyId === item.id} onClick={() => runVariant(item.id)}>
                Сделать версию
              </Button>
              <Button size="small" disabled={busyId === item.id} onClick={() => renderImage(item.id)}>
                Создать визуал
              </Button>
            </Stack>
          )}
          {assetsByContent[item.id]?.map((asset) => (
            <Box key={asset.id} sx={{ mt: 1 }}>
              {asset.url ? (
                <img src={asset.url} alt={asset.prompt || 'визуал'} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 4 }} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Визуал сохранён (storage_key: {asset.storage_key})
                </Typography>
              )}
            </Box>
          ))}
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
          {canPublish && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center" flexWrap="wrap" useFlexGap>
              <Select
                multiple
                size="small"
                displayEmpty
                value={selectedChannels[item.id] || []}
                onChange={(e) =>
                  setSelectedChannels((v) => ({
                    ...v,
                    [item.id]: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value,
                  }))
                }
                renderValue={(selected) => ((selected as string[]).length ? (selected as string[]).join(', ') : 'Куда опубликовать')}
                sx={{ minWidth: 210 }}
              >
                {publishChannels.map((ch) => (
                  <MenuItem key={ch.channel} value={ch.channel} disabled={!ch.configured}>
                    {ch.channel}
                    {!ch.configured ? ' (не настроен)' : ''}
                  </MenuItem>
                ))}
              </Select>
              <TextField
                size="small"
                type="datetime-local"
                label="Запланировать на"
                value={scheduleAt[item.id] || ''}
                onChange={(e) => setScheduleAt((v) => ({ ...v, [item.id]: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                size="small"
                color="secondary"
                variant="contained"
                disabled={!(selectedChannels[item.id] || []).length || item.status !== 'approved' || busyId === item.id}
                onClick={() => runPublish(item.id)}
              >
                {scheduleAt[item.id] ? 'Запланировать' : 'Опубликовать сейчас'}
              </Button>
            </Stack>
          )}
          {publications[item.id]?.length > 0 && (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {publications[item.id].map((p) => (
                <Alert key={p.id} severity={p.status === 'success' ? 'success' : p.status === 'error' ? 'error' : 'info'}>
                  {p.channel}: {p.status}
                  {p.external_url ? ` — ${p.external_url}` : ''}
                </Alert>
              ))}
            </Stack>
          )}
        </Paper>
      ))}
    </Stack>
  );
};

// ─── База знаний ────────────────────────────────────────────────────────────

const KnowledgeTab: React.FC<{ projectCode: string; canManage: boolean }> = ({ projectCode, canManage }) => {
  const [items, setItems] = useState<smm.KnowledgeItem[] | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const reload = () => smm.listKnowledge(projectCode).then((r) => setItems(r.items)).catch(() => setItems([]));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode]);

  const add = async () => {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    try {
      await smm.createKnowledge(projectCode, { title, content });
      setTitle('');
      setContent('');
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  const remove = async (id: number) => {
    await smm.deleteKnowledge(projectCode, id);
    await reload();
  };

  const reindex = async () => {
    setReindexResult(null);
    try {
      const r = await smm.reindexKnowledge(projectCode);
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
              <Typography variant="subtitle2">Добавить факт о проекте</Typography>
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
      {items && items.length === 0 && <Alert severity="info">База знаний проекта пока пуста.</Alert>}
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

// ─── Каналы публикации (куда постить) ──────────────────────────────────────

const ALL_CHANNELS = ['vk', 'telegram', 'instagram', 'max'];

const ChannelsTab: React.FC<{ projectCode: string; canManage: boolean }> = ({ projectCode, canManage }) => {
  const [statuses, setStatuses] = useState<smm.ChannelStatus[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const reload = () => smm.listChannels(projectCode).then(setStatuses).catch(() => setStatuses([]));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode]);

  const startEdit = (channel: string) => {
    setEditing(channel);
    setFieldValues({});
    setError(null);
    setSaved(null);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await smm.setChannelConfig(projectCode, editing, fieldValues);
      setSaved(`Канал «${editing}» настроен`);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  const disable = async (channel: string) => {
    await smm.removeChannel(projectCode, channel);
    await reload();
  };

  if (!statuses) return <CircularProgress size={24} />;

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Typography variant="body2" color="text.secondary">
        Токены хранятся зашифрованными и никогда не возвращаются обратно — только статус «настроен / не настроен».
      </Typography>
      {saved && <Alert severity="success">{saved}</Alert>}
      {ALL_CHANNELS.map((channel) => {
        const status = statuses.find((s) => s.channel === channel);
        return (
          <Paper key={channel} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1">{channel}</Typography>
              <Chip size="small" color={status?.configured ? 'success' : 'default'} label={status?.configured ? 'настроен' : 'не настроен'} />
            </Stack>
            {canManage && editing !== channel && (
              <Button size="small" sx={{ mt: 1 }} onClick={() => startEdit(channel)}>
                {status?.configured ? 'Изменить' : 'Настроить'}
              </Button>
            )}
            {canManage && status?.configured && editing !== channel && (
              <Button size="small" color="error" sx={{ mt: 1, ml: 1 }} onClick={() => disable(channel)}>
                Отключить
              </Button>
            )}
            {editing === channel && (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {(smm.CHANNEL_FIELD_SPECS[channel] || []).map((f) => (
                  <TextField
                    key={f.key}
                    size="small"
                    label={f.label}
                    value={fieldValues[f.key] || ''}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ))}
                {error && <Alert severity="error">{error}</Alert>}
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" onClick={save}>
                    Сохранить
                  </Button>
                  <Button size="small" onClick={() => setEditing(null)}>
                    Отмена
                  </Button>
                </Stack>
              </Stack>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
};

// ─── Настройки проекта: бренд-профиль ──────────────────────────────────────

const SettingsTab: React.FC<{ projectCode: string; canManage: boolean }> = ({ projectCode, canManage }) => {
  const [project, setProject] = useState<smm.Project | null>(null);
  const [fields, setFields] = useState<smm.BrandContextField[]>([]);
  const [brand, setBrand] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    smm
      .getProject(projectCode)
      .then((p) => {
        setProject(p);
        setBrand(p.brand_context || {});
      })
      .catch(() => undefined);
    smm.getBrandContextFields().then(setFields).catch(() => setFields([]));
  }, [projectCode]);

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      await smm.updateProject(projectCode, { brand_context: brand });
      setSaved(true);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  if (!project) return <CircularProgress size={24} />;

  if (!canManage) {
    return <Alert severity="info">Редактирование бренд-профиля доступно с правом smm_projects.manage_project.</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary">
        Эти поля AI подмешивает в промпт всегда — чтобы не писать общие тексты, а держать позиционирование проекта.
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

// ─── Пакет по событию ───────────────────────────────────────────────────────

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

const EventPackTab: React.FC<{ projectCode: string; canGenerate: boolean; onGenerated: () => void }> = ({
  projectCode,
  canGenerate,
  onGenerated,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<smm.EventPackResult | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const pack = await smm.createEventPack(projectCode, values);
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
        Один запуск создаёт сразу пакет материалов — все факты берутся только из того, что вы укажете ниже.
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

// ─── Контент-план + периодичность (автопилот) ──────────────────────────────

const PLAN_ITEM_STATUS_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'default',
  generating: 'info',
  ready: 'info',
  publishing: 'warning',
  published: 'success',
  error: 'error',
  skipped: 'default',
  cancelled: 'default',
};

const ContentPlanTab: React.FC<{ projectCode: string; canGenerate: boolean; canManage: boolean }> = ({
  projectCode,
  canGenerate,
  canManage,
}) => {
  const [plans, setPlans] = useState<smm.ContentPlan[] | null>(null);
  const [activePlan, setActivePlan] = useState<smm.ContentPlan | null>(null);
  const [newPlanName, setNewPlanName] = useState('');
  const [enablePeriodicity, setEnablePeriodicity] = useState(false);
  const [unit, setUnit] = useState<'day' | 'week'>('week');
  const [times, setTimes] = useState(3);
  const [periodicityChannels, setPeriodicityChannels] = useState<string[]>(['vk']);
  const [autoPublish, setAutoPublish] = useState(true);
  const [lookaheadDays, setLookaheadDays] = useState(14);
  const [genCount, setGenCount] = useState(10);
  const [genChannels, setGenChannels] = useState('vk,telegram');
  const [genGoals, setGenGoals] = useState('');
  const [genEvents, setGenEvents] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const reloadPlans = () => smm.listContentPlans(projectCode).then(setPlans).catch(() => setPlans([]));

  useEffect(() => {
    reloadPlans();
    setActivePlan(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode]);

  const openPlan = (plan: smm.ContentPlan) => {
    smm.getContentPlan(projectCode, plan.id).then(setActivePlan).catch(() => undefined);
  };

  const createPlan = async () => {
    if (!newPlanName.trim()) return;
    setError(null);
    try {
      const plan = await smm.createContentPlan(projectCode, {
        name: newPlanName.trim(),
        periodicity: enablePeriodicity
          ? { unit, times, channels: periodicityChannels, auto_publish: autoPublish, lookahead_days: lookaheadDays }
          : undefined,
      });
      setNewPlanName('');
      await reloadPlans();
      openPlan(plan);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  const runNow = async () => {
    if (!activePlan) return;
    setLoading(true);
    setRunResult(null);
    try {
      const result = await smm.runContentPlanNow(projectCode, activePlan.id);
      setRunResult(`Создано пунктов: ${result.items_created}`);
      const refreshed = await smm.getContentPlan(projectCode, activePlan.id);
      setActivePlan(refreshed);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const generateItems = async () => {
    if (!activePlan) return;
    setLoading(true);
    setError(null);
    try {
      await smm.generateContentPlanItems(projectCode, activePlan.id, {
        count: genCount,
        channels: genChannels.split(',').map((c) => c.trim()).filter(Boolean),
        goals: genGoals || undefined,
        important_events: genEvents || undefined,
      });
      const refreshed = await smm.getContentPlan(projectCode, activePlan.id);
      setActivePlan(refreshed);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: number) => {
    if (!activePlan) return;
    await smm.deleteContentPlanItem(itemId);
    const refreshed = await smm.getContentPlan(projectCode, activePlan.id);
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
        {activePlan.periodicity ? (
          <Alert severity="success">
            Автопилот включён: {activePlan.periodicity.times}× в {activePlan.periodicity.unit === 'week' ? 'неделю' : 'день'}, каналы:{' '}
            {activePlan.periodicity.channels.join(', ')}
            {activePlan.periodicity.auto_publish ? ' — публикует автоматически.' : ' — только готовит черновики.'}
            {activePlan.last_generated_at && <> Последний запуск: {new Date(activePlan.last_generated_at).toLocaleString()}.</>}
          </Alert>
        ) : (
          <Alert severity="info">Периодичность не задана — план работает только вручную.</Alert>
        )}
        {canGenerate && activePlan.periodicity && (
          <Button size="small" variant="outlined" onClick={runNow} disabled={loading} sx={{ alignSelf: 'flex-start' }}>
            {loading ? 'Выполняется…' : 'Прогнать сейчас'}
          </Button>
        )}
        {runResult && <Alert severity="success">{runResult}</Alert>}
        {canGenerate && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1} sx={{ maxWidth: 480 }}>
              <Typography variant="subtitle2">Заполнить план идеями вручную (AI-ассистент)</Typography>
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
                {item.scheduled_at && <Chip size="small" variant="outlined" label={new Date(item.scheduled_at).toLocaleString()} />}
              </Stack>
              <Chip size="small" label={item.status} color={PLAN_ITEM_STATUS_COLOR[item.status] || 'default'} />
            </Stack>
            {item.brief && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {item.brief}
              </Typography>
            )}
            {item.last_error && <Alert severity="error" sx={{ mt: 1 }}>{item.last_error}</Alert>}
            {canManage && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
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
          <Stack spacing={1.5} sx={{ maxWidth: 480 }}>
            <TextField size="small" label="Название плана" value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} fullWidth />
            <FormControlLabel
              control={<Switch checked={enablePeriodicity} onChange={(e) => setEnablePeriodicity(e.target.checked)} />}
              label="Включить автопилот (периодичность)"
            />
            {enablePeriodicity && (
              <Stack spacing={1} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  Система сама будет создавать и публиковать материалы по этому расписанию — без дополнительного клика на каждый пост.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    type="number"
                    label="Раз"
                    value={times}
                    onChange={(e) => setTimes(Number(e.target.value) || 1)}
                    sx={{ width: 90 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="periodicity-unit">За период</InputLabel>
                    <Select labelId="periodicity-unit" label="За период" value={unit} onChange={(e) => setUnit(e.target.value as 'day' | 'week')}>
                      <MenuItem value="day">День</MenuItem>
                      <MenuItem value="week">Неделю</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <Select
                  multiple
                  size="small"
                  value={periodicityChannels}
                  onChange={(e) =>
                    setPeriodicityChannels(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)
                  }
                  renderValue={(selected) => (selected as string[]).join(', ') || 'Каналы'}
                >
                  {ALL_CHANNELS.map((ch) => (
                    <MenuItem key={ch} value={ch}>
                      <Checkbox checked={periodicityChannels.includes(ch)} size="small" />
                      {ch}
                    </MenuItem>
                  ))}
                </Select>
                <TextField
                  size="small"
                  type="number"
                  label="Горизонт планирования, дней"
                  value={lookaheadDays}
                  onChange={(e) => setLookaheadDays(Number(e.target.value) || 7)}
                />
                <FormControlLabel
                  control={<Switch checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />}
                  label="Публиковать автоматически (а не только готовить черновики)"
                />
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}
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
                  {plan.periodicity ? `Автопилот: ${plan.periodicity.times}×/${plan.periodicity.unit === 'week' ? 'нед' : 'день'}` : 'Ручной план'}
                  {' · '}
                  {plan.items.length} пункт(ов)
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Проект: вкладки ─────────────────────────────────────────────────────

const ProjectWorkspaceView: React.FC<{ projectCode: string }> = ({ projectCode }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const canGenerate = hasPermission(user, 'smm_projects.generate');
  const canManageKnowledge = hasPermission(user, 'smm_projects.manage_knowledge');
  const canManageContent = hasPermission(user, 'smm_projects.manage_content');
  const canManageProject = hasPermission(user, 'smm_projects.manage_project');
  const canManageChannels = hasPermission(user, 'smm_projects.manage_channels');
  const canPublish = hasPermission(user, 'smm_projects.publish');

  const tabs = useMemo(
    () => [
      { label: 'Новый материал', node: <NewContentTab projectCode={projectCode} canGenerate={canGenerate} onGenerated={() => setReloadKey((k) => k + 1)} /> },
      { label: 'Черновики', node: <DraftsTab projectCode={projectCode} canGenerate={canGenerate} canManage={canManageContent} canPublish={canPublish} reloadKey={reloadKey} /> },
      { label: 'Пакет по событию', node: <EventPackTab projectCode={projectCode} canGenerate={canGenerate} onGenerated={() => setReloadKey((k) => k + 1)} /> },
      { label: 'Контент-план', node: <ContentPlanTab projectCode={projectCode} canGenerate={canGenerate} canManage={canManageContent} /> },
      { label: 'База знаний', node: <KnowledgeTab projectCode={projectCode} canManage={canManageKnowledge} /> },
      { label: 'Каналы', node: <ChannelsTab projectCode={projectCode} canManage={canManageChannels} /> },
      { label: 'Настройки', node: <SettingsTab projectCode={projectCode} canManage={canManageProject} /> },
    ],
    [projectCode, canGenerate, canManageContent, canManageKnowledge, canManageProject, canManageChannels, canPublish, reloadKey]
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

// ─── Список проектов ────────────────────────────────────────────────────────

const SmmProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<smm.ProjectListItem[] | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManageProject = hasPermission(user, 'smm_projects.manage_project');

  const reload = () => smm.listProjects().then(setProjects).catch(() => setProjects([]));

  useEffect(() => {
    reload();
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      const project = await smm.createProject({ name: newName.trim() });
      setNewName('');
      await reload();
      setActiveCode(project.code);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
          <Typography variant="h5">SMM-проекты</Typography>
          {activeCode && (
            <Button size="small" onClick={() => setActiveCode(null)}>
              ← к списку проектов
            </Button>
          )}
        </Stack>
        {!activeCode && (
          <Stack spacing={2}>
            {canManageProject && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" label="Название проекта" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
                  <Button variant="contained" onClick={create} disabled={!newName.trim()}>
                    Создать проект
                  </Button>
                </Stack>
                {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
              </Paper>
            )}
            {!projects && <CircularProgress size={24} />}
            {projects && projects.length === 0 && <Alert severity="info">Пока нет ни одного проекта.</Alert>}
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {projects?.map((p) => (
                <Card key={p.code} sx={{ width: 240 }}>
                  <CardActionArea onClick={() => setActiveCode(p.code)}>
                    <CardContent>
                      <Typography variant="subtitle1">{p.name}</Typography>
                      {p.description && (
                        <Typography variant="body2" color="text.secondary">
                          {p.description}
                        </Typography>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          </Stack>
        )}
        {activeCode && <ProjectWorkspaceView projectCode={activeCode} />}
      </Box>
    </Layout>
  );
};

export default SmmProjectsPage;
