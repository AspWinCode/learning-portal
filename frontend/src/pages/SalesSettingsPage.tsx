import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import OwnerWorkspaceSettingsSection from '../components/ownerWorkspace/OwnerWorkspaceSettingsSection';
import PwaSettingsSection from '../components/PwaSettingsSection';
import StudentQuestionnairesSettingsSection from '../components/StudentQuestionnairesSettingsSection';
import { useAuth } from '../contexts/AuthContext';
import { PersonRegistryContent } from './PersonRegistryPage';
import { abonementsApi, campaignsApi, financeApi, maxApi, salesApi, settingsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';
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
        director: newSchool.director.trim() || null,
        email: newSchool.email.trim() || null,
        address: newSchool.address.trim() || null,
        phone: newSchool.phone.trim() || null,
      });
      setNewSchool({ name: '', city: '', director: '', email: '', address: '', phone: '' });
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
                  director: newSchool.director.trim() || null,
                  email: newSchool.email.trim() || null,
                  address: newSchool.address.trim() || null,
                  phone: newSchool.phone.trim() || null,
                });
                setNewSchool({ name: '', city: '', director: '', email: '', address: '', phone: '' });
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
          <Typography variant="h6" mb={1}>Счета для импорта</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Список банковских счетов, доступных для выбора при импорте CSV/XLSX в журнале операций.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label="Название счёта"
              value={newImportAccount.name}
              onChange={(e) => setNewImportAccount((prev) => ({ ...prev, name: e.target.value }))}
              sx={{ flex: 2 }}
            />
            <TextField
              size="small"
              label="Код (латиница, без пробелов)"
              value={newImportAccount.code}
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
      </Stack>
    </Layout>
  );
};

export default SalesSettingsPage;
