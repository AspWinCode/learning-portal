import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  // Немедленная публикация исполняется фоновой задачей (dramatiq), поэтому
  // ответ publish-bundle приходит со status=approved, когда работа ещё не
  // началась — опрашиваем публикации, пока они не дойдут до success/error,
  // иначе UI выглядит так, будто "ничего не произошло".
  const pollUntilSettled = async (id: number, pendingIds: number[]) => {
    for (let attempt = 0; attempt < 15 && pendingIds.length; attempt += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const rows = await smm.listPublications(id);
      setPublications((r) => ({ ...r, [id]: rows }));
      pendingIds = rows.filter((row) => !['success', 'error', 'cancelled'].includes(row.status)).map((row) => row.id);
    }
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
      const pendingIds = rows.filter((row) => !['success', 'error', 'cancelled'].includes(row.status)).map((row) => row.id);
      if (pendingIds.length) await pollUntilSettled(id, pendingIds);
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
                  <MenuItem key={ch.channel} value={ch.channel} disabled={!ch.verified}>
                    {ch.channel}
                    {!ch.configured ? ' (не настроен)' : !ch.verified ? ' (не проверен)' : ''}
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
              {publications[item.id].map((p) => {
                const label =
                  p.status === 'success'
                    ? `${p.channel}: Опубликовано ✓`
                    : p.status === 'error'
                    ? `${p.channel}: Ошибка — ${p.last_error || 'см. детали'}`
                    : p.status === 'scheduled'
                    ? `${p.channel}: Запланировано`
                    : `${p.channel}: Публикация…`;
                return (
                  <Alert key={p.id} severity={p.status === 'success' ? 'success' : p.status === 'error' ? 'error' : 'info'}>
                    {label}
                    {p.external_url ? ` — ${p.external_url}` : ''}
                  </Alert>
                );
              })}
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

const ALL_CHANNELS = smm.ALL_CHANNELS;

const ChannelsTab: React.FC<{ projectCode: string; canManage: boolean }> = ({ projectCode, canManage }) => {
  const [statuses, setStatuses] = useState<smm.ChannelStatus[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const reload = () => smm.listChannels(projectCode).then(setStatuses).catch(() => setStatuses([]));

  const verify = async (channel: string) => {
    setVerifying(channel);
    setError(null);
    setSaved(null);
    try {
      const result = await smm.verifyChannel(projectCode, channel);
      if (result.verified) {
        const detail = result.chat_title || result.chat_id || result.feed_url || '';
        setSaved(`«${channel}» проверен и подключён${detail ? `: ${detail}` : ''}`);
      }
      if (!result.verified) setError(result.error || 'Ошибка подключения');
      await reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка проверки'));
    } finally {
      setVerifying(null);
    }
  };

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
        const badge = !status?.configured
          ? { color: 'default' as const, label: 'не настроен' }
          : status.verified
          ? { color: 'success' as const, label: '✓ Подключён и проверен' }
          : { color: 'warning' as const, label: '⚠ Настроен, но не проверен' };
        return (
          <Paper key={channel} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1">{channel}</Typography>
              <Chip size="small" color={badge.color} label={badge.label} />
            </Stack>
            {status?.configured && status.verification_error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                ✕ Ошибка подключения: {status.verification_error}
              </Alert>
            )}
            {canManage && editing !== channel && (
              <Button size="small" sx={{ mt: 1 }} onClick={() => startEdit(channel)}>
                {status?.configured ? 'Изменить' : 'Настроить'}
              </Button>
            )}
            {canManage && status?.configured && editing !== channel && (
              <Button size="small" sx={{ mt: 1, ml: 1 }} disabled={verifying === channel} onClick={() => verify(channel)}>
                {verifying === channel ? 'Проверяем…' : 'Проверить подключение'}
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

const LegacyBrandSettingsTab: React.FC<{ projectCode: string; canManage: boolean }> = ({ projectCode, canManage }) => {
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
      { label: 'База знаний', node: <KnowledgeTab projectCode={projectCode} canManage={canManageKnowledge} /> },
      { label: 'Каналы', node: <ChannelsTab projectCode={projectCode} canManage={canManageChannels} /> },
      { label: 'Настройки', node: <LegacyBrandSettingsTab projectCode={projectCode} canManage={canManageProject} /> },
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

// ─── Список проектов (старый UI, скрыт — см. ComposeTab/ProjectSettingsTab) ─

const LegacyProjectsListPage: React.FC = () => {
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

// ─── Новые: вставил текст (+картинку) → выбрал каналы/проект → опубликовал ──

const ComposeTab: React.FC<{ onPublished: () => void }> = ({ onPublished }) => {
  const [projects, setProjects] = useState<smm.ProjectListItem[]>([]);
  const [projectCode, setProjectCode] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [channelStatuses, setChannelStatuses] = useState<smm.ChannelStatus[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<smm.PublicationWithProject[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    smm
      .listProjects()
      .then((list) => {
        setProjects(list);
        setProjectCode((prev) => prev || list[0]?.code || '');
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!projectCode) {
      setChannelStatuses([]);
      return;
    }
    smm.listChannels(projectCode).then(setChannelStatuses).catch(() => setChannelStatuses([]));
    setSelectedChannels([]);
  }, [projectCode]);

  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Вставка картинки по Ctrl+V прямо в то же окно, что и текст — если в
  // буфере есть image/*, перехватываем; иначе даём браузеру вставить текст
  // в textarea как обычно.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setImage(file);
          e.preventDefault();
        }
        return;
      }
    }
  };

  const toggleChannel = (channel: string) => {
    setSelectedChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  };

  const submit = async () => {
    if (!text.trim() || !projectCode || !selectedChannels.length) return;
    if (scheduled && !scheduleAt) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const rows = await smm.composeAndPublish({
        projectCode,
        text: text.trim(),
        channels: selectedChannels,
        publishAt: scheduled && scheduleAt ? new Date(scheduleAt).toISOString() : null,
        image,
      });
      setResult(rows);
      setText('');
      setImage(null);
      setSelectedChannels([]);
      setScheduled(false);
      setScheduleAt('');
      onPublished();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка публикации'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Box onPaste={handlePaste} sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 1 }}>
        <TextField
          multiline
          minRows={8}
          fullWidth
          placeholder="Вставьте текст поста (Ctrl+V) — картинку можно вставить сюда же"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" onClick={() => fileInputRef.current?.click()}>
          + картинка
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => setImage(e.target.files?.[0] || null)}
        />
        {image && (
          <Button size="small" color="error" onClick={() => setImage(null)}>
            Убрать картинку
          </Button>
        )}
      </Stack>
      {imagePreview && <Box component="img" src={imagePreview} alt="превью" sx={{ maxWidth: 280, maxHeight: 280, borderRadius: 1 }} />}

      <FormControl size="small" fullWidth>
        <InputLabel id="compose-project">Проект</InputLabel>
        <Select labelId="compose-project" label="Проект" value={projectCode} onChange={(e) => setProjectCode(e.target.value)}>
          {projects.map((p) => (
            <MenuItem key={p.code} value={p.code}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="body2" color="text.secondary">
          Каналы:
        </Typography>
        {channelStatuses.map((ch) => (
          <Chip
            key={ch.channel}
            label={ch.channel + (!ch.verified ? ' (не проверен)' : '')}
            clickable={ch.verified}
            disabled={!ch.verified}
            color={selectedChannels.includes(ch.channel) ? 'secondary' : 'default'}
            variant={selectedChannels.includes(ch.channel) ? 'filled' : 'outlined'}
            onClick={() => ch.verified && toggleChannel(ch.channel)}
          />
        ))}
        {!channelStatuses.length && projectCode && (
          <Typography variant="body2" color="text.secondary">
            Нет настроенных каналов — настройте их во вкладке «Настройки».
          </Typography>
        )}
      </Stack>

      <FormControlLabel
        control={<Switch checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />}
        label="Отложенная публикация"
      />
      {scheduled && (
        <TextField
          size="small"
          type="datetime-local"
          label="Дата и время"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ maxWidth: 260 }}
        />
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <Alert severity="success">
          Отправлено в {result.length} канал(ов) — см. вкладку «{scheduled ? 'Запланированные' : 'Отправленные'}».
        </Alert>
      )}

      <Button
        variant="contained"
        color="secondary"
        disabled={busy || !text.trim() || !projectCode || !selectedChannels.length || (scheduled && !scheduleAt)}
        onClick={submit}
      >
        {busy ? 'Публикуем…' : 'Запустить в работу'}
      </Button>
    </Stack>
  );
};

// ─── Запланированные / Отправленные ─────────────────────────────────────────

const PUBLICATION_STATUS_LABEL: Record<string, string> = {
  approved: 'Готовится к публикации',
  scheduled: 'Запланировано',
  publishing: 'Публикуется…',
  success: 'Опубликовано',
  error: 'Ошибка',
  cancelled: 'Отменено',
};

const PUBLICATION_STATUS_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  approved: 'info',
  scheduled: 'info',
  publishing: 'warning',
  success: 'success',
  error: 'error',
  cancelled: 'default',
};

const PublicationsListTab: React.FC<{ state: 'scheduled' | 'sent'; reloadKey: number }> = ({ state, reloadKey }) => {
  const [projects, setProjects] = useState<smm.ProjectListItem[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [items, setItems] = useState<smm.PublicationWithProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    smm.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const reload = () => {
    smm
      .listMyPublications(state, projectFilter || undefined)
      .then(setItems)
      .catch((e) => setError(extractApiError(e, 'Ошибка')));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, projectFilter, reloadKey]);

  const cancel = async (id: number) => {
    setBusyId(id);
    try {
      await smm.cancelPublication(id);
      reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (id: number) => {
    setBusyId(id);
    try {
      await smm.retryPublication(id);
      reload();
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack spacing={2}>
      <FormControl size="small" sx={{ maxWidth: 260 }}>
        <InputLabel id="pub-project-filter">Проект</InputLabel>
        <Select
          labelId="pub-project-filter"
          label="Проект"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          displayEmpty
        >
          <MenuItem value="">Все проекты</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.code} value={p.code}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {error && <Alert severity="error">{error}</Alert>}
      {!items && <CircularProgress size={24} />}
      {items && items.length === 0 && (
        <Alert severity="info">{state === 'scheduled' ? 'Нет запланированных публикаций.' : 'Пока ничего не отправлено.'}</Alert>
      )}
      <Stack spacing={1.5}>
        {items?.map((p) => (
          <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={p.project_code} />
                <Chip size="small" variant="outlined" label={p.channel} />
                <Chip size="small" color={PUBLICATION_STATUS_COLOR[p.status] || 'default'} label={PUBLICATION_STATUS_LABEL[p.status] || p.status} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {p.scheduled_at
                  ? new Date(p.scheduled_at).toLocaleString('ru-RU')
                  : p.published_at
                  ? new Date(p.published_at).toLocaleString('ru-RU')
                  : ''}
              </Typography>
            </Stack>
            {p.asset_url && <Box component="img" src={p.asset_url} alt="" sx={{ maxWidth: 160, maxHeight: 160, borderRadius: 1, mt: 1 }} />}
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
              {p.text_snapshot}
            </Typography>
            {p.status === 'error' && p.last_error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {p.last_error}
              </Alert>
            )}
            {p.external_url && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                <a href={p.external_url} target="_blank" rel="noreferrer">
                  {p.external_url}
                </a>
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {['approved', 'scheduled'].includes(p.status) && (
                <Button size="small" color="error" disabled={busyId === p.id} onClick={() => cancel(p.id)}>
                  Отменить
                </Button>
              )}
              {p.status === 'error' && (
                <Button size="small" disabled={busyId === p.id} onClick={() => retry(p.id)}>
                  Повторить
                </Button>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
};

// ─── Настройки: проекты + подключение каналов ──────────────────────────────

const ProjectSettingsTab: React.FC = () => {
  const { user } = useAuth();
  const canManageProject = hasPermission(user, 'smm_projects.manage_project');
  const canManageChannels = hasPermission(user, 'smm_projects.manage_channels');
  const [projects, setProjects] = useState<smm.ProjectListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    smm
      .listProjects()
      .then((list) => {
        setProjects(list);
        setSelected((prev) => prev || list[0]?.code || null);
      })
      .catch(() => setProjects([]));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      const project = await smm.createProject({ name: newName.trim() });
      setNewName('');
      await reload();
      setSelected(project.code);
    } catch (e) {
      setError(extractApiError(e, 'Ошибка'));
    }
  };

  return (
    <Stack spacing={2}>
      {canManageProject && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Новый проект
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Название проекта" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
            <Button variant="contained" onClick={create} disabled={!newName.trim()}>
              Создать
            </Button>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </Paper>
      )}

      {!projects && <CircularProgress size={24} />}
      {projects && projects.length === 0 && <Alert severity="info">Пока нет ни одного проекта.</Alert>}

      {projects && projects.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {projects.map((p) => (
            <Chip
              key={p.code}
              label={p.name}
              color={selected === p.code ? 'secondary' : 'default'}
              variant={selected === p.code ? 'filled' : 'outlined'}
              onClick={() => setSelected(p.code)}
            />
          ))}
        </Stack>
      )}

      {selected && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Каналы проекта «{projects?.find((p) => p.code === selected)?.name}»
          </Typography>
          <ChannelsTab projectCode={selected} canManage={canManageChannels} />
        </Paper>
      )}
    </Stack>
  );
};

// ─── Главная страница: 4 вкладки ────────────────────────────────────────────

const SmmProjectsPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const tabs = [
    { label: 'Новые', node: <ComposeTab onPublished={() => setReloadKey((k) => k + 1)} /> },
    { label: 'Запланированные', node: <PublicationsListTab state="scheduled" reloadKey={reloadKey} /> },
    { label: 'Отправленные', node: <PublicationsListTab state="sent" reloadKey={reloadKey} /> },
    { label: 'Настройки', node: <ProjectSettingsTab /> },
  ];

  return (
    <Layout>
      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          SMM-проекты
        </Typography>
        <Paper variant="outlined">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {tabs.map((t) => (
              <Tab key={t.label} label={t.label} />
            ))}
          </Tabs>
          <Divider />
          <Box sx={{ p: 2 }}>{tabs[tab].node}</Box>
        </Paper>
      </Box>
    </Layout>
  );
};

export default SmmProjectsPage;
