import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, Lock as LockIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import OwnerWorkspaceSettingsSection from '../components/ownerWorkspace/OwnerWorkspaceSettingsSection';
import PwaSettingsSection from '../components/PwaSettingsSection';
import StudentQuestionnairesSettingsSection from '../components/StudentQuestionnairesSettingsSection';
import { useAuth } from '../contexts/AuthContext';
import { PersonRegistryContent } from './PersonRegistryPage';
import { ProgramMakeupContent } from './SalesProgramMakeupPage';
import { abonementsApi, campaignsApi, financeApi, maxApi, salesApi, settingsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';
import { transliterate } from '../utils/transliterate';
import {
  Abonement,
  ABONEMENT_FORMAT_LABELS,
  AbonementFormat,
  AccountTemplate,
  LeadInfoTemplate,
  LeadSource,
  LeadStatus,
  LeadStatusOption,
  LeadTaskStatusOption,
  LeadTaskTemplate,
  SalesCity,
  SalesSchool,
  SalesClass,
  CampaignDictionaryItem,
  CampaignSettings,
  FinanceModelTemplate,
  FinanceTemplateArticleNode,
  FinanceTemplateMetric,
} from '../types';

const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: 'Закрыт',
  thinking: 'Подумают',
  refused: 'Отказали',
  trial_scheduled: 'Записали на пробное',
  event_registered: 'Записали на мероприятие',
  decided_immediately: 'Решил сразу',
};

const SalesSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [templates, setTemplates] = useState<LeadTaskTemplate[]>([]);
  const [statuses, setStatuses] = useState<LeadTaskStatusOption[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<LeadStatusOption[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [newSource, setNewSource] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newStatusClosed, setNewStatusClosed] = useState(false);
  const [newLeadStatus, setNewLeadStatus] = useState('');
  const [newLeadStatusBase, setNewLeadStatusBase] = useState<LeadStatus>('new');
  const [newInfoTemplateName, setNewInfoTemplateName] = useState('');
  const [newInfoTemplateBody, setNewInfoTemplateBody] = useState('');
  const [cities, setCities] = useState<SalesCity[]>([]);
  const [newCity, setNewCity] = useState('');
  const [schools, setSchools] = useState<SalesSchool[]>([]);
  const [searchParams] = useSearchParams();
  const [settingsTab, setSettingsTab] = useState(searchParams.get('tab') || 'schools');
  const canAccessPersons = hasPermission(user, 'persons.access');
  const [newSchool, setNewSchool] = useState({
    name: '',
    city: '',
    district: '',
    director: '',
    email: '',
    address: '',
    phone: '',
  });
  const [schoolImportFile, setSchoolImportFile] = useState<File | null>(null);
  const [schoolImportResult, setSchoolImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [classes, setClasses] = useState<SalesClass[]>([]);
  const [newClass, setNewClass] = useState('');
  const [tochkaDateFrom, setTochkaDateFrom] = useState('');
  const [tochkaDateTo, setTochkaDateTo] = useState('');
  const [tochkaImportLoading, setTochkaImportLoading] = useState(false);
  const [tochkaImportResult, setTochkaImportResult] = useState<{
    applied: Array<{ payer_name: string; amount: number; date: string; student_name?: string }>;
    no_match: Array<{ payer_name: string; amount: number; date: string }>;
    ambiguous: Array<{ payer_name: string; amount: number; date: string; candidates?: Array<{ student_name?: string; parent_full_name?: string }> }>;
  } | null>(null);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [newAbonement, setNewAbonement] = useState<{
    name: string;
    price: number | '';
    abonement_format: '' | AbonementFormat;
  }>({ name: '', price: '', abonement_format: '' });
  const [accountTemplates, setAccountTemplates] = useState<AccountTemplate[]>([]);
  const [newAccountTemplate, setNewAccountTemplate] = useState<{ name: string; format: '' | 'group' | 'individual' }>({
    name: '',
    format: '',
  });
  const [importAccounts, setImportAccounts] = useState<Array<{ id: number; code: string; name: string; owner_scope: string }>>([]);
  const [newImportAccount, setNewImportAccount] = useState({ name: '', code: '' });
  const [financeTargets, setFinanceTargets] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [newFinanceTarget, setNewFinanceTarget] = useState({ name: '', code: '' });
  const [financeTemplates, setFinanceTemplates] = useState<FinanceModelTemplate[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FinanceModelTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [templateArticles, setTemplateArticles] = useState<FinanceTemplateArticleNode[]>([]);
  const [templateMetrics, setTemplateMetrics] = useState<FinanceTemplateMetric[]>([]);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticlePath, setEditingArticlePath] = useState<number[] | null>(null);
  const [articleName, setArticleName] = useState('');
  const [articleCode, setArticleCode] = useState('');
  const [articleDirection, setArticleDirection] = useState<'income' | 'expense'>('expense');
  const [articleParentPath, setArticleParentPath] = useState<number[] | null>(null);
  const articleCodeUserEdited = useRef(false);
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [editingMetricIndex, setEditingMetricIndex] = useState<number | null>(null);
  const [metricName, setMetricName] = useState('');
  const [metricFormula, setMetricFormula] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [b2bDistricts, setB2bDistricts] = useState<string[]>([]);
  const [newDistrict, setNewDistrict] = useState('');
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings | null>(null);
  const [newCampaignSetting, setNewCampaignSetting] = useState({
    types: '',
    formats: '',
    scales: '',
  });
  const [refusedReasons, setRefusedReasons] = useState<string[]>([]);
  const [newRefusedReason, setNewRefusedReason] = useState('');
  const [maxPersonalConfigured, setMaxPersonalConfigured] = useState(false);
  const [maxPersonalProvider, setMaxPersonalProvider] = useState<'greenapi' | 'api_messenger' | null>(null);
  const [maxQrImg, setMaxQrImg] = useState<string | null>(null);
  const [maxQrLoading, setMaxQrLoading] = useState(false);

  const loadData = async () => {
    const errors: string[] = [];
    const load = async <T,>(name: string, fn: () => Promise<T>, setter: (v: T) => void) => {
      try {
        const data = await fn();
        setter(data);
      } catch (err: any) {
        const msg = extractApiError(err, 'Ошибка загрузки');
        errors.push(`${name}: ${msg}`);
      }
    };
    await Promise.all([
      load('Шаблоны инфо', () => salesApi.listLeadInfoTemplates(false), setInfoTemplates),
      load('Источники лида', () => salesApi.listLeadSources(false), setSources),
      load('Шаблоны задач', () => salesApi.listLeadTaskTemplates(false), setTemplates),
      load('Статусы задач', () => salesApi.listLeadTaskStatuses(false), setStatuses),
      load('Статусы лида', () => salesApi.listLeadStatuses(false), setLeadStatuses),
      load('Города', () => salesApi.listSalesCities(false), setCities),
      load('Школы', () => salesApi.listSalesSchools(false), setSchools),
      load('Классы', () => salesApi.listSalesClasses(false), setClasses),
      load('Абонементы', () => abonementsApi.getAll({ status_filter: 'active' }), setAbonements),
      load('Шаблоны счетов', () => salesApi.listAccountTemplates(), setAccountTemplates),
      load('Счета для импорта', () => financeApi.listAccounts(), setImportAccounts),
      load('Проекты (финансы)', () => financeApi.listTargets(), setFinanceTargets),
      load('Шаблоны финансовых моделей', () => financeApi.listModelTemplates(), setFinanceTemplates),
      load('Районы B2B', async () => (await settingsApi.getB2BDistricts()).items, setB2bDistricts),
      load('Работа со школами', () => campaignsApi.getSettings(), setCampaignSettings),
      load('Причины отказа', async () => (await settingsApi.getRefusedReasons()).items, setRefusedReasons),
    ]);
    maxApi.isConfigured().then((r) => {
      setMaxPersonalConfigured(!!r.personal);
      setMaxPersonalProvider(r.personal_provider ?? null);
    }).catch(() => setMaxPersonalConfigured(false));
    if (errors.length) {
      const hint = errors.some((e) => e.includes('Not Found') || e.includes('404'))
        ? ' Убедитесь, что на сервере выполнен deploy и миграции (alembic upgrade head).'
        : '';
      setError(errors.join(' ') + hint);
    } else {
      setError('');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const nextTab = searchParams.get('tab') || 'schools';
    setSettingsTab(nextTab === 'persons' && !canAccessPersons ? 'schools' : nextTab);
  }, [canAccessPersons, searchParams]);

  const safeAction = async (fn: () => Promise<any>) => {
    try {
      await fn();
      setError('');
      await loadData();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка сохранения'));
    }
  };

  const countArticles = (nodes: FinanceTemplateArticleNode[]): number =>
    nodes.reduce((sum, n) => sum + 1 + countArticles(n.children || []), 0);

  const getNodeByPath = (nodes: FinanceTemplateArticleNode[], path: number[]): FinanceTemplateArticleNode | null => {
    if (path.length === 0) return null;
    const node = nodes[path[0]];
    if (!node) return null;
    if (path.length === 1) return node;
    return getNodeByPath(node.children || [], path.slice(1));
  };

  const flattenArticleNodes = (
    nodes: FinanceTemplateArticleNode[],
    path: number[] = [],
    level = 0
  ): Array<FinanceTemplateArticleNode & { path: number[]; level: number }> =>
    nodes.flatMap((node, i) => [
      { ...node, path: [...path, i], level },
      ...flattenArticleNodes(node.children || [], [...path, i], level + 1),
    ]);

  const updateNodeAtPath = (
    nodes: FinanceTemplateArticleNode[],
    path: number[],
    updater: (n: FinanceTemplateArticleNode) => FinanceTemplateArticleNode
  ): FinanceTemplateArticleNode[] => {
    if (path.length === 0) return nodes;
    return nodes.map((n, i) => {
      if (i !== path[0]) return n;
      if (path.length === 1) return updater(n);
      return { ...n, children: updateNodeAtPath(n.children || [], path.slice(1), updater) };
    });
  };

  const deleteNodeAtPath = (nodes: FinanceTemplateArticleNode[], path: number[]): FinanceTemplateArticleNode[] => {
    if (path.length === 1) return nodes.filter((_, i) => i !== path[0]);
    return nodes.map((n, i) => {
      if (i !== path[0]) return n;
      return { ...n, children: deleteNodeAtPath(n.children || [], path.slice(1)) };
    });
  };

  const addNodeAtPath = (
    nodes: FinanceTemplateArticleNode[],
    parentPath: number[] | null,
    node: FinanceTemplateArticleNode
  ): FinanceTemplateArticleNode[] => {
    if (!parentPath || parentPath.length === 0) return [...nodes, node];
    return nodes.map((n, i) => {
      if (i !== parentPath[0]) return n;
      if (parentPath.length === 1) return { ...n, children: [...(n.children || []), node] };
      return { ...n, children: addNodeAtPath(n.children || [], parentPath.slice(1), node) };
    });
  };

  const openAddArticle = (parentPath: number[] | null) => {
    setEditingArticlePath(null);
    setArticleParentPath(parentPath);
    setArticleName('');
    setArticleCode('');
    articleCodeUserEdited.current = false;
    const parentNode = parentPath ? getNodeByPath(templateArticles, parentPath) : null;
    setArticleDirection((parentNode?.direction === 'income' ? 'income' : 'expense') as 'income' | 'expense');
    setArticleDialogOpen(true);
  };

  const openEditArticle = (path: number[]) => {
    const node = getNodeByPath(templateArticles, path);
    if (!node) return;
    setEditingArticlePath(path);
    setArticleParentPath(null);
    setArticleName(node.name);
    setArticleCode(node.code || '');
    articleCodeUserEdited.current = true;
    setArticleDirection(node.direction === 'income' ? 'income' : 'expense');
    setArticleDialogOpen(true);
  };

  const saveArticleNode = () => {
    const node: FinanceTemplateArticleNode = {
      code: articleCode.trim() || articleName.trim().toLowerCase().replace(/\s+/g, '_'),
      name: articleName.trim(),
      direction: articleDirection,
    };
    if (editingArticlePath) {
      setTemplateArticles((prev) => updateNodeAtPath(prev, editingArticlePath, (old) => ({ ...old, ...node })));
    } else {
      setTemplateArticles((prev) => addNodeAtPath(prev, articleParentPath, { ...node, children: [] }));
    }
    setArticleDialogOpen(false);
  };

  const openAddMetric = () => {
    setEditingMetricIndex(null);
    setMetricName('');
    setMetricFormula('');
    setMetricUnit('');
    setMetricDialogOpen(true);
  };

  const openEditMetric = (index: number) => {
    const m = templateMetrics[index];
    setEditingMetricIndex(index);
    setMetricName(m.name);
    setMetricFormula(m.formula);
    setMetricUnit(m.unit || '');
    setMetricDialogOpen(true);
  };

  const saveMetricItem = () => {
    const metric: FinanceTemplateMetric = { name: metricName.trim(), formula: metricFormula.trim(), unit: metricUnit.trim() || undefined };
    if (editingMetricIndex !== null) {
      setTemplateMetrics((prev) => prev.map((m, i) => (i === editingMetricIndex ? metric : m)));
    } else {
      setTemplateMetrics((prev) => [...prev, metric]);
    }
    setMetricDialogOpen(false);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      let saved: FinanceModelTemplate;
      if (editingTemplate) {
        saved = await financeApi.updateModelTemplate(editingTemplate.id, {
          name: templateName.trim(),
          articles: templateArticles,
          metrics: templateMetrics,
        });
        setFinanceTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        const key = templateKey.trim() || templateName.trim().toLowerCase().replace(/\s+/g, '_');
        saved = await financeApi.createModelTemplate({
          key,
          name: templateName.trim(),
          articles: templateArticles,
          metrics: templateMetrics,
        });
        setFinanceTemplates((prev) => [...prev, saved]);
      }
      setTemplateDialogOpen(false);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить шаблон'));
    }
  };

  const isEmailValid = (email: string) => !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const sectionPaperSx = (section: string) => ({ p: 2, display: settingsTab === section ? 'block' : 'none' });
  const campaignSettingTitles: Record<'types' | 'formats' | 'scales', string> = {
    types: 'Тип кампании',
    formats: 'Формат кампании',
    scales: 'Масштаб',
  };

  const createCampaignSettingItem = (category: 'types' | 'formats' | 'scales') =>
    safeAction(async () => {
      const label = newCampaignSetting[category].trim();
      if (!label) return;
      await campaignsApi.createSettingItem(category, label);
      setNewCampaignSetting((prev) => ({ ...prev, [category]: '' }));
    });

  const renderCampaignSettingBlock = (
    category: 'types' | 'formats' | 'scales',
    items: CampaignDictionaryItem[] = []
  ) => (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" mb={1}>{campaignSettingTitles[category]}</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label={`Новый пункт: ${campaignSettingTitles[category]}`}
          value={newCampaignSetting[category]}
          onChange={(e) => setNewCampaignSetting((prev) => ({ ...prev, [category]: e.target.value }))}
          sx={{ minWidth: 280 }}
        />
        <Button variant="contained" onClick={() => createCampaignSettingItem(category)}>
          Добавить
        </Button>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Название</TableCell>
            <TableCell>Активен</TableCell>
            <TableCell align="right">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.label}</TableCell>
              <TableCell>
                <Switch
                  checked={item.is_active}
                  onChange={(e) => safeAction(() => campaignsApi.updateSettingItem(category, item.id, { is_active: e.target.checked }))}
                />
              </TableCell>
              <TableCell align="right">
                <Button color="error" onClick={() => safeAction(() => campaignsApi.deleteSettingItem(category, item.id))}>
                  Удалить
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

  const createSchool = () =>
    safeAction(async () => {
      const name = newSchool.name.trim();
      if (!name) return;
      if (!isEmailValid(newSchool.email)) {
        setError('Введите корректную почту школы.');
        return;
      }
      await salesApi.createSalesSchool({
        name,
        city: newSchool.city.trim() || null,
        district: newSchool.district.trim() || null,
        director: newSchool.director.trim() || null,
        email: newSchool.email.trim() || null,
        address: newSchool.address.trim() || null,
        phone: newSchool.phone.trim() || null,
      });
      setNewSchool({ name: '', city: '', district: '', director: '', email: '', address: '', phone: '' });
      setSchoolImportResult(null);
    });

  const importSchools = async () => {
    if (!schoolImportFile) return;
    try {
      const result = await salesApi.importSalesSchools(schoolImportFile);
      setSchoolImportResult(result);
      setSchoolImportFile(null);
      setError('');
      await loadData();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось импортировать школы'));
    }
  };

  const exportSchools = async () => {
    try {
      const blob = await salesApi.exportSalesSchools();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'schools.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось экспортировать школы'));
    }
  };

  return (
    <Layout>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={settingsTab}
          onChange={(_, value) => {
            setSettingsTab(value);
            navigate(`/admin/settings?tab=${value}`, { replace: true });
          }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="schools" label="Школы" />
          <Tab value="questionnaires" label="Анкеты" />
          <Tab value="cities" label="Города" />
          <Tab value="classes" label="Классы" />
          <Tab value="b2b" label="Районы" />
          <Tab value="schoolWork" label="Работа со школами" />
          <Tab value="finance" label="Финансы" />
          <Tab value="leads" label="Лиды" />
          <Tab value="tasks" label="Задачи" />
          <Tab value="ownerWorkspace" label="Таск трекер" />
          <Tab value="pwa" label="PWA" />
          {canAccessPersons ? <Tab value="persons" label="Реестр Person" /> : null}
          <Tab value="templates" label="Шаблоны" />
          <Tab value="integrations" label="Интеграции" />
          <Tab value="programMakeup" label="Совместимость отработок" />
        </Tabs>
      </Paper>

      <Stack spacing={2}>
        <Paper sx={sectionPaperSx('cities')}>
          <Typography variant="h6" mb={1}>Города</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новый город "
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newCity.trim()) return;
                await salesApi.createSalesCity(newCity.trim());
                setNewCity('');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cities.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateSalesCity(c.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {canAccessPersons ? (
          <Paper sx={sectionPaperSx('persons')}>
            <PersonRegistryContent personPathBase="/admin/settings?tab=persons" />
          </Paper>
        ) : null}

        <Paper sx={sectionPaperSx('pwa')}>
          <PwaSettingsSection />
        </Paper>

        <Paper sx={sectionPaperSx('questionnaires')}>
          <StudentQuestionnairesSettingsSection />
        </Paper>

        <Paper sx={sectionPaperSx('leads')}>
          <Typography variant="h6" mb={1}>Причины отказа (этап «Отказали»)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Справочник причин отказа, которые выбираются в попапе при переносе лида на этап «Отказали».
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новая причина отказа"
              value={newRefusedReason}
              onChange={(e) => setNewRefusedReason(e.target.value)}
              sx={{ minWidth: 260 }}
            />
            <Button
              variant="contained"
              onClick={() =>
                safeAction(async () => {
                  const name = newRefusedReason.trim();
                  if (!name) return;
                  const items = Array.from(new Set([...refusedReasons, name]));
                  const res = await settingsApi.setRefusedReasons(items);
                  setRefusedReasons(res.items);
                  setNewRefusedReason('');
                })
              }
            >
              Добавить
            </Button>
          </Box>
          {refusedReasons.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Пока нет ни одной причины. В этом случае в попапе используется встроенный список по умолчанию.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Причина</TableCell>
                  <TableCell width={120} />
                </TableRow>
              </TableHead>
              <TableBody>
                {refusedReasons.map((reason) => (
                  <TableRow key={reason}>
                    <TableCell>{reason}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        onClick={() =>
                          safeAction(async () => {
                            const next = refusedReasons.filter((x) => x !== reason);
                            const res = await settingsApi.setRefusedReasons(next);
                            setRefusedReasons(res.items);
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper sx={sectionPaperSx('schools')}>
          <Typography variant="h6" mb={1}>Школы</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новая школа"
              value={newSchool.name}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, name: e.target.value }))}
            />
            <TextField
              size="small"
              label="Город"
              value={newSchool.city}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, city: e.target.value }))}
            />
            <TextField
              size="small"
              label="Район"
              value={newSchool.district}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, district: e.target.value }))}
            />
            <TextField
              size="small"
              label="Директор/ИО"
              value={newSchool.director}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, director: e.target.value }))}
            />
            <TextField
              size="small"
              label="Почта"
              type="email"
              value={newSchool.email}
              error={!isEmailValid(newSchool.email)}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, email: e.target.value }))}
            />
            <TextField
              size="small"
              label="Адрес"
              value={newSchool.address}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, address: e.target.value }))}
            />
            <TextField
              size="small"
              label="Телефон"
              value={newSchool.phone}
              onChange={(e) => setNewSchool((prev) => ({ ...prev, phone: e.target.value }))}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newSchool.name.trim()) return;
                if (!isEmailValid(newSchool.email)) {
                  setError('Введите корректную почту школы.');
                  return;
                }
                await salesApi.createSalesSchool({
                  name: newSchool.name.trim(),
                  city: newSchool.city.trim() || null,
                  district: newSchool.district.trim() || null,
                  director: newSchool.director.trim() || null,
                  email: newSchool.email.trim() || null,
                  address: newSchool.address.trim() || null,
                  phone: newSchool.phone.trim() || null,
                });
                setNewSchool({ name: '', city: '', district: '', director: '', email: '', address: '', phone: '' });
              })}
            >
              Добавить
            </Button>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
            <Button variant="outlined" component="label">
              Импорт CSV/XLSX
              <input
                hidden
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setSchoolImportFile(e.target.files?.[0] ?? null)}
              />
            </Button>
            <Button variant="outlined" onClick={importSchools} disabled={!schoolImportFile}>
              Загрузить
            </Button>
            <Button variant="outlined" onClick={exportSchools}>
              Экспорт CSV
            </Button>
            {schoolImportFile && (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {schoolImportFile.name}
              </Typography>
            )}
          </Stack>
          {schoolImportResult && (
            <Alert severity={schoolImportResult.errors.length ? 'warning' : 'success'} sx={{ mb: 1 }}>
              Создано: {schoolImportResult.created}. Обновлено: {schoolImportResult.updated}. Пропущено: {schoolImportResult.skipped}.
              {schoolImportResult.errors.length > 0 && ` Ошибки: ${schoolImportResult.errors.join('; ')}`}
            </Alert>
          )}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Город</TableCell>
                <TableCell>Район</TableCell>
                <TableCell>Директор/ИО директора</TableCell>
                <TableCell>Почта</TableCell>
                <TableCell>Адрес</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Активна</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schools.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{s.city || '—'}</TableCell>
                  <TableCell>{s.district || '—'}</TableCell>
                  <TableCell>{s.director || '—'}</TableCell>
                  <TableCell>{s.email || '—'}</TableCell>
                  <TableCell>{s.address || '—'}</TableCell>
                  <TableCell>{s.phone || '—'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateSalesSchool(s.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('classes')}>
          <Typography variant="h6" mb={1}>Классы</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Справочник классов для выбора при создании/редактировании лидов (например: 1, 2, 7А, 10Б).
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новый класс"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newClass.trim()) return;
                await salesApi.createSalesClass(newClass.trim());
                setNewClass('');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {classes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateSalesClass(c.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('b2b')}>
          <Typography variant="h6" mb={1}>Районы (B2B)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Список районов для выбора во вкладке «Новая B2B школа».
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новый район"
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() =>
                safeAction(async () => {
                  const name = newDistrict.trim();
                  if (!name) return;
                  const items = Array.from(new Set([name, ...b2bDistricts]));
                  const res = await settingsApi.setB2BDistricts(items);
                  setB2bDistricts(res.items);
                  setNewDistrict('');
                })
              }
            >
              Добавить
            </Button>
          </Box>
          {b2bDistricts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Пока нет ни одного района.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название района</TableCell>
                  <TableCell width={120} />
                </TableRow>
              </TableHead>
              <TableBody>
                {b2bDistricts.map((d) => (
                  <TableRow key={d}>
                    <TableCell>{d}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        onClick={() =>
                          safeAction(async () => {
                            const next = b2bDistricts.filter((x) => x !== d);
                            const res = await settingsApi.setB2BDistricts(next);
                            setB2bDistricts(res.items);
                          })
                        }
                      >
                        Удалить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper sx={sectionPaperSx('schoolWork')}>
          <Typography variant="h6" mb={1}>Работа со школами</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Справочники для создания кампаний на странице «Работа со школами».
          </Typography>
          <Stack spacing={2}>
            {renderCampaignSettingBlock('types', campaignSettings?.types)}
            {renderCampaignSettingBlock('formats', campaignSettings?.formats)}
            {renderCampaignSettingBlock('scales', campaignSettings?.scales)}
          </Stack>
        </Paper>

        <Paper sx={sectionPaperSx('finance')}>
          <Typography variant="h6" mb={1}>Абонементы для счетов</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Здесь можно завести типовые абонементы, которые потом будут использоваться при создании счетов ученика.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Наименование абонемента"
              value={newAbonement.name}
              onChange={(e) => setNewAbonement((prev) => ({ ...prev, name: e.target.value }))}
              sx={{ flex: 2 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Формат абонемента</InputLabel>
              <Select
                label="Формат абонемента"
                value={newAbonement.abonement_format}
                onChange={(e) =>
                  setNewAbonement((prev) => ({
                    ...prev,
                    abonement_format: (e.target.value || '') as '' | AbonementFormat,
                  }))
                }
              >
                <MenuItem value="">Не указан</MenuItem>
                <MenuItem value="individual">{ABONEMENT_FORMAT_LABELS.individual}</MenuItem>
                <MenuItem value="package">{ABONEMENT_FORMAT_LABELS.package}</MenuItem>
                <MenuItem value="group">{ABONEMENT_FORMAT_LABELS.group}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Сумма (₽)"
              type="number"
              value={newAbonement.price}
              onChange={(e) =>
                setNewAbonement((prev) => ({
                  ...prev,
                  price: e.target.value === '' ? '' : Number(e.target.value),
                }))
              }
              sx={{ flex: 1 }}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                safeAction(async () => {
                  if (!newAbonement.name.trim()) return;
                  await abonementsApi.create({
                    name: newAbonement.name.trim(),
                    price: newAbonement.price === '' ? 0 : Number(newAbonement.price),
                    discount_type: 'none',
                    discount_value: 0,
                    abonement_format: newAbonement.abonement_format || undefined,
                  });
                  setNewAbonement({ name: '', price: '', abonement_format: '' });
                })
              }
            >
              Создать
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Наименование</TableCell>
                <TableCell>Формат</TableCell>
                <TableCell>Сумма</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {abonements.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.abonement_format ? ABONEMENT_FORMAT_LABELS[a.abonement_format] : '—'}</TableCell>
                  <TableCell>{a.price.toFixed(2)} ₽</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('finance')}>
          <Typography variant="h6" mb={1}>Шаблоны счетов</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Название и формат счёта (Групповой / Индивидуальный) для использования при создании счетов учеников.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Название счёта"
              value={newAccountTemplate.name}
              onChange={(e) => setNewAccountTemplate((prev) => ({ ...prev, name: e.target.value }))}
              sx={{ flex: 2 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Формат счёта</InputLabel>
              <Select
                label="Формат счёта"
                value={newAccountTemplate.format}
                onChange={(e) =>
                  setNewAccountTemplate((prev) => ({
                    ...prev,
                    format: (e.target.value || '') as '' | 'group' | 'individual',
                  }))
                }
              >
                <MenuItem value="">Не выбран</MenuItem>
                <MenuItem value="group">Групповой</MenuItem>
                <MenuItem value="individual">Индивидуальный</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                safeAction(async () => {
                  if (!newAccountTemplate.name.trim() || !newAccountTemplate.format) return;
                  await salesApi.createAccountTemplate({
                    name: newAccountTemplate.name.trim(),
                    format: newAccountTemplate.format,
                  });
                  setNewAccountTemplate({ name: '', format: '' });
                })
              }
              disabled={!newAccountTemplate.name.trim() || !newAccountTemplate.format}
            >
              Создать
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название счёта</TableCell>
                <TableCell>Формат</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accountTemplates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.format === 'group' ? 'Групповой' : 'Индивидуальный'}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      onClick={() => safeAction(() => salesApi.deleteAccountTemplate(t.id))}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('finance')}>
          <Typography variant="h6" mb={1}>Проекты</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Проекты (цели) для разбивки операций в журнале и ручных записях.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Название проекта"
              value={newFinanceTarget.name}
              onChange={(e) => setNewFinanceTarget((prev) => ({ ...prev, name: e.target.value }))}
              sx={{ flex: 2 }}
            />
            <TextField
              size="small"
              label="Код (латиница, без пробелов)"
              value={newFinanceTarget.code}
              onChange={(e) => setNewFinanceTarget((prev) => ({ ...prev, code: e.target.value }))}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!newFinanceTarget.name.trim() || !newFinanceTarget.code.trim()}
              onClick={() =>
                safeAction(async () => {
                  if (!newFinanceTarget.name.trim() || !newFinanceTarget.code.trim()) return;
                  await financeApi.createTarget({
                    name: newFinanceTarget.name.trim(),
                    code: newFinanceTarget.code.trim(),
                  });
                  setNewFinanceTarget({ name: '', code: '' });
                })
              }
            >
              Создать
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Код</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {financeTargets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.code}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      onClick={() => safeAction(() => financeApi.deleteTarget(t.id))}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {financeTargets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary">Нет проектов</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('finance')}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Box>
              <Typography variant="h6">Шаблоны финансовых моделей</Typography>
              <Typography variant="body2" color="text.secondary">
                Предустановленный набор статей и метрик, применяемый при создании финансовой модели.
              </Typography>
            </Box>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              size="small"
              onClick={() => {
                setEditingTemplate(null);
                setTemplateName('');
                setTemplateKey('');
                setTemplateArticles([]);
                setTemplateMetrics([]);
                setTemplateDialogOpen(true);
              }}
            >
              Шаблон
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Ключ</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell align="center">Статьи</TableCell>
                <TableCell align="center">Метрики</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {financeTemplates.map((tmpl) => (
                <TableRow key={tmpl.id}>
                  <TableCell>{tmpl.name}</TableCell>
                  <TableCell><Typography variant="body2" fontFamily="monospace">{tmpl.key}</Typography></TableCell>
                  <TableCell>
                    {tmpl.is_system
                      ? <Chip label="Системный" size="small" icon={<LockIcon />} />
                      : <Chip label="Пользовательский" size="small" variant="outlined" />}
                  </TableCell>
                  <TableCell align="center">{countArticles(tmpl.articles_json)}</TableCell>
                  <TableCell align="center">{tmpl.metrics_json.length}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Редактировать">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingTemplate(tmpl);
                          setTemplateName(tmpl.name);
                          setTemplateKey(tmpl.key);
                          setTemplateArticles(JSON.parse(JSON.stringify(tmpl.articles_json)));
                          setTemplateMetrics(JSON.parse(JSON.stringify(tmpl.metrics_json)));
                          setTemplateDialogOpen(true);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={tmpl.is_system ? 'Системный шаблон нельзя удалить' : 'Удалить'}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={tmpl.is_system}
                          onClick={() => safeAction(async () => {
                            if (!window.confirm(`Удалить шаблон "${tmpl.name}"?`)) return;
                            await financeApi.deleteModelTemplate(tmpl.id);
                            setFinanceTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
                          })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {financeTemplates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary">Нет шаблонов</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('finance')}>
          <Typography variant="h6" mb={1}>Счета для импорта</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Список банковских счетов, доступных для выбора при импорте CSV/XLSX в журнале операций.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Название счёта"
              value={newImportAccount.name}
              onChange={(e) => setNewImportAccount((prev) => ({
                ...prev,
                name: e.target.value,
                code: transliterate(e.target.value),
              }))}
              sx={{ flex: 2 }}
            />
            <TextField
              size="small"
              label="Код (латиница)"
              value={newImportAccount.code}
              helperText="Авто из названия"
              onChange={(e) => setNewImportAccount((prev) => ({ ...prev, code: e.target.value }))}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!newImportAccount.name.trim() || !newImportAccount.code.trim()}
              onClick={() =>
                safeAction(async () => {
                  if (!newImportAccount.name.trim() || !newImportAccount.code.trim()) return;
                  await financeApi.createImportAccount({
                    name: newImportAccount.name.trim(),
                    code: newImportAccount.code.trim(),
                    owner_scope: 'business',
                  });
                  setNewImportAccount({ name: '', code: '' });
                })
              }
            >
              Создать
            </Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Код</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {importAccounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.code}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      onClick={() => safeAction(() => financeApi.deleteImportAccount(a.id))}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {importAccounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary">Нет счетов</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('integrations')}>
          <Typography variant="h6" mb={1}>Точка Банк — ручной импорт платежей</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Загружает выписку за период и зачисляет входящие платежи на счета учеников по совпадению ФИО плательщика с родителем в карточке. Авто-импорт раз в 10 мин берёт только последние 3 дня; здесь можно указать любой период.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <TextField
              size="small"
              label="Дата с"
              type="date"
              value={tochkaDateFrom}
              onChange={(e) => setTochkaDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              label="Дата по"
              type="date"
              value={tochkaDateTo}
              onChange={(e) => setTochkaDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="contained"
              disabled={!tochkaDateFrom || !tochkaDateTo || tochkaImportLoading}
              onClick={async () => {
                setTochkaImportResult(null);
                setTochkaImportLoading(true);
                try {
                  const res = await salesApi.tochkaImportAndApply({
                    date_from: tochkaDateFrom,
                    date_to: tochkaDateTo,
                  });
                  setTochkaImportResult(res);
                  setError('');
                } catch (err: any) {
                  setError(extractApiError(err, 'Ошибка импорта Точка Банк'));
                } finally {
                  setTochkaImportLoading(false);
                }
              }}
            >
              {tochkaImportLoading ? 'Загрузка...' : 'Загрузить выписку и зачислить'}
            </Button>
          </Box>
          {tochkaImportResult && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2">Результат:</Typography>
              <Typography variant="body2">Зачислено: {tochkaImportResult.applied.length}. Без совпадения (no match): {tochkaImportResult.no_match.length}. Несколько кандидатов (ambiguous): {tochkaImportResult.ambiguous.length}.</Typography>
              {tochkaImportResult.no_match.length > 0 && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                  Не найдена карточка с таким плательщиком: {tochkaImportResult.no_match.map((n) => `${n.payer_name} (${n.amount} ₽, ${n.date})`).join('; ')}. Проверьте ФИО родителя в карточке ученика или добавьте карточку.
                </Typography>
              )}
              {tochkaImportResult.ambiguous.length > 0 && (
                <Typography variant="body2" color="info.main" sx={{ mt: 0.5 }}>
                  Несколько учеников с одинаковым ФИО плательщика: {tochkaImportResult.ambiguous.map((a) => a.payer_name).join(', ')}. Зачислите вручную или уточните плательщика в выписке.
                </Typography>
              )}
            </Box>
          )}
        </Paper>

        <Paper sx={sectionPaperSx('integrations')}>
          <Typography variant="h6" mb={1}>MAX мессенджер — привязка личного аккаунта</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Сообщения из CRM могут уходить в MAX от вашего личного аккаунта (как от человека). Есть два варианта: <strong>GREEN-API (бесплатно)</strong> — тариф MAX Developer, до 3 чатов; или api-messenger.com (платно). Привязка по QR или в ЛК сервиса.
          </Typography>
          {!maxPersonalConfigured ? (
            <Alert severity="info">
              Личный аккаунт не настроен. <strong>Бесплатно:</strong> зарегистрируйтесь на{' '}
              <a href="https://console.green-api.com" target="_blank" rel="noopener noreferrer">console.green-api.com</a>, создайте инстанс MAX, отсканируйте QR в ЛК, затем в .env на сервере добавьте GREEN_API_BASE_URL, GREEN_API_ID_INSTANCE, GREEN_API_TOKEN (значения в ЛК). <strong>Платно:</strong> api-messenger.com — MAX_PERSONAL_TOKEN в .env, затем кнопка «Показать QR» ниже.
            </Alert>
          ) : maxPersonalProvider === 'greenapi' ? (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Используется GREEN-API (бесплатный тариф). Привязка и QR — в{' '}
              <a href="https://console.green-api.com" target="_blank" rel="noopener noreferrer">личном кабинете GREEN-API</a>. На бесплатном тарифе — до 3 чатов, отправка сообщений без лимита.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">api-messenger.com: получите QR ниже и отсканируйте в ЛК сервиса.</Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={maxQrLoading}
                onClick={async () => {
                  setMaxQrImg(null);
                  setMaxQrLoading(true);
                  try {
                    const res = await maxApi.getPersonalQr();
                    setMaxQrImg(res.img);
                  } catch {
                    setError('Не удалось получить QR. Проверьте MAX_PERSONAL_TOKEN на сервере.');
                  } finally {
                    setMaxQrLoading(false);
                  }
                }}
              >
                {maxQrLoading ? 'Загрузка…' : 'Показать QR для привязки'}
              </Button>
              {maxQrImg && (
                <Box sx={{ textAlign: 'center', mt: 1 }}>
                  <Box
                    component="img"
                    src={`data:image/png;base64,${maxQrImg}`}
                    alt="QR для привязки MAX"
                    sx={{ maxWidth: 220, border: 1, borderColor: 'divider', borderRadius: 1 }}
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                    Отсканируйте в ЛК api-messenger.com
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Paper>

        <Paper sx={sectionPaperSx('leads')}>
          <Typography variant="h6" mb={1}>Источники лида</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новый источник"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newSource.trim()) return;
                await salesApi.createLeadSource(newSource.trim());
                setNewSource('');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadSource(s.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('tasks')}>
          <Typography variant="h6" mb={1}>Список задач</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новая задача"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newTemplate.trim()) return;
                await salesApi.createLeadTaskTemplate(newTemplate.trim());
                setNewTemplate('');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активна</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={t.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadTaskTemplate(t.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('tasks')}>
          <Typography variant="h6" mb={1}>Список статусов задач</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новый статус"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            />
            <FormControlLabel
              control={<Switch checked={newStatusClosed} onChange={(e) => setNewStatusClosed(e.target.checked)} />}
              label="Закрывающий"
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newStatus.trim()) return;
                await salesApi.createLeadTaskStatus({ name: newStatus.trim(), is_closed: newStatusClosed });
                setNewStatus('');
                setNewStatusClosed(false);
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Закрывающий</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statuses.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>{st.name}</TableCell>
                  <TableCell>{st.is_closed ? 'Да' : 'Да'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={st.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadTaskStatus(st.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('leads')}>
          <Typography variant="h6" mb={1}>Статусы лида </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новый статус лида"
              value={newLeadStatus}
              onChange={(e) => setNewLeadStatus(e.target.value)}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="new-lead-status-base-label">Базовая стадия</InputLabel>
              <Select
                labelId="new-lead-status-base-label"
                label="Базовая стадия"
                value={newLeadStatusBase}
                onChange={(e) => setNewLeadStatusBase(e.target.value as LeadStatus)}
              >
                {(Object.keys(leadStatusLabels) as LeadStatus[]).map((status) => (
                  <MenuItem key={status} value={status}>
                    {leadStatusLabels[status]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newLeadStatus.trim()) return;
                await salesApi.createLeadStatus({ name: newLeadStatus.trim(), base_status: newLeadStatusBase });
                setNewLeadStatus('');
                setNewLeadStatusBase('new');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Базовая стадия</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leadStatuses.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>{st.name}</TableCell>
                  <TableCell>{leadStatusLabels[st.base_status]}</TableCell>
                  <TableCell>
                    <Switch
                      checked={st.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadStatus(st.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={sectionPaperSx('templates')}>
          <Typography variant="h6" mb={1}>Шаблоны отправки инфо</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Название шаблона"
              value={newInfoTemplateName}
              onChange={(e) => setNewInfoTemplateName(e.target.value)}
            />
            <TextField
              size="small"
              label="Текст шаблона"
              value={newInfoTemplateBody}
              onChange={(e) => setNewInfoTemplateBody(e.target.value)}
              sx={{ minWidth: 420 }}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newInfoTemplateName.trim() || !newInfoTemplateBody.trim()) return;
                await salesApi.createLeadInfoTemplate({
                  name: newInfoTemplateName.trim(),
                  body: newInfoTemplateBody.trim(),
                });
                setNewInfoTemplateName('');
                setNewInfoTemplateBody('');
              })}
            >
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Текст</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {infoTemplates.map((tpl) => (
                <TableRow key={tpl.id}>
                  <TableCell>{tpl.name}</TableCell>
                  <TableCell>{tpl.body}</TableCell>
                  <TableCell>
                    <Switch
                      checked={tpl.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadInfoTemplate(tpl.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {settingsTab === 'ownerWorkspace' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" mb={1}>Настройки контрагентов и таск трекера</Typography>
            <OwnerWorkspaceSettingsSection />
          </Paper>
        )}

        {settingsTab === 'programMakeup' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" mb={1}>Совместимость программ (отработки)</Typography>
            <ProgramMakeupContent />
          </Paper>
        )}
      </Stack>

      {/* Template editor dialog */}
      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Название шаблона"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                sx={{ flex: 2 }}
              />
              {!editingTemplate && (
                <TextField
                  size="small"
                  label="Ключ (латиница, без пробелов)"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  helperText="Оставьте пустым для авто-генерации"
                  sx={{ flex: 1 }}
                />
              )}
            </Stack>

            {/* Articles editor */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Статьи</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => openAddArticle(null)}>
                  Добавить статью
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Наименование</TableCell>
                    <TableCell>Код</TableCell>
                    <TableCell>Тип</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flattenArticleNodes(templateArticles).map(({ path, level, ...node }) => (
                    <TableRow key={path.join('-')}>
                      <TableCell sx={{ pl: 2 + level * 3 }}>{node.name}</TableCell>
                      <TableCell><Typography variant="body2" fontFamily="monospace">{node.code || '—'}</Typography></TableCell>
                      <TableCell>
                        <Chip
                          label={node.direction === 'income' ? 'Доход' : 'Расход'}
                          size="small"
                          color={node.direction === 'income' ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Добавить дочернюю статью">
                          <IconButton size="small" onClick={() => openAddArticle(path)}>
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => openEditArticle(path)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setTemplateArticles((prev) => deleteNodeAtPath(prev, path))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {templateArticles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.secondary">Статей нет</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            {/* Metrics editor */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Метрики</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={openAddMetric}>
                  Добавить метрику
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Наименование</TableCell>
                    <TableCell>Формула</TableCell>
                    <TableCell>Ед.</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templateMetrics.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell><Typography variant="body2" fontFamily="monospace">{m.formula}</Typography></TableCell>
                      <TableCell>{m.unit || '—'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditMetric(i)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setTemplateMetrics((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {templateMetrics.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.secondary">Метрик нет</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTemplate} disabled={!templateName.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Article node dialog */}
      <Dialog open={articleDialogOpen} onClose={() => setArticleDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingArticlePath ? 'Редактировать статью' : 'Новая статья'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="Наименование"
              value={articleName}
              onChange={(e) => {
                setArticleName(e.target.value);
                if (!articleCodeUserEdited.current) {
                  setArticleCode(transliterate(e.target.value));
                }
              }}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="Код (латиница)"
              value={articleCode}
              onChange={(e) => {
                articleCodeUserEdited.current = true;
                setArticleCode(e.target.value);
              }}
              helperText="Заполняется автоматически из наименования"
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select
                label="Тип"
                value={articleDirection}
                onChange={(e) => setArticleDirection(e.target.value as 'income' | 'expense')}
              >
                <MenuItem value="income">Доход</MenuItem>
                <MenuItem value="expense">Расход</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArticleDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveArticleNode} disabled={!articleName.trim()}>
            {editingArticlePath ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Metric dialog */}
      <Dialog open={metricDialogOpen} onClose={() => setMetricDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingMetricIndex !== null ? 'Редактировать метрику' : 'Новая метрика'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="Наименование"
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              fullWidth
              placeholder="например: Налог УСН 6%, Маржа, НДС"
            />

            {/* Preset formula templates */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Готовые шаблоны (нажмите для вставки):
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {[
                  { label: 'УСН 6%', formula: 'SUM(revenue) * 0.06' },
                  { label: 'УСН 15%', formula: '(SUM(revenue) - SUM(costs)) * 0.15' },
                  { label: 'НДС 20%', formula: 'SUM(revenue_with_vat) * 0.2 / 1.2' },
                  { label: 'Прибыль', formula: 'SUM(revenue) - SUM(costs)' },
                  { label: 'Маржа %', formula: '(SUM(revenue) - SUM(costs)) / SUM(revenue) * 100' },
                  { label: 'ИП налог 6%', formula: 'SUM(revenue) * 0.06' },
                  { label: 'Средний чек', formula: 'SUM(revenue) / COUNT(revenue)' },
                ].map((tpl) => (
                  <Chip
                    key={tpl.label}
                    label={tpl.label}
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={() => setMetricFormula(tpl.formula)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Stack>
            </Box>

            {/* Available article codes from the template */}
            {flattenArticleNodes(templateArticles).filter((n) => n.code).length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Коды статей шаблона (нажмите чтобы добавить SUM в формулу):
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {flattenArticleNodes(templateArticles)
                    .filter((n) => n.code)
                    .map(({ path, level, code, name, direction }) => (
                      <Chip
                        key={path.join('-')}
                        label={`${code}`}
                        title={name}
                        size="small"
                        color={direction === 'income' ? 'success' : 'error'}
                        variant="outlined"
                        onClick={() =>
                          setMetricFormula((f) => (f.trim() ? `${f} + SUM(${code})` : `SUM(${code})`))
                        }
                        sx={{ cursor: 'pointer', fontFamily: 'monospace' }}
                      />
                    ))}
                </Stack>
              </Box>
            )}

            <TextField
              size="small"
              label="Формула"
              value={metricFormula}
              onChange={(e) => setMetricFormula(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              placeholder="Например: SUM(revenue) * 0.06"
              helperText="Функции: SUM(код) — сумма транзакций, COUNT(код) — количество, AVG_TRANSACTION(код) — средний чек, BALANCE() — остаток на счетах. Поддерживается: +  −  *  /  ()"
            />
            <TextField
              size="small"
              label="Единица измерения"
              value={metricUnit}
              onChange={(e) => setMetricUnit(e.target.value)}
              fullWidth
              placeholder="₽, %, шт."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveMetricItem} disabled={!metricName.trim() || !metricFormula.trim()}>
            {editingMetricIndex !== null ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

    </Layout>
  );
};

export default SalesSettingsPage;
