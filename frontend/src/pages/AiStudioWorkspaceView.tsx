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

const DraftsTab: React.FC<{ workspaceCode: string; canGenerate: boolean; canManage: boolean; reloadKey: number }> = ({
  workspaceCode,
  canGenerate,
  canManage,
  reloadKey,
}) => {
  const [items, setItems] = useState<aiStudio.GeneratedContent[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
            <Typography variant="subtitle1">{item.title || `#${item.id}`}</Typography>
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
