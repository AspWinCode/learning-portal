import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
  Grid,
  Chip,
} from '@mui/material';
import { ExpandMore, Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { programsApi } from '../services/api';
import { Program } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface TopicForm {
  name: string;
  description: string;
  final_result: string;
}

interface ModuleForm {
  name: string;
  topics: TopicForm[];
}

type ProgramCreatePayload = {
  name: string;
  modules: Array<{
    name: string;
    order: number;
    topics: Array<{
      name: string;
      description?: string;
      final_result?: string;
      order: number;
    }>;
  }>;
};

const ProgramsPage: React.FC = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [programName, setProgramName] = useState('');
  const [modules, setModules] = useState<ModuleForm[]>([
    {
      name: 'Основной модуль',
      topics: [{ name: '', description: '', final_result: '' }],
    },
  ]);
  const [versionOpen, setVersionOpen] = useState(false);
  const [baseProgram, setBaseProgram] = useState<Program | null>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameProgram, setEditNameProgram] = useState<Program | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [versionModules, setVersionModules] = useState<ModuleForm[]>([
    { name: 'Основной модуль', topics: [{ name: '', description: '', final_result: '' }] },
  ]);
  const { user } = useAuth();
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    try {
      const data = await programsApi.getAll();
      setPrograms(data);
    } catch (err) {
      console.error('Ошибка загрузки программ', err);
    }
  };

  const buildFamilies = () => {
    const byId = new Map<number, Program>();
    programs.forEach((p) => byId.set(p.id, p));

    const rootIdOf = (p: Program): number => {
      const seen = new Set<number>();
      let cur: Program = p;
      while (cur.parent_program_id) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        const parent = byId.get(cur.parent_program_id);
        if (!parent) break;
        cur = parent;
      }
      return cur.id;
    };

    const families = new Map<number, Program[]>();
    programs.forEach((p) => {
      const root = rootIdOf(p);
      const arr = families.get(root) || [];
      arr.push(p);
      families.set(root, arr);
    });

    return Array.from(families.entries())
      .map(([rootId, vers]) => {
        const sorted = vers.slice().sort((a, b) => a.version - b.version);
        return { rootId, versions: sorted, latest: sorted[sorted.length - 1] };
      })
      .sort((a, b) => a.latest.name.localeCompare(b.latest.name, 'ru'));
  };

  const handleAddModule = () => {
    setModules([
      ...modules,
      { name: `Модуль ${modules.length + 1}`, topics: [{ name: '', description: '', final_result: '' }] },
    ]);
  };

  const handleRemoveModule = (moduleIndex: number) => {
    if (modules.length > 1) {
      setModules(modules.filter((_, i) => i !== moduleIndex));
    }
  };

  const handleModuleNameChange = (moduleIndex: number, value: string) => {
    const next = [...modules];
    next[moduleIndex] = { ...next[moduleIndex], name: value };
    setModules(next);
  };

  const handleAddTopic = (moduleIndex: number) => {
    const next = [...modules];
    const module = next[moduleIndex];
    next[moduleIndex] = {
      ...module,
      topics: [...module.topics, { name: '', description: '', final_result: '' }],
    };
    setModules(next);
  };

  const handleRemoveTopic = (moduleIndex: number, topicIndex: number) => {
    const next = [...modules];
    const module = next[moduleIndex];
    if (module.topics.length <= 1) return;
    next[moduleIndex] = {
      ...module,
      topics: module.topics.filter((_, i) => i !== topicIndex),
    };
    setModules(next);
  };

  const handleTopicChange = (
    moduleIndex: number,
    topicIndex: number,
    field: keyof TopicForm,
    value: string
  ) => {
    const next = [...modules];
    const module = next[moduleIndex];
    const topics = [...module.topics];
    topics[topicIndex] = { ...topics[topicIndex], [field]: value };
    next[moduleIndex] = { ...module, topics };
    setModules(next);
  };

  // --- Версия: отдельный state/handlers ---
  const vAddModule = () => {
    setVersionModules([
      ...versionModules,
      { name: `Модуль ${versionModules.length + 1}`, topics: [{ name: '', description: '', final_result: '' }] },
    ]);
  };
  const vRemoveModule = (moduleIndex: number) => {
    if (versionModules.length > 1) setVersionModules(versionModules.filter((_, i) => i !== moduleIndex));
  };
  const vModuleNameChange = (moduleIndex: number, value: string) => {
    const next = [...versionModules];
    next[moduleIndex] = { ...next[moduleIndex], name: value };
    setVersionModules(next);
  };
  const vAddTopic = (moduleIndex: number) => {
    const next = [...versionModules];
    const m = next[moduleIndex];
    next[moduleIndex] = { ...m, topics: [...m.topics, { name: '', description: '', final_result: '' }] };
    setVersionModules(next);
  };
  const vRemoveTopic = (moduleIndex: number, topicIndex: number) => {
    const next = [...versionModules];
    const m = next[moduleIndex];
    if (m.topics.length <= 1) return;
    next[moduleIndex] = { ...m, topics: m.topics.filter((_, i) => i !== topicIndex) };
    setVersionModules(next);
  };
  const vTopicChange = (moduleIndex: number, topicIndex: number, field: keyof TopicForm, value: string) => {
    const next = [...versionModules];
    const m = next[moduleIndex];
    const topics = [...m.topics];
    topics[topicIndex] = { ...topics[topicIndex], [field]: value };
    next[moduleIndex] = { ...m, topics };
    setVersionModules(next);
  };

  const openNewVersionDialog = (p: Program) => {
    setError('');
    setInfo('');
    setBaseProgram(p);
    // копируем текущие модули/темы
    const mapped: ModuleForm[] = (p.modules || []).length
      ? p.modules
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            name: m.name,
            topics: (m.topics || [])
              .sort((a, b) => a.order - b.order)
              .map((t) => ({
                name: t.name,
                description: t.description || '',
                final_result: t.final_result || '',
              })),
          }))
      : [{ name: 'Основной модуль', topics: [{ name: '', description: '', final_result: '' }] }];
    setVersionModules(mapped);
    setVersionOpen(true);
  };

  const handleCreateNewVersion = async () => {
    if (!baseProgram) return;
    if (versionModules.some((m) => !m.name.trim())) {
      setError('Заполните название модуля (в каждом модуле)');
      return;
    }
    const hasAnyTopic = versionModules.some((m) => m.topics.some((t) => t.name.trim()));
    if (!hasAnyTopic) {
      setError('Добавьте хотя бы одну тему');
      return;
    }
    try {
      const payloadModules = versionModules
        .map((m, moduleIndex) => {
          const validTopics = m.topics.filter((t) => t.name.trim());
          return {
            name: m.name.trim(),
            order: moduleIndex,
            topics: validTopics.map((t, topicIndex) => ({
              name: t.name.trim(),
              description: t.description.trim() || undefined,
              final_result: t.final_result.trim() || undefined,
              order: topicIndex,
            })),
          };
        })
        .filter((m) => m.topics.length > 0);

      await programsApi.update(baseProgram.id, { modules: payloadModules });
      setInfo('Создана новая версия программы');
      setVersionOpen(false);
      setBaseProgram(null);
      await loadPrograms();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания новой версии');
    }
  };

  const handleCreate = async () => {
    if (!programName.trim()) {
      setError('Заполните название программы');
      return;
    }

    if (modules.some((m) => !m.name.trim())) {
      setError('Заполните название модуля (в каждом модуле)');
      return;
    }

    const hasAnyTopic = modules.some((m) => m.topics.some((t) => t.name.trim()));
    if (!hasAnyTopic) {
      setError('Добавьте хотя бы одну тему');
      return;
    }

    try {
      const payload: ProgramCreatePayload = {
        name: programName.trim(),
        modules: modules
          .map((m, moduleIndex) => {
            const validTopics = m.topics.filter((t) => t.name.trim());
            return {
              name: m.name.trim(),
              order: moduleIndex,
              topics: validTopics.map((topic, topicIndex) => ({
                name: topic.name.trim(),
                description: topic.description.trim() || undefined,
                final_result: topic.final_result.trim() || undefined,
                order: topicIndex,
              })),
            };
          })
          .filter((m) => m.topics.length > 0),
      };

      await programsApi.create(payload);
      setOpen(false);
      setProgramName('');
      setModules([{ name: 'Основной модуль', topics: [{ name: '', description: '', final_result: '' }] }]);
      setError('');
      setInfo('Программа создана');
      loadPrograms();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания программы');
    }
  };
  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Программы обучения</Typography>
        {isAdminLike && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setProgramName('');
              setModules([{ name: 'Основной модуль', topics: [{ name: '', description: '', final_result: '' }] }]);
            }}
          >
            Создать программу
          </Button>
        )}
      </Box>

      {(error || info) && (
        <Box sx={{ mb: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="success" sx={{ mt: error ? 1 : 0 }} onClose={() => setInfo('')}>
              {info}
            </Alert>
          )}
        </Box>
      )}

      <Box sx={{ mt: 2 }}>
        {buildFamilies().map((family) => (
          <Accordion key={family.rootId} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography>
                    {family.latest.name} (последняя v{family.latest.version})
                  </Typography>
                  {isAdminLike && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditNameProgram(family.latest);
                        setEditNameValue(family.latest.name);
                        setEditNameOpen(true);
                      }}
                      title="Изменить название программы"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Chip size="small" label={`Версий: ${family.versions.length}`} />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {family.versions
                .slice()
                .sort((a, b) => b.version - a.version)
                .map((program) => (
                  <Accordion key={program.id} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography>
                        v{program.version} — {program.status === 'active' ? 'Активна' : 'Архивирована'}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {isAdminLike && (
                        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                          <Button variant="outlined" onClick={() => openNewVersionDialog(program)}>
                            Создать новую версию от v{program.version}
                          </Button>
                        </Box>
                      )}
                      {program.modules.map((module) => (
                        <Box key={module.id} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="h6">{module.name}</Typography>
                              {module.status === 'archived' && <Chip size="small" label="Модуль в архиве" />}
                            </Box>
                            {isAdminLike && module.status !== 'archived' && (
                              <Button
                                size="small"
                                color="warning"
                                onClick={async () => {
                                  try {
                                    await programsApi.archiveModule(program.id, module.id);
                                    setInfo('Модуль архивирован');
                                    loadPrograms();
                                  } catch (err: any) {
                                    setError(err.response?.data?.detail || 'Ошибка архивации модуля');
                                  }
                                }}
                              >
                                Архивировать модуль
                              </Button>
                            )}
                            {isAdminLike && module.status === 'archived' && (
                              <Button
                                size="small"
                                color="success"
                                onClick={async () => {
                                  try {
                                    await programsApi.unarchiveModule(program.id, module.id);
                                    setInfo('Модуль разархивирован');
                                    loadPrograms();
                                  } catch (err: any) {
                                    setError(err.response?.data?.detail || 'Ошибка разархивации модуля');
                                  }
                                }}
                              >
                                Разархивировать модуль
                              </Button>
                            )}
                          </Box>
                          {module.topics.map((topic) => (
                            <Paper key={topic.id} sx={{ p: 1, mt: 1, ml: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                <Typography variant="body2">{topic.name}</Typography>
                                {topic.status === 'archived' && <Chip size="small" label="Архив" />}
                                {isAdminLike && topic.status !== 'archived' && (
                                  <Button
                                    size="small"
                                    color="warning"
                                    onClick={async () => {
                                      try {
                                        await programsApi.archiveTopic(program.id, topic.id);
                                        setInfo('Тема архивирована');
                                        loadPrograms();
                                      } catch (err: any) {
                                        setError(err.response?.data?.detail || 'Ошибка архивации темы');
                                      }
                                    }}
                                  >
                                    Архивировать
                                  </Button>
                                )}
                                {isAdminLike && topic.status === 'archived' && (
                                  <Button
                                    size="small"
                                    color="success"
                                    onClick={async () => {
                                      try {
                                        await programsApi.unarchiveTopic(program.id, topic.id);
                                        setInfo('Тема разархивирована');
                                        loadPrograms();
                                      } catch (err: any) {
                                        setError(err.response?.data?.detail || 'Ошибка разархивации темы');
                                      }
                                    }}
                                  >
                                    Разархивировать
                                  </Button>
                                )}
                              </Box>
                              {topic.description && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Описание: {topic.description}
                                </Typography>
                              )}
                              {topic.final_result && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Результат изучения: {topic.final_result}
                                </Typography>
                              )}
                            </Paper>
                          ))}
                        </Box>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      {/* Диалог создания программы */}
      {isAdminLike && (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Создать программу</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Название программы *"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              sx={{ mt: 2 }}
              required
            />

            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
              Модули и темы программы
            </Typography>

            {modules.map((module, moduleIndex) => (
              <Paper key={moduleIndex} sx={{ p: 2, mb: 2, border: '1px solid #e0e0e0' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">Модуль {moduleIndex + 1}</Typography>
                  {modules.length > 1 && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveModule(moduleIndex)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>

                <TextField
                  fullWidth
                  label="Название модуля *"
                  value={module.name}
                  onChange={(e) => handleModuleNameChange(moduleIndex, e.target.value)}
                  sx={{ mb: 2 }}
                  required
                />

                {module.topics.map((topic, topicIndex) => (
                  <Paper
                    key={`${moduleIndex}-${topicIndex}`}
                    sx={{ p: 2, mb: 2, border: '1px dashed #e0e0e0' }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Тема {topicIndex + 1}</Typography>
                      {module.topics.length > 1 && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveTopic(moduleIndex, topicIndex)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Название темы *"
                          value={topic.name}
                          onChange={(e) => handleTopicChange(moduleIndex, topicIndex, 'name', e.target.value)}
                          required
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Подтема (описание)"
                          value={topic.description}
                          onChange={(e) =>
                            handleTopicChange(moduleIndex, topicIndex, 'description', e.target.value)
                          }
                          multiline
                          rows={2}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Результат изучения темы"
                          value={topic.final_result}
                          onChange={(e) =>
                            handleTopicChange(moduleIndex, topicIndex, 'final_result', e.target.value)
                          }
                          multiline
                          rows={2}
                          helperText="Опишите ожидаемый результат изучения этой темы"
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                ))}

                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddTopic(moduleIndex)}
                >
                  Добавить тему в модуль
                </Button>
              </Paper>
            ))}

            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddModule} sx={{ mt: 1 }}>
              Добавить модуль
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} variant="contained">
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Диалог создания новой версии */}
      {isAdminLike && (
        <Dialog open={versionOpen} onClose={() => setVersionOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            Новая версия: {baseProgram?.name} (текущая v{baseProgram?.version})
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Изменения модулей/тем создают новую версию. Старая версия останется доступной для истории.
            </Typography>

            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
              Модули и темы новой версии
            </Typography>

            {versionModules.map((module, moduleIndex) => (
              <Paper key={moduleIndex} sx={{ p: 2, mb: 2, border: '1px solid #e0e0e0' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">Модуль {moduleIndex + 1}</Typography>
                  {versionModules.length > 1 && (
                    <IconButton size="small" color="error" onClick={() => vRemoveModule(moduleIndex)}>
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>

                <TextField
                  fullWidth
                  label="Название модуля *"
                  value={module.name}
                  onChange={(e) => vModuleNameChange(moduleIndex, e.target.value)}
                  sx={{ mb: 2 }}
                  required
                />

                {module.topics.map((topic, topicIndex) => (
                  <Paper key={`${moduleIndex}-${topicIndex}`} sx={{ p: 2, mb: 2, border: '1px dashed #e0e0e0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Тема {topicIndex + 1}</Typography>
                      {module.topics.length > 1 && (
                        <IconButton size="small" color="error" onClick={() => vRemoveTopic(moduleIndex, topicIndex)}>
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Название темы *"
                          value={topic.name}
                          onChange={(e) => vTopicChange(moduleIndex, topicIndex, 'name', e.target.value)}
                          required
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Подтема (описание)"
                          value={topic.description}
                          onChange={(e) => vTopicChange(moduleIndex, topicIndex, 'description', e.target.value)}
                          multiline
                          rows={2}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Результат изучения темы"
                          value={topic.final_result}
                          onChange={(e) => vTopicChange(moduleIndex, topicIndex, 'final_result', e.target.value)}
                          multiline
                          rows={2}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                ))}

                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => vAddTopic(moduleIndex)}>
                  Добавить тему в модуль
                </Button>
              </Paper>
            ))}

            <Button variant="outlined" startIcon={<AddIcon />} onClick={vAddModule} sx={{ mt: 1 }}>
              Добавить модуль
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setVersionOpen(false)}>Отмена</Button>
            <Button onClick={handleCreateNewVersion} variant="contained">
              Создать новую версию
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Диалог редактирования названия программы (кнопка только у админа, диалог общий) */}
      <Dialog open={editNameOpen} onClose={() => setEditNameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Изменить название программы</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название программы"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditNameOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!editNameProgram || !editNameValue.trim()) return;
              try {
                await programsApi.update(editNameProgram.id, { name: editNameValue.trim() });
                setEditNameOpen(false);
                setEditNameProgram(null);
                setInfo('Название программы обновлено');
                loadPrograms();
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка обновления названия');
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default ProgramsPage;

