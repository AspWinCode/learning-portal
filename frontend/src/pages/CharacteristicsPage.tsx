import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Divider,
  Grid,
  Rating,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Collapse,
  Tooltip,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ChatBubbleOutline as ChatBubbleOutlineIcon } from '@mui/icons-material';
import { characteristicsApi } from '../services/api';
import { Characteristic, CharacteristicTemplate, CharacteristicField, Student } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { studentsApi, programsApi } from '../services/api';

const CharacteristicsPage: React.FC = () => {
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([]);
  const [templates, setTemplates] = useState<CharacteristicTemplate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('Характеристика (стандарт)');
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewShowRaw, setViewShowRaw] = useState(false);
  const [selected, setSelected] = useState<Characteristic | null>(null);
  const [adminComment, setAdminComment] = useState('');

  const [programOptions, setProgramOptions] = useState<Record<number, { id: number; name: string; version: number; status: string }[]>>({});
  const [selectedProgramId, setSelectedProgramId] = useState<number | ''>('');
  const [selectedProgramModules, setSelectedProgramModules] = useState<Array<{ id: number; name: string; status: string }>>([]);

  const [newCharacteristic, setNewCharacteristic] = useState({
    student_id: '',
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    template_id: '',
  });
  const [formData, setFormData] = useState<Record<string, any>>({});

  const { user } = useAuth();

  useEffect(() => {
    loadCharacteristics();
    loadTemplates();
    if (user?.role === 'trainer') {
      loadStudents();
    }
  }, []);

  useEffect(() => {
    // При смене ученика в форме тренера подтягиваем доступные программы (direct + group)
    if (!createOpen) return;
    if (user?.role !== 'trainer') return;
    const sid = parseInt(newCharacteristic.student_id || '');
    if (!sid || Number.isNaN(sid)) return;

    (async () => {
      try {
        const opts = await studentsApi.getProgramOptions(sid);
        setProgramOptions((prev) => ({ ...prev, [sid]: opts }));

        const existingCourse = String(formData.course_name || '').trim();
        const match = existingCourse ? opts.find((p) => `${p.name} (v${p.version})` === existingCourse) : undefined;
        const nextProgramId = match?.id ?? opts[0]?.id ?? '';
        setSelectedProgramId(nextProgramId);
        setSelectedProgramModules([]);

        if (nextProgramId) {
          try {
            const p = await programsApi.getById(nextProgramId);
            setSelectedProgramModules((p.modules || []).map((m) => ({ id: m.id, name: m.name, status: m.status })));
            // В режиме редактирования не перетираем поля, если они уже заполнены
            setFormData((prev) => ({
              ...prev,
              course_name: prev.course_name ? prev.course_name : `${p.name} (v${p.version})`,
              module_topic: prev.module_topic ? prev.module_topic : '',
            }));
          } catch {
            if (!editingId) setFormData((prev) => ({ ...prev, course_name: '', module_topic: '' }));
          }
        } else {
          if (!editingId) setFormData((prev) => ({ ...prev, course_name: '', module_topic: '' }));
        }
      } catch {
        // не блокируем форму, просто оставляем пусто
        setSelectedProgramId('');
        setSelectedProgramModules([]);
      }
    })();
  }, [createOpen, newCharacteristic.student_id, user?.role, editingId, formData.course_name, formData.module_topic]);

  const loadCharacteristics = async () => {
    try {
      const data = await characteristicsApi.getAll();
      setCharacteristics(data);
    } catch (err) {
      console.error('Ошибка загрузки характеристик', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await characteristicsApi.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Ошибка загрузки шаблонов характеристик', err);
    }
  };

  const loadStudents = async () => {
    try {
      const data = await studentsApi.getAll();
      setStudents(data.filter((s) => s.status === 'active'));
    } catch (err) {
      console.error('Ошибка загрузки учеников', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'error';
      case 'draft':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Опубликована';
      case 'pending':
        return 'На согласовании';
      case 'rejected':
        return 'На доработку';
      case 'draft':
        return 'Черновик';
      default:
        return status;
    }
  };

  const selectedTemplate = templates.find((t) => t.id.toString() === newCharacteristic.template_id);

  const validateTrainerForm = (): string | null => {
    if (!newCharacteristic.student_id) return 'Выберите ученика';
    const m = parseInt(newCharacteristic.month);
    if (Number.isNaN(m) || m < 1 || m > 12) return 'Месяц должен быть от 1 до 12';
    const y = parseInt(newCharacteristic.year);
    if (Number.isNaN(y) || y < 2000) return 'Укажите корректный год';
    if (!newCharacteristic.template_id) return 'Выберите шаблон';
    if (selectedTemplate) {
      for (const f of selectedTemplate.fields) {
        if (f.required) {
          const v = formData[f.name];
          if (v === undefined || v === null || String(v).trim() === '') {
            return `Заполните обязательное поле: ${f.label}`;
          }
        }
      }
    }
    return null;
  };

  const buildStandardTemplateFields = (): CharacteristicField[] => {
    const ratingOptions = ['1', '2', '3', '4', '5'];
    return [
      { name: 'section_header', label: 'Информационная шапка', type: 'section' },
      { name: 'course_name', label: 'Курс / программа', type: 'text', required: true },
      { name: 'module_topic', label: 'Модуль / тема', type: 'text', required: true },
      { name: 'learning_period', label: 'Период обучения (доп.)', type: 'text' },

      { name: 'section_hard', label: 'Hard Skills (Программирование)', type: 'section' },
      { name: 'hard_understanding_rating', label: 'Насколько ребенок усвоил материал (1–5)', type: 'select', required: true, options: ratingOptions },
      { name: 'hard_understanding_comment', label: 'Комментарий (Hard Skills)', type: 'textarea' },
      {
        name: 'hard_key_tools',
        label: 'Какие ключевые инструменты освоены (списком)',
        type: 'textarea',
      },
      { name: 'hard_code_quality_rating', label: 'Качество кода (1–5)', type: 'select', options: ratingOptions },
      { name: 'hard_code_quality_comment', label: 'Комментарий (качество кода)', type: 'textarea' },
      {
        name: 'hard_speed',
        label: 'Скорость работы',
        type: 'select',
        options: ['быстрее группы', 'в темпе', 'нуждается в дополнительном времени'],
      },

      { name: 'section_project', label: 'Проектная деятельность', type: 'section' },
      { name: 'project_result', label: 'Результат модуля / проекта (что сделал ребенок)', type: 'textarea', required: true },
      {
        name: 'project_independence',
        label: 'Степень самостоятельности',
        type: 'select',
        required: true,
        options: [
          'делал сам от и до',
          'делал сам, задавал вопросы только по сложным моментам',
          'делал с частой помощью преподавателя',
        ],
      },
      { name: 'project_creativity_rating', label: 'Креативность (1–5)', type: 'select', options: ratingOptions },
      { name: 'project_creativity_comment', label: 'Комментарий (креативность)', type: 'textarea' },

      { name: 'section_soft', label: 'Soft Skills (Навыки личности)', type: 'section' },
      {
        name: 'soft_troubleshooting',
        label: 'Реакция на ошибки (Troubleshooting)',
        type: 'select',
        required: true,
        options: ['сразу зовёт на помощь', 'пытается найти ошибку сам', 'гуглит / ищет решение в справочнике'],
      },
      { name: 'soft_communication_rating', label: 'Коммуникация и командная работа (1–5)', type: 'select', options: ratingOptions },
      { name: 'soft_communication_comment', label: 'Комментарий (коммуникация)', type: 'textarea' },
      { name: 'soft_discipline_rating', label: 'Концентрация и дисциплина (1–5)', type: 'select', options: ratingOptions },
      { name: 'soft_discipline_comment', label: 'Комментарий (дисциплина)', type: 'textarea' },
      { name: 'soft_logic_rating', label: 'Логика / мышление (1–5)', type: 'select', options: ratingOptions },
      { name: 'soft_logic_comment', label: 'Комментарий (логика)', type: 'textarea' },
      { name: 'soft_independence_rating', label: 'Самостоятельность (1–5)', type: 'select', options: ratingOptions },
      { name: 'soft_independence_comment', label: 'Комментарий (самостоятельность)', type: 'textarea' },

      { name: 'section_dynamics', label: 'Динамика и точки роста', type: 'section' },
      { name: 'dynamics_progress', label: 'Главный прогресс (что стало лучше)', type: 'textarea', required: true },
      { name: 'dynamics_growth_zone', label: 'Зона ближайшего развития (что пока даётся тяжело)', type: 'textarea', required: true },

      { name: 'section_reco', label: 'Рекомендации', type: 'section' },
      { name: 'recommendations', label: 'Что делать дальше (рекомендации)', type: 'textarea', required: true },
    ];
  };

  const renderField = (field: CharacteristicField) => {
    const value = formData[field.name] ?? '';
    if (field.type === 'section') {
      return (
        <Box key={field.name} sx={{ mt: 3 }}>
          <Divider sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {field.label}
            </Typography>
          </Divider>
        </Box>
      );
    }
    if (field.type === 'select') {
      return (
        <FormControl fullWidth sx={{ mt: 2 }} key={field.name}>
          <InputLabel>{field.label}{field.required ? ' *' : ''}</InputLabel>
          <Select
            value={value}
            label={field.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
          >
            <MenuItem value="">
              <em>Не выбрано</em>
            </MenuItem>
            {(field.options || []).map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    // Спец-поля: курс/программа и модуль — выбираем из списка (для тренера)
    if (user?.role === 'trainer' && field.name === 'course_name') {
      const sid = parseInt(newCharacteristic.student_id || '');
      const opts = (!Number.isNaN(sid) && sid) ? (programOptions[sid] || []) : [];
      return (
        <FormControl fullWidth sx={{ mt: 2 }} key={field.name} disabled={!opts.length}>
          <InputLabel>{field.label}{field.required ? ' *' : ''}</InputLabel>
          <Select
            value={selectedProgramId}
            label={field.label}
            onChange={async (e) => {
              const pid = Number(e.target.value);
              setSelectedProgramId(pid);
              setFormData((prev) => ({ ...prev, course_name: '', module_topic: '' }));
              try {
                const p = await programsApi.getById(pid);
                setSelectedProgramModules((p.modules || []).map((m) => ({ id: m.id, name: m.name, status: m.status })));
                setFormData((prev) => ({ ...prev, course_name: `${p.name} (v${p.version})` }));
              } catch {
                setSelectedProgramModules([]);
              }
            }}
          >
            {opts.length === 0 ? (
              <MenuItem value="">
                <em>Нет назначенных программ</em>
              </MenuItem>
            ) : (
              opts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} (v{p.version})
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
      );
    }

    if (user?.role === 'trainer' && field.name === 'module_topic') {
      const modules = selectedProgramModules.filter((m) => m.status !== 'archived');
      return (
        <FormControl fullWidth sx={{ mt: 2 }} key={field.name} disabled={!selectedProgramId || !modules.length}>
          <InputLabel>{field.label}{field.required ? ' *' : ''}</InputLabel>
          <Select
            value={value}
            label={field.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
          >
            <MenuItem value="">
              <em>{selectedProgramId ? 'Выберите модуль' : 'Сначала выберите программу'}</em>
            </MenuItem>
            {modules.map((m) => (
              <MenuItem key={m.id} value={m.name}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    return (
      <TextField
        key={field.name}
        fullWidth
        sx={{ mt: 2 }}
        label={`${field.label}${field.required ? ' *' : ''}`}
        type={field.type === 'number' ? 'number' : 'text'}
        multiline={field.type === 'textarea'}
        minRows={field.type === 'textarea' ? 3 : undefined}
        value={value}
        onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
      />
    );
  };

  const pickBestTemplate = (data?: Record<string, any>): CharacteristicTemplate | undefined => {
    if (!data) return templates.find((t) => t.is_active);
    const keys = new Set(Object.keys(data));
    let best: CharacteristicTemplate | undefined = undefined;
    let bestScore = -1;
    for (const t of templates.filter((x) => x.is_active)) {
      const score = (t.fields || []).reduce((acc, f) => acc + (keys.has(f.name) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best || templates.find((t) => t.is_active);
  };

  const renderPrettyValue = (field: CharacteristicField, data: Record<string, any>) => {
    const raw = data[field.name];
    if (raw === undefined || raw === null || raw === '') {
      return <Typography variant="body2" color="text.secondary">—</Typography>;
    }

    const isRating = field.name.endsWith('_rating');
    const asNum = typeof raw === 'number' ? raw : Number(String(raw));
    if (isRating && !Number.isNaN(asNum)) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Rating value={asNum} readOnly />
          <Chip size="small" label={asNum} />
        </Box>
      );
    }

    return (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}
      </Typography>
    );
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Характеристики</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {user?.role === 'admin' && (
            <Button
              variant="contained"
              onClick={() => {
                setError('');
                setInfo('');
                setTemplateName('Характеристика (стандарт)');
                setTemplateOpen(true);
              }}
            >
              Создать форму
            </Button>
          )}
          {user?.role === 'trainer' && (
            <Button
              variant="contained"
              onClick={() => {
                setError('');
                setInfo('');
                setEditingId(null);
                setFormData({});
                setNewCharacteristic({
                  student_id: '',
                  month: String(new Date().getMonth() + 1),
                  year: String(new Date().getFullYear()),
                  template_id: templates[0]?.id?.toString() || '',
                });
                setCreateOpen(true);
              }}
            >
              Создать характеристику
            </Button>
          )}
        </Box>
      </Box>

      {(error || info) && (
        <Box sx={{ mb: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="info" onClose={() => setInfo('')} sx={{ mt: error ? 1 : 0 }}>
              {info}
            </Alert>
          )}
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ученик</TableCell>
              <TableCell>Месяц/Год</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Комментарий</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {characteristics.map((char) => (
              <TableRow key={char.id}>
                <TableCell>{char.student?.full_name || '-'}</TableCell>
                <TableCell>
                  {char.month}/{char.year}
                </TableCell>
                <TableCell>
                  <Chip
                    label={getStatusText(char.status)}
                    color={getStatusColor(char.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {char.admin_comment ? (
                    <Tooltip title={char.admin_comment}>
                      <Chip
                        size="small"
                        icon={<ChatBubbleOutlineIcon />}
                        label="Есть"
                        variant="outlined"
                      />
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={() => {
                      setSelected(char);
                      setViewOpen(true);
                    }}
                    sx={{ mr: 1 }}
                  >
                    Просмотр
                  </Button>

                  {user?.role === 'trainer' && (char.status === 'draft' || char.status === 'rejected') && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setError('');
                        setInfo('');
                        setEditingId(char.id);
                        setFormData(char.data || {});
                        const tpl = pickBestTemplate(char.data);
                        setNewCharacteristic({
                          student_id: String(char.student_id),
                          month: String(char.month),
                          year: String(char.year),
                          template_id: tpl?.id?.toString() || templates[0]?.id?.toString() || '',
                        });
                        setCreateOpen(true);
                      }}
                      sx={{ mr: 1 }}
                    >
                      Редактировать
                    </Button>
                  )}

                  {user?.role === 'trainer' && (char.status === 'draft' || char.status === 'rejected') && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={async () => {
                        try {
                          await characteristicsApi.submit(char.id);
                          setInfo('Характеристика отправлена на согласование');
                          loadCharacteristics();
                        } catch (err: any) {
                          setError(err.response?.data?.detail || 'Ошибка отправки на согласование');
                        }
                      }}
                    >
                      Отправить
                    </Button>
                  )}

                  {user?.role === 'admin' && char.status === 'pending' && (
                    <>
                      <Button
                        size="small"
                        color="success"
                        variant="contained"
                        onClick={() => {
                          setSelected(char);
                          setAdminComment('');
                          setApproveOpen(true);
                        }}
                        sx={{ mr: 1 }}
                      >
                        Опубликовать
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => {
                          setSelected(char);
                          setAdminComment('');
                          setRejectOpen(true);
                        }}
                      >
                        На доработку
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Диалог создания (тренер) */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Редактировать характеристику' : 'Создать характеристику'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Ученик *</InputLabel>
            <Select
              value={newCharacteristic.student_id}
              label="Ученик"
              onChange={(e) => setNewCharacteristic((p) => ({ ...p, student_id: e.target.value }))}
              disabled={!!editingId}
            >
              <MenuItem value="">
                <em>Не выбран</em>
              </MenuItem>
              {students.map((s) => (
                <MenuItem key={s.id} value={s.id.toString()}>
                  {s.full_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField
              fullWidth
              label="Месяц (1-12) *"
              type="number"
              value={newCharacteristic.month}
              onChange={(e) => setNewCharacteristic((p) => ({ ...p, month: e.target.value }))}
              disabled={!!editingId}
            />
            <TextField
              fullWidth
              label="Год *"
              type="number"
              value={newCharacteristic.year}
              onChange={(e) => setNewCharacteristic((p) => ({ ...p, year: e.target.value }))}
              disabled={!!editingId}
            />
          </Box>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Шаблон *</InputLabel>
            <Select
              value={newCharacteristic.template_id}
              label="Шаблон"
              onChange={(e) => {
                setNewCharacteristic((p) => ({ ...p, template_id: e.target.value }));
                setFormData({});
              }}
              disabled={!!editingId}
            >
              <MenuItem value="">
                <em>Не выбран</em>
              </MenuItem>
              {templates.filter((t) => t.is_active).map((t) => (
                <MenuItem key={t.id} value={t.id.toString()}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedTemplate?.fields?.map(renderField)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const v = validateTrainerForm();
              if (v) {
                setError(v);
                return;
              }
              try {
                if (editingId) {
                  await characteristicsApi.update(editingId, { data: formData });
                  setInfo('Изменения сохранены');
                  setCreateOpen(false);
                  setEditingId(null);
                  loadCharacteristics();
                } else {
                  const created = await characteristicsApi.create({
                    student_id: parseInt(newCharacteristic.student_id),
                    month: parseInt(newCharacteristic.month),
                    year: parseInt(newCharacteristic.year),
                    data: formData,
                  } as any);
                  setInfo('Характеристика создана (черновик)');
                  setCreateOpen(false);
                  loadCharacteristics();
                  // сразу выделим созданную
                  setSelected(created);
                }
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка создания характеристики');
              }
            }}
          >
            {editingId ? 'Сохранить изменения' : 'Сохранить черновик'}
          </Button>
          <Button
            variant="outlined"
            onClick={async () => {
              const v = validateTrainerForm();
              if (v) {
                setError(v);
                return;
              }
              try {
                if (editingId) {
                  await characteristicsApi.update(editingId, { data: formData });
                  await characteristicsApi.submit(editingId);
                  setInfo('Характеристика отправлена на согласование');
                  setCreateOpen(false);
                  setEditingId(null);
                  loadCharacteristics();
                } else {
                  const created = await characteristicsApi.create({
                    student_id: parseInt(newCharacteristic.student_id),
                    month: parseInt(newCharacteristic.month),
                    year: parseInt(newCharacteristic.year),
                    data: formData,
                  } as any);
                  await characteristicsApi.submit(created.id);
                  setInfo('Характеристика отправлена на согласование');
                  setCreateOpen(false);
                  loadCharacteristics();
                }
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка отправки на согласование');
              }
            }}
          >
            {editingId ? 'Сохранить и отправить' : 'Сохранить и отправить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог создания шаблона (админ) */}
      <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать форму (шаблон)</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 2 }}>
            Будет создан шаблон по структуре: шапка → Hard Skills → Проект → Soft Skills → Динамика → Рекомендации.
          </Alert>
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Название шаблона"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!templateName.trim()) {
                setError('Введите название шаблона');
                return;
              }
              try {
                await characteristicsApi.createTemplate({
                  name: templateName.trim(),
                  fields: buildStandardTemplateFields(),
                });
                setInfo('Шаблон формы создан');
                setTemplateOpen(false);
                await loadTemplates();
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка создания шаблона');
              }
            }}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог просмотра */}
      <Dialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Характеристика</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Ученик: {selected?.student?.full_name || selected?.student_id || '—'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Период: {selected?.month}/{selected?.year}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Статус: {selected ? getStatusText(selected.status) : '—'}
          </Typography>
          {selected?.admin_comment && (
            <Alert severity={selected.status === 'rejected' ? 'error' : 'info'} sx={{ mt: 2 }}>
              Комментарий администратора: {selected.admin_comment}
            </Alert>
          )}

          {(() => {
            const data = selected?.data || {};
            const tpl = pickBestTemplate(selected?.data);
            if (!tpl) {
              return (
                <Paper sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                    Данные
                  </Typography>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
                </Paper>
              );
            }

            const fields = tpl.fields || [];
            return (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Форма: {tpl.name}
                </Typography>

                <Paper sx={{ p: 2, mt: 1 }}>
                  <Grid container spacing={2}>
                    {fields.map((f) => {
                      if (f.type === 'section') {
                        return (
                          <Grid item xs={12} key={f.name}>
                            <Divider sx={{ my: 1 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                {f.label}
                              </Typography>
                            </Divider>
                          </Grid>
                        );
                      }

                      const span = f.type === 'textarea' ? 12 : 6;
                      return (
                        <Grid item xs={12} md={span} key={f.name}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {f.label}{f.required ? ' *' : ''}
                          </Typography>
                          {renderPrettyValue(f, data)}
                        </Grid>
                      );
                    })}
                  </Grid>
                </Paper>

                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    variant="text"
                    endIcon={<ExpandMoreIcon />}
                    onClick={() => setViewShowRaw((v) => !v)}
                  >
                    Тех. данные (JSON)
                  </Button>
                  <Collapse in={viewShowRaw}>
                    <Paper sx={{ p: 2, mt: 1 }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
                    </Paper>
                  </Collapse>
                </Box>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setViewOpen(false);
              setViewShowRaw(false);
            }}
          >
            Закрыть
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог approve (админ) */}
      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Опубликовать характеристику</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Комментарий (необязательно)"
            value={adminComment}
            onChange={(e) => setAdminComment(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            color="success"
            onClick={async () => {
              if (!selected) return;
              try {
                await characteristicsApi.approve(selected.id, adminComment.trim() || undefined);
                setInfo('Характеристика опубликована');
                setApproveOpen(false);
                loadCharacteristics();
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка публикации');
              }
            }}
          >
            Опубликовать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог reject (админ) */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Вернуть на доработку</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Комментарий (обязательно)"
            value={adminComment}
            onChange={(e) => setAdminComment(e.target.value)}
            sx={{ mt: 2 }}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              if (!selected) return;
              if (!adminComment.trim()) {
                setError('Комментарий обязателен при возврате на доработку');
                return;
              }
              try {
                await characteristicsApi.reject(selected.id, adminComment.trim());
                setInfo('Характеристика возвращена на доработку');
                setRejectOpen(false);
                loadCharacteristics();
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка отклонения');
              }
            }}
          >
            Вернуть
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default CharacteristicsPage;

