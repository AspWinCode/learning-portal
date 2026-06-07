import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { settingsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type {
  StudentQuestionnaireField,
  StudentQuestionnaireFieldType,
  StudentQuestionnaireTemplate,
} from '../types';

const FIELD_TYPES: Array<{ value: StudentQuestionnaireFieldType; label: string }> = [
  { value: 'text', label: 'Текст' },
  { value: 'textarea', label: 'Длинный текст' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'phone', label: 'Телефон' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Выбор' },
  { value: 'multiselect', label: 'Множественный выбор' },
  { value: 'checkbox', label: 'Чекбокс' },
];

const optionFieldTypes = new Set<StudentQuestionnaireFieldType>(['select', 'multiselect']);
const textValidationTypes = new Set<StudentQuestionnaireFieldType>(['text', 'textarea', 'phone', 'email']);
const numberValidationTypes = new Set<StudentQuestionnaireFieldType>(['number']);

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function slugify(value: string, fallback: string) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return (key || fallback).slice(0, 64);
}

function createField(index: number): StudentQuestionnaireField {
  return {
    id: makeId(),
    key: `field_${index + 1}`,
    label: 'Новое поле',
    type: 'text',
    required: false,
    placeholder: '',
    help_text: '',
    options: [],
    validation: {},
  };
}

function createTemplate(existingCount: number): StudentQuestionnaireTemplate {
  return {
    id: makeId(),
    name: `Анкета ${existingCount + 1}`,
    event_name: '',
    description: '',
    is_active: true,
    fields: [
      {
        id: makeId(),
        key: 'student_full_name',
        label: 'ФИО ученика',
        type: 'text',
        required: true,
        placeholder: '',
        help_text: '',
        options: [],
        validation: {},
      },
    ],
  };
}

const StudentQuestionnairesSettingsSection: React.FC = () => {
  const [items, setItems] = useState<StudentQuestionnaireTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );
  const publicUrl = selected ? `${window.location.origin}/anketa/student/${selected.id}` : '';
  const embedCode = publicUrl
    ? `<iframe src="${publicUrl}" width="100%" height="760" style="border:0;max-width:900px" title="${selected?.name || 'Анкета'}"></iframe>`
    : '';

  const load = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getStudentQuestionnaires();
      setItems(data);
      setSelectedId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id || null);
      setDirty(false);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить анкеты'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateItems = (updater: (prev: StudentQuestionnaireTemplate[]) => StudentQuestionnaireTemplate[]) => {
    setItems((prev) => updater(prev));
    setDirty(true);
  };

  const updateSelected = (patch: Partial<StudentQuestionnaireTemplate>) => {
    if (!selected) return;
    updateItems((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)));
  };

  const updateField = (fieldId: string, patch: Partial<StudentQuestionnaireField>) => {
    if (!selected) return;
    updateItems((prev) =>
      prev.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              fields: item.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
            }
          : item
      )
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await settingsApi.setStudentQuestionnaires(items);
      setItems(saved);
      setSelectedId((current) => current && saved.some((item) => item.id === current) ? current : saved[0]?.id || null);
      setDirty(false);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить анкеты'));
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError('');
    } catch {
      setError('Не удалось скопировать. Скопируйте текст вручную.');
    }
  };

  const addTemplate = () => {
    const template = createTemplate(items.length);
    updateItems((prev) => [template, ...prev]);
    setSelectedId(template.id);
  };

  const duplicateTemplate = (template: StudentQuestionnaireTemplate) => {
    const copy = {
      ...template,
      id: makeId(),
      name: `${template.name} копия`,
      fields: template.fields.map((field) => ({ ...field, id: makeId() })),
    };
    updateItems((prev) => [copy, ...prev]);
    setSelectedId(copy.id);
  };

  const deleteTemplate = (templateId: string) => {
    updateItems((prev) => prev.filter((item) => item.id !== templateId));
    if (selectedId === templateId) {
      const next = items.find((item) => item.id !== templateId);
      setSelectedId(next?.id || null);
    }
  };

  const addField = () => {
    if (!selected) return;
    const field = createField(selected.fields.length);
    updateSelected({ fields: [...selected.fields, field] });
  };

  const deleteField = (fieldId: string) => {
    if (!selected) return;
    updateSelected({ fields: selected.fields.filter((field) => field.id !== fieldId) });
  };

  const setFieldOptions = (fieldId: string, raw: string) => {
    updateField(fieldId, {
      options: raw
        .split('\n')
        .map((option) => option.trim())
        .filter(Boolean),
    });
  };

  return (
    <Stack spacing={2}>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6">Анкеты для учеников</Typography>
          <Typography variant="body2" color="text.secondary">
            Шаблоны анкет под мероприятия: состав полей, типы и правила заполнения.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {dirty && <Chip size="small" color="warning" label="Есть несохраненные изменения" />}
          <Button variant="outlined" startIcon={<AddIcon />} onClick={addTemplate}>
            Создать анкету
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" mb={1}>Список анкет</Typography>
          {loading ? (
            <Typography color="text.secondary">Загрузка...</Typography>
          ) : items.length === 0 ? (
            <Typography color="text.secondary">Пока нет ни одной анкеты.</Typography>
          ) : (
            <Stack spacing={1}>
              {items.map((item) => (
                <Box
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  sx={{
                    border: 1,
                    borderColor: selected?.id === item.id ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    p: 1,
                    cursor: 'pointer',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="subtitle2">{item.name}</Typography>
                    <Chip size="small" color={item.is_active ? 'success' : 'default'} label={item.is_active ? 'Активна' : 'Выключена'} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {item.event_name || 'Мероприятие не указано'} · полей: {item.fields.length}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          {!selected ? (
            <Typography color="text.secondary">Создайте анкету, чтобы настроить поля.</Typography>
          ) : (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1">Редактор анкеты</Typography>
                <Box>
                  <Tooltip title="Дублировать анкету">
                    <IconButton size="small" onClick={() => duplicateTemplate(selected)}>
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Удалить анкету">
                    <IconButton size="small" color="error" onClick={() => deleteTemplate(selected.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Название анкеты"
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                  size="small"
                  required
                />
                <TextField
                  label="Мероприятие"
                  value={selected.event_name || ''}
                  onChange={(event) => updateSelected({ event_name: event.target.value })}
                  size="small"
                />
              </Box>
              <TextField
                label="Описание"
                value={selected.description || ''}
                onChange={(event) => updateSelected({ description: event.target.value })}
                size="small"
                multiline
                minRows={2}
              />
              <FormControlLabel
                control={<Switch checked={selected.is_active} onChange={(event) => updateSelected({ is_active: event.target.checked })} />}
                label="Анкета активна"
              />

              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2">Внешняя ссылка</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CopyIcon />}
                        disabled={!selected.is_active}
                        onClick={() => void copyText(publicUrl)}
                      >
                        Копировать ссылку
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<LinkIcon />}
                        disabled={!selected.is_active}
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть
                      </Button>
                    </Box>
                  </Box>
                  <TextField size="small" value={selected.is_active ? publicUrl : 'Включите анкету, чтобы ссылка открывалась клиентам'} fullWidth InputProps={{ readOnly: true }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2">Код для вставки на сайт</Typography>
                    <Button size="small" variant="text" disabled={!selected.is_active} onClick={() => void copyText(embedCode)}>
                      Копировать iframe
                    </Button>
                  </Box>
                  <TextField
                    size="small"
                    value={selected.is_active ? embedCode : ''}
                    fullWidth
                    multiline
                    minRows={2}
                    InputProps={{ readOnly: true }}
                  />
                </Stack>
              </Paper>

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="subtitle1">Поля анкеты</Typography>
                <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addField}>
                  Добавить поле
                </Button>
              </Box>

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 220 }}>Поле</TableCell>
                    <TableCell sx={{ width: 190 }}>Тип</TableCell>
                    <TableCell>Валидация</TableCell>
                    <TableCell sx={{ width: 90 }} align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selected.fields.map((field, index) => {
                    const usesOptions = optionFieldTypes.has(field.type);
                    const usesTextValidation = textValidationTypes.has(field.type);
                    const usesNumberValidation = numberValidationTypes.has(field.type);
                    return (
                      <TableRow key={field.id} sx={{ verticalAlign: 'top' }}>
                        <TableCell>
                          <Stack spacing={1}>
                            <TextField
                              label="Название"
                              value={field.label}
                              onChange={(event) => {
                                const label = event.target.value;
                                updateField(field.id, {
                                  label,
                                  key: field.key.startsWith('field_') ? slugify(label, `field_${index + 1}`) : field.key,
                                });
                              }}
                              size="small"
                              required
                            />
                            <TextField
                              label="Ключ"
                              value={field.key}
                              onChange={(event) => updateField(field.id, { key: slugify(event.target.value, `field_${index + 1}`) })}
                              size="small"
                            />
                            <TextField
                              label="Подсказка"
                              value={field.placeholder || ''}
                              onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                              size="small"
                            />
                            <FormControlLabel
                              control={<Switch checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} />}
                              label="Обязательное"
                            />
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" fullWidth>
                            <InputLabel id={`questionnaire-field-type-${field.id}`}>Тип</InputLabel>
                            <Select
                              labelId={`questionnaire-field-type-${field.id}`}
                              label="Тип"
                              value={field.type}
                              onChange={(event) => {
                                const type = event.target.value as StudentQuestionnaireFieldType;
                                updateField(field.id, {
                                  type,
                                  options: optionFieldTypes.has(type) ? field.options.length ? field.options : ['Да', 'Нет'] : [],
                                  validation: {},
                                });
                              }}
                            >
                              {FIELD_TYPES.map((type) => (
                                <MenuItem key={type.value} value={type.value}>
                                  {type.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          {usesOptions && (
                            <TextField
                              label="Варианты"
                              value={field.options.join('\n')}
                              onChange={(event) => setFieldOptions(field.id, event.target.value)}
                              size="small"
                              multiline
                              minRows={3}
                              sx={{ mt: 1 }}
                              fullWidth
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
                            <TextField
                              label="Мин. длина"
                              type="number"
                              value={field.validation.min_length ?? ''}
                              disabled={!usesTextValidation}
                              onChange={(event) => updateField(field.id, { validation: { ...field.validation, min_length: event.target.value === '' ? null : Number(event.target.value) } })}
                              size="small"
                            />
                            <TextField
                              label="Макс. длина"
                              type="number"
                              value={field.validation.max_length ?? ''}
                              disabled={!usesTextValidation}
                              onChange={(event) => updateField(field.id, { validation: { ...field.validation, max_length: event.target.value === '' ? null : Number(event.target.value) } })}
                              size="small"
                            />
                            <TextField
                              label="Мин. значение"
                              type="number"
                              value={field.validation.min ?? ''}
                              disabled={!usesNumberValidation}
                              onChange={(event) => updateField(field.id, { validation: { ...field.validation, min: event.target.value === '' ? null : Number(event.target.value) } })}
                              size="small"
                            />
                            <TextField
                              label="Макс. значение"
                              type="number"
                              value={field.validation.max ?? ''}
                              disabled={!usesNumberValidation}
                              onChange={(event) => updateField(field.id, { validation: { ...field.validation, max: event.target.value === '' ? null : Number(event.target.value) } })}
                              size="small"
                            />
                          </Box>
                          <TextField
                            label="Регулярное выражение"
                            value={field.validation.pattern || ''}
                            disabled={!usesTextValidation}
                            onChange={(event) => updateField(field.id, { validation: { ...field.validation, pattern: event.target.value } })}
                            size="small"
                            fullWidth
                            sx={{ mt: 1 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Удалить поле">
                            <IconButton size="small" color="error" onClick={() => deleteField(field.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {selected.fields.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography color="text.secondary">В анкете пока нет полей.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Stack>
          )}
        </Paper>
      </Box>
    </Stack>
  );
};

export default StudentQuestionnairesSettingsSection;
