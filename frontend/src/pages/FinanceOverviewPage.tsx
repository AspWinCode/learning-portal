import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add,
  AccountTree,
  Assessment,
  Dashboard,
  Hub,
  Delete,
  Edit,
  Refresh,
  Save,
  TableChart,
  TableRows,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import FinanceCommandCenter from '../components/FinanceCommandCenter';
import { financeApi } from '../services/api';
import type {
  BudgetEntry,
  DashboardWidgetComputed,
  FinanceArticle,
  FinanceArticleTreeItem,
  FinanceLedgerBankRow,
  FinanceModel,
  MetricDefinition,
  PLReportResponse,
  UnitEconomicsResponse,
} from '../types';
import { transliterate } from '../utils/transliterate';

type TargetOption = { id: number; code: string; name: string; is_active?: boolean };
type AccountOption = { id: number; code: string; name: string; owner_scope?: string; is_active?: boolean };
type FinanceTab = 'overview' | 'dashboard' | 'models' | 'budget' | 'articles' | 'journal' | 'unit' | 'report';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const rub = (value: number | null | undefined) => `${money(value)} ₽`;
const pct = (value: number | null | undefined) => `${money(value)}%`;

const dateInputValue = (value?: string | null) => {
  if (!value) return today();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || today();
  return date.toISOString().slice(0, 10);
};

const renderCounterparty = (row: FinanceLedgerBankRow) => {
  const name = (row.counterparty_name || '').trim();
  const phone = (row.counterparty_phone || '').trim();
  if (!name && !phone) return '—';
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">{phone || name}</Typography>
      {phone && name && (
        <Typography variant="caption" color="text.secondary">
          {name}
        </Typography>
      )}
    </Stack>
  );
};

const directionLabel = (direction?: string | null) => {
  if (direction === 'income') return 'Доход';
  if (direction === 'expense') return 'Расход';
  if (direction === 'transfer') return 'Перевод';
  return 'Не задано';
};

const templateLabel = (key: string, templates: Array<{ key: string; name: string }>) =>
  templates.find((t) => t.key === key)?.name || key;

const flattenTree = (items: FinanceArticleTreeItem[], level = 0): Array<FinanceArticleTreeItem & { level: number }> =>
  items.flatMap((item) => [{ ...item, level }, ...flattenTree(item.children || [], level + 1)]);

const FinanceOverviewPageContent: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const isJournalMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isPwaJournal = useMemo(() => {
    const hasPwaQuery = new URLSearchParams(location.search).get('pwa') === '1';
    const hasPwaSession = typeof window !== 'undefined' && sessionStorage.getItem('pwa_mode') === '1';
    return isJournalMobile && (hasPwaQuery || hasPwaSession);
  }, [isJournalMobile, location.search]);
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [models, setModels] = useState<FinanceModel[]>([]);
  const [templates, setTemplates] = useState<Array<{ key: string; name: string; id?: number }>>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | ''>('');
  const [articleTree, setArticleTree] = useState<FinanceArticleTreeItem[]>([]);
  const [articles, setArticles] = useState<FinanceArticle[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetComputed[]>([]);
  const [budget, setBudget] = useState<BudgetEntry[]>([]);
  const [period, setPeriod] = useState(currentMonth());

  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<FinanceModel | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelTemplate, setModelTemplate] = useState('education_center');
  const [modelTargetId, setModelTargetId] = useState<number | '' | 'new'>('');
  const [modelTargetName, setModelTargetName] = useState('');
  const [modelTargetCode, setModelTargetCode] = useState('');

  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FinanceArticle | null>(null);
  const [articleName, setArticleName] = useState('');
  const [articleCode, setArticleCode] = useState('');
  const [articleDirection, setArticleDirection] = useState<'income' | 'expense'>('expense');
  const [articleParentId, setArticleParentId] = useState<number | ''>('');
  const [articleColor, setArticleColor] = useState('#2f6fef');
  const [articleCostKind, setArticleCostKind] = useState<'none' | 'variable' | 'fixed'>('none');
  const articleCodeUserEdited = useRef(false);

  const [plReport, setPlReport] = useState<PLReportResponse | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plFrom, setPlFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01`;
  });
  const [plTo, setPlTo] = useState(currentMonth);
  const [unitEconomics, setUnitEconomics] = useState<UnitEconomicsResponse | null>(null);
  const [unitLoading, setUnitLoading] = useState(false);

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<MetricDefinition | null>(null);
  const [metricName, setMetricName] = useState('');
  const [metricFormula, setMetricFormula] = useState('');
  const [metricUnit, setMetricUnit] = useState('руб');
  const [metricGoal, setMetricGoal] = useState('');

  const [journalRows, setJournalRows] = useState<FinanceLedgerBankRow[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalFrom, setJournalFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [journalTo, setJournalTo] = useState(today());
  const [journalTargetFilter, setJournalTargetFilter] = useState<'all' | number>('all');
  const [journalDirectionFilter, setJournalDirectionFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [journalAccountFilter, setJournalAccountFilter] = useState<'all' | number>('all');
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualAccountId, setManualAccountId] = useState<number | ''>('');
  const [manualToAccountId, setManualToAccountId] = useState<number | ''>('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDirection, setManualDirection] = useState<'income' | 'expense' | 'transfer'>('income');
  const [manualDate, setManualDate] = useState(today());
  const [manualArticleId, setManualArticleId] = useState<number | ''>('');
  const [manualTargetId, setManualTargetId] = useState<number | ''>('');
  const [manualDescription, setManualDescription] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<FinanceLedgerBankRow | null>(null);
  const [editTxAccountId, setEditTxAccountId] = useState<number | ''>('');
  const [editTxToAccountId, setEditTxToAccountId] = useState<number | ''>('');
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDirection, setEditTxDirection] = useState<'income' | 'expense' | 'transfer'>('income');
  const [editTxDate, setEditTxDate] = useState(today());
  const [editTxArticleId, setEditTxArticleId] = useState<number | ''>('');
  const [editTxTargetId, setEditTxTargetId] = useState<number | ''>('');
  const [editTxCounterparty, setEditTxCounterparty] = useState('');
  const [editTxDescription, setEditTxDescription] = useState('');

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || null,
    [models, selectedModelId]
  );
  const selectedTargetId = selectedModel?.target_id || null;
  const flatArticles = useMemo(() => flattenTree(articleTree), [articleTree]);
  const budgetMap = useMemo(
    () => new Map(budget.map((entry) => [entry.article_id, Number(entry.amount_plan || 0)])),
    [budget]
  );
  const budgetArticles = useMemo(
    () => flatArticles.filter((article) => article.direction === 'income' || article.direction === 'expense'),
    [flatArticles]
  );

  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [targetsList, accountsList, templatesList, modelsList] = await Promise.all([
        financeApi.listTargets(),
        financeApi.listAccounts(),
        financeApi.listModelTemplates(),
        financeApi.listModels(),
      ]);
      setTargets(targetsList);
      setAccounts(accountsList);
      setTemplates(templatesList);
      setModels(modelsList);
      setSelectedModelId((prev) => {
        if (prev && modelsList.some((model) => model.id === prev)) return prev;
        return modelsList[0]?.id || '';
      });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить финансы');
    } finally {
      setLoading(false);
    }
  };

  const loadModelData = async (targetId: number) => {
    setError(null);
    try {
      const [tree, articleList, metricList, budgetList, computedWidgets] = await Promise.all([
        financeApi.getArticleTree(targetId),
        financeApi.listArticles({ target_id: targetId }),
        financeApi.listMetrics(targetId),
        financeApi.listBudget({ target_id: targetId, period }),
        financeApi.computeDashboard(period),
      ]);
      setArticleTree(tree);
      setArticles(articleList);
      setMetrics(metricList);
      setBudget(budgetList);
      setWidgets(computedWidgets.filter((widget) => !widget.target_id || widget.target_id === targetId));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить данные финансовой модели');
      setArticleTree([]);
      setArticles([]);
      setMetrics([]);
      setBudget([]);
      setWidgets([]);
    }
  };

  const loadJournal = async () => {
    setJournalLoading(true);
    setError(null);
    const effectiveTargetFilter = journalTargetFilter === 'all' ? null : journalTargetFilter;
    const effectiveAccountFilter = journalAccountFilter === 'all' ? null : journalAccountFilter;
    try {
      const rows = await financeApi.listJournalTransactions({
        unclassified_only: unclassifiedOnly,
        target_ids: effectiveTargetFilter ? [effectiveTargetFilter] : undefined,
        include_unassigned_targets: Boolean(effectiveTargetFilter),
        account_ids: effectiveAccountFilter ? [effectiveAccountFilter] : undefined,
        direction: journalDirectionFilter === 'all' ? undefined : journalDirectionFilter,
        date_from: journalFrom || undefined,
        date_to: journalTo || undefined,
        limit: 5000,
      });
      setJournalRows(rows);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить журнал операций');
      setJournalRows([]);
    } finally {
      setJournalLoading(false);
    }
  };

  const loadPlReport = useCallback(async () => {
    if (!selectedModelId) return;
    setPlLoading(true);
    try {
      const report = await financeApi.getPLReport(Number(selectedModelId), plFrom, plTo);
      setPlReport(report);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить P&L отчёт');
      setPlReport(null);
    } finally {
      setPlLoading(false);
    }
  }, [selectedModelId, plFrom, plTo]);

  const loadUnitEconomics = useCallback(async () => {
    if (!selectedModelId) return;
    setUnitLoading(true);
    try {
      const response = await financeApi.getUnitEconomics(Number(selectedModelId), period);
      setUnitEconomics(response);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить юнит-экономику');
      setUnitEconomics(null);
    } finally {
      setUnitLoading(false);
    }
  }, [selectedModelId, period]);

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (isPwaJournal && tab !== 'journal') {
      setTab('journal');
    }
  }, [isPwaJournal, tab]);

  useEffect(() => {
    if (selectedTargetId) {
      loadModelData(selectedTargetId);
      setJournalTargetFilter(selectedTargetId);
    } else {
      setArticleTree([]);
      setArticles([]);
      setMetrics([]);
      setBudget([]);
      setWidgets([]);
      setJournalTargetFilter('all');
    }
  }, [selectedTargetId, period]);

  useEffect(() => {
    loadJournal();
  }, [journalFrom, journalTo, journalTargetFilter, journalDirectionFilter, journalAccountFilter, unclassifiedOnly]);

  useEffect(() => {
    if (tab === 'unit') {
      loadUnitEconomics();
    }
  }, [tab, loadUnitEconomics]);

  const openCreateModel = () => {
    setEditingModel(null);
    setModelName('');
    setModelTemplate(templates[0]?.key || 'education_center');
    setModelTargetId('');
    setModelTargetName('');
    setModelTargetCode('');
    setModelDialogOpen(true);
  };

  const createModel = async () => {
    if (!modelName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const isNewProject = modelTargetId === 'new';
      const isExisting = modelTargetId !== '' && modelTargetId !== 'new';
      const model = await financeApi.createModel({
        target_id: isExisting ? Number(modelTargetId) : null,
        target_name: isNewProject ? modelTargetName.trim() || modelName.trim() : null,
        target_code: isNewProject ? modelTargetCode.trim() || null : null,
        name: modelName.trim(),
        template_key: modelTemplate,
        currency: 'RUB',
        period_type: 'month',
      });
      setModelDialogOpen(false);
      await loadBase();
      setSelectedModelId(model.id);
      setMessage('Финансовая модель создана');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось создать финансовую модель');
    } finally {
      setLoading(false);
    }
  };

  const openEditModel = (model: FinanceModel) => {
    setEditingModel(model);
    setModelName(model.name);
    setModelTemplate(model.template_key || 'blank');
    setModelTargetId(model.target_id || '');
    setModelTargetName(model.target_name || '');
    setModelTargetCode(model.target_code || '');
    setModelDialogOpen(true);
  };

  const saveModel = async () => {
    if (!modelName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await financeApi.updateModel(editingModel!.id, { name: modelName.trim() });
      await loadBase();
      setMessage('Модель обновлена');
      setModelDialogOpen(false);
      setEditingModel(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось обновить модель');
    } finally {
      setLoading(false);
    }
  };

  const deleteModel = async (model: FinanceModel) => {
    if (!window.confirm(`Удалить финансовую модель "${model.name}"? Статьи и операции проекта не удаляются.`)) return;
    setLoading(true);
    setError(null);
    try {
      await financeApi.deleteModel(model.id);
      await loadBase();
      setMessage('Финансовая модель удалена');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось удалить финансовую модель');
    } finally {
      setLoading(false);
    }
  };

  const openCreateArticle = () => {
    setEditingArticle(null);
    setArticleName('');
    setArticleCode('');
    articleCodeUserEdited.current = false;
    setArticleDirection('expense');
    setArticleParentId('');
    setArticleColor('#2f6fef');
    setArticleCostKind('none');
    setArticleDialogOpen(true);
  };

  const openEditArticle = (article: FinanceArticle) => {
    setEditingArticle(article);
    setArticleName(article.name);
    setArticleCode(article.code || '');
    articleCodeUserEdited.current = true;
    setArticleDirection(article.direction === 'income' ? 'income' : 'expense');
    setArticleParentId(article.parent_id || '');
    setArticleColor(article.color || '#2f6fef');
    const ck = (article.cost_kind as string) || 'none';
    setArticleCostKind(ck === 'variable' ? 'variable' : ck === 'fixed' ? 'fixed' : 'none');
    setArticleDialogOpen(true);
  };

  const saveArticle = async () => {
    if (!selectedTargetId || !articleName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: articleName.trim(),
        code: articleCode.trim() || null,
        direction: articleDirection,
        target_id: selectedTargetId,
        parent_id: articleParentId === '' ? null : Number(articleParentId),
        scope: 'any',
        cost_kind: articleCostKind,
        color: articleColor || null,
      };
      if (editingArticle) {
        await financeApi.updateArticle(editingArticle.id, payload);
      } else {
        await financeApi.createArticle(payload);
      }
      setArticleDialogOpen(false);
      await loadModelData(selectedTargetId);
      setMessage('Статья сохранена');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось сохранить статью');
    } finally {
      setLoading(false);
    }
  };

  const openCreateMetric = () => {
    setEditingMetric(null);
    setMetricName('');
    setMetricFormula('');
    setMetricUnit('руб');
    setMetricGoal('');
    setMetricDialogOpen(true);
  };

  const openEditMetric = (metric: MetricDefinition) => {
    setEditingMetric(metric);
    setMetricName(metric.name);
    setMetricFormula(metric.formula);
    setMetricUnit(metric.unit || '');
    setMetricGoal(metric.goal_value == null ? '' : String(metric.goal_value));
    setMetricDialogOpen(true);
  };

  const saveMetric = async () => {
    if (!selectedTargetId || !metricName.trim() || !metricFormula.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        target_id: selectedTargetId,
        name: metricName.trim(),
        formula: metricFormula.trim(),
        unit: metricUnit.trim() || null,
        goal_value: metricGoal === '' ? null : Number(metricGoal),
      };
      if (editingMetric) {
        await financeApi.updateMetric(editingMetric.id, payload);
      } else {
        const metric = await financeApi.createMetric(payload);
        await financeApi.createDashboardWidget({
          metric_id: metric.id,
          target_id: selectedTargetId,
          widget_type: 'number',
          period_type: 'current_month',
          width: 1,
        });
      }
      setMetricDialogOpen(false);
      await loadModelData(selectedTargetId);
      setMessage('Метрика сохранена');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось сохранить метрику');
    } finally {
      setLoading(false);
    }
  };

  const saveBudget = async () => {
    if (!selectedTargetId) return;
    setLoading(true);
    setError(null);
    try {
      const entries = budgetArticles.map((article) => ({
        article_id: article.id,
        amount_plan: budgetMap.get(article.id) || 0,
      }));
      const saved = await financeApi.saveBudget({ target_id: selectedTargetId, period, entries });
      setBudget(saved);
      setMessage('Бюджет сохранен');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось сохранить бюджет');
    } finally {
      setLoading(false);
    }
  };

  const setBudgetAmount = (articleId: number, amount: number) => {
    setBudget((prev) => {
      const existing = prev.find((entry) => entry.article_id === articleId);
      if (existing) {
        return prev.map((entry) => (entry.article_id === articleId ? { ...entry, amount_plan: amount } : entry));
      }
      return [
        ...prev,
        {
          id: -articleId,
          target_id: selectedTargetId || 0,
          article_id: articleId,
          period,
          amount_plan: amount,
        },
      ];
    });
  };

  const createManualOperation = async () => {
    if (!manualAccountId || !manualAmount || Number(manualAmount) <= 0) return;
    if (manualDirection === 'transfer' && !manualToAccountId) return;
    setLoading(true);
    setError(null);
    try {
      await financeApi.createManualTransaction({
        account_id: Number(manualAccountId),
        amount: Number(manualAmount),
        direction: manualDirection,
        occurred_at: manualDate,
        article_id: manualDirection === 'transfer' ? null : (manualArticleId === '' ? null : Number(manualArticleId)),
        target_id: manualTargetId === '' ? null : Number(manualTargetId),
        description: manualDescription.trim() || null,
        to_account_id: manualDirection === 'transfer' ? Number(manualToAccountId) : null,
      });
      setManualDialogOpen(false);
      await loadJournal();
      if (selectedTargetId) await loadModelData(selectedTargetId);
      setMessage('Операция добавлена');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось добавить операцию');
    } finally {
      setLoading(false);
    }
  };

  const openEditTransaction = (row: FinanceLedgerBankRow) => {
    setEditingTransaction(row);
    setEditTxAccountId(row.account_id || '');
    setEditTxToAccountId(row.to_account_id || '');
    setEditTxAmount(String(row.amount || ''));
    setEditTxDirection((row.direction === 'transfer' ? 'transfer' : row.direction === 'expense' ? 'expense' : 'income'));
    setEditTxDate(dateInputValue(row.occurred_at));
    setEditTxArticleId(row.article_id || '');
    setEditTxTargetId(row.target_id || '');
    setEditTxCounterparty(row.counterparty_name || '');
    setEditTxDescription(row.description || '');
  };

  const saveTransactionEdit = async () => {
    if (!editingTransaction || !editTxAccountId || !editTxAmount || Number(editTxAmount) <= 0) return;
    if (editTxDirection === 'transfer' && !editTxToAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await financeApi.updateTransaction(editingTransaction.id, {
        occurred_at: editTxDate ? `${editTxDate}T12:00:00Z` : null,
        account_id: Number(editTxAccountId),
        to_account_id: editTxDirection === 'transfer' ? Number(editTxToAccountId) : null,
        amount: Number(editTxAmount),
        direction: editTxDirection,
        target_id: editTxTargetId === '' ? null : Number(editTxTargetId),
        article_id: editTxDirection === 'transfer' || editTxArticleId === '' ? null : Number(editTxArticleId),
        counterparty_name: editTxCounterparty.trim() || null,
        description: editTxDescription.trim() || null,
      });
      setJournalRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingTransaction(null);
      setMessage('Операция обновлена');
      if (selectedTargetId) await loadModelData(selectedTargetId);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Не удалось обновить операцию');
    } finally {
      setLoading(false);
    }
  };

  const updateJournalTransaction = async (
    rowId: number,
    payload: Parameters<typeof financeApi.updateTransaction>[1]
  ) => {
    const updated = await financeApi.updateTransaction(rowId, payload);
    setJournalRows((prev) => prev.map((item) => (item.id === rowId ? updated : item)));
    if (selectedTargetId) await loadModelData(selectedTargetId);
  };

  const deleteJournalTransaction = async (rowId: number) => {
    if (!window.confirm('Удалить операцию? Это действие необратимо.')) return;
    await financeApi.deleteTransaction(rowId);
    setJournalRows((prev) => prev.filter((row) => row.id !== rowId));
    if (selectedTargetId) await loadModelData(selectedTargetId);
  };

  const renderModelSelector = () => (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
      <FormControl size="small" sx={{ minWidth: { xs: 0, md: 280 }, width: { xs: '100%', md: 'auto' } }}>
        <InputLabel>Финансовая модель</InputLabel>
        <Select
          label="Финансовая модель"
          value={selectedModelId === '' ? '' : String(selectedModelId)}
          onChange={(event) => setSelectedModelId(event.target.value === '' ? '' : Number(event.target.value))}
        >
          <MenuItem value=""><em>Все модели</em></MenuItem>
          {models.map((model) => (
            <MenuItem key={model.id} value={model.id}>
              {model.name}
              {model.target_name ? ` / ${model.target_name}` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        type="month"
        label="Период"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
        InputLabelProps={{ shrink: true }}
      />
      <Tooltip title="Обновить">
        <span>
          <IconButton onClick={() => selectedTargetId && loadModelData(selectedTargetId)} disabled={!selectedTargetId}>
            <Refresh />
          </IconButton>
        </span>
      </Tooltip>
      <Button startIcon={<Add />} variant="contained" onClick={openCreateModel}>
        Модель
      </Button>
    </Stack>
  );

  const renderDashboard = () => (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        {widgets.map((widget) => (
          <Grid item xs={12} sm={6} md={3} key={widget.id}>
            <Paper variant="outlined" sx={{ p: 2, minHeight: 126, borderRadius: 1 }}>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {widget.title_override || widget.metric_name || 'Показатель'}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {money(widget.value)}
                  {widget.unit ? ` ${widget.unit}` : ''}
                </Typography>
                {widget.goal_value != null && (
                  <Typography variant="caption" color="text.secondary">
                    План: {money(widget.goal_value)} {widget.unit || ''}
                  </Typography>
                )}
              </Stack>
            </Paper>
          </Grid>
        ))}
        {widgets.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">Добавьте метрики для выбранной модели, чтобы собрать dashboard.</Alert>
          </Grid>
        )}
      </Grid>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h6">Метрики</Typography>
          <Button startIcon={<Add />} variant="outlined" onClick={openCreateMetric} disabled={!selectedTargetId}>
            Метрика
          </Button>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Наименование</TableCell>
              <TableCell>Формула</TableCell>
              <TableCell>Ед.</TableCell>
              <TableCell align="right">План</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {metrics.map((metric) => (
              <TableRow key={metric.id}>
                <TableCell>{metric.name}</TableCell>
                <TableCell>{metric.formula}</TableCell>
                <TableCell>{metric.unit || '—'}</TableCell>
                <TableCell align="right">{metric.goal_value == null ? '—' : money(metric.goal_value)}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEditMetric(metric)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={async () => {
                      if (!selectedTargetId || !window.confirm(`Удалить метрику "${metric.name}"?`)) return;
                      await financeApi.deleteMetric(metric.id);
                      await loadModelData(selectedTargetId);
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );

  const renderModels = () => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h6">Финансовые модели</Typography>
        <Button startIcon={<Add />} variant="contained" onClick={openCreateModel}>
          Создать
        </Button>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Наименование</TableCell>
            <TableCell>Проект</TableCell>
            <TableCell>Шаблон</TableCell>
            <TableCell>Валюта</TableCell>
            <TableCell align="right">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {models.map((model) => (
            <TableRow key={model.id} selected={model.id === selectedModelId}>
              <TableCell>{model.name}</TableCell>
              <TableCell>{model.target_name || model.target_code || model.target_id}</TableCell>
              <TableCell>{templateLabel(model.template_key, templates)}</TableCell>
              <TableCell>{model.currency}</TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => { setSelectedModelId(model.id); setTab('dashboard'); }}>
                  Открыть
                </Button>
                <Tooltip title="Редактировать">
                  <IconButton size="small" onClick={() => openEditModel(model)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Удалить">
                  <IconButton size="small" color="error" onClick={() => deleteModel(model)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

  const renderBudget = () => {
    // factMap: article_id → amount_fact из последнего загруженного budget
    const factMap = new Map<number, number>(
      budget.map((entry) => [entry.article_id, entry.amount_fact ?? 0])
    );

    const incomePlan = budgetArticles
      .filter((a) => a.direction === 'income')
      .reduce((sum, a) => sum + (budgetMap.get(a.id) || 0), 0);
    const expensePlan = budgetArticles
      .filter((a) => a.direction === 'expense')
      .reduce((sum, a) => sum + (budgetMap.get(a.id) || 0), 0);
    const incomeFact = budgetArticles
      .filter((a) => a.direction === 'income')
      .reduce((sum, a) => sum + (factMap.get(a.id) || 0), 0);
    const expenseFact = budgetArticles
      .filter((a) => a.direction === 'expense')
      .reduce((sum, a) => sum + (factMap.get(a.id) || 0), 0);

    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography variant="h6">Бюджет</Typography>
            <Typography variant="body2" color="success.main">
              Доход: план {money(incomePlan)} / факт {money(incomeFact)}
            </Typography>
            <Typography variant="body2" color="error.main">
              Расход: план {money(expensePlan)} / факт {money(expenseFact)}
            </Typography>
            <Typography variant="body2">
              Итог: план {money(incomePlan - expensePlan)} / факт {money(incomeFact - expenseFact)}
            </Typography>
          </Stack>
          <Button startIcon={<Save />} variant="contained" onClick={saveBudget} disabled={!selectedTargetId}>
            Сохранить бюджет
          </Button>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Статья</TableCell>
              <TableCell>Тип</TableCell>
              <TableCell align="right">План</TableCell>
              <TableCell align="right">Факт</TableCell>
              <TableCell align="right">Отклонение</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {budgetArticles.map((article) => {
              const plan = budgetMap.get(article.id) ?? 0;
              const fact = factMap.get(article.id) ?? 0;
              const diff = fact - plan;
              // Для доходов: перевыполнение (факт > план) — хорошо (зелёный)
              // Для расходов: перевыполнение (факт > план) — плохо (красный)
              const diffColor =
                diff === 0
                  ? 'text.secondary'
                  : article.direction === 'income'
                  ? diff > 0 ? 'success.main' : 'error.main'
                  : diff > 0 ? 'error.main' : 'success.main';

              return (
                <TableRow key={article.id}>
                  <TableCell sx={{ pl: 2 + article.level * 3 }}>{article.name}</TableCell>
                  <TableCell>{directionLabel(article.direction)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={plan}
                      onChange={(event) => setBudgetAmount(article.id, Number(event.target.value || 0))}
                      inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                      sx={{ width: 140 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: fact > 0 ? 600 : 400 }}>
                      {money(fact)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color={diffColor}>
                      {diff === 0 ? '—' : (diff > 0 ? '+' : '') + money(diff)}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
            {budgetArticles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  В модели пока нет статей.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    );
  };

  const renderArticles = () => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h6">Дерево статей</Typography>
        <Button startIcon={<Add />} variant="contained" onClick={openCreateArticle} disabled={!selectedTargetId}>
          Статья
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
          {flatArticles.map((article) => (
            <TableRow key={article.id}>
              <TableCell sx={{ pl: 2 + article.level * 3 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: article.color || 'divider' }} />
                  <span>{article.name}</span>
                </Stack>
              </TableCell>
              <TableCell>{article.code || '—'}</TableCell>
              <TableCell>{directionLabel(article.direction)}</TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => openEditArticle(article)}>
                  <Edit fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={async () => {
                    if (!selectedTargetId || !window.confirm(`Удалить статью "${article.name}"?`)) return;
                    await financeApi.deleteArticle(article.id);
                    await loadModelData(selectedTargetId);
                  }}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

  const renderReport = () => {
    const fmtMoney = (v: number) =>
      new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
    const fmtPct = (v: number) =>
      `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

    const rowBg = (row: PLReportResponse['rows'][0]) => {
      if (row.row_type === 'header') return row.direction === 'income' ? '#e8f5e9' : row.direction === 'expense' ? '#ffebee' : '#e3f2fd';
      if (row.row_type === 'total') return row.direction === 'income' ? '#c8e6c9' : '#ffcdd2';
      if (row.row_type === 'calculated') return '#fff9c4';
      return 'transparent';
    };

    const cellColor = (row: PLReportResponse['rows'][0], v: number) => {
      if (row.is_percent) return v < 0 ? '#d32f2f' : v > 0 ? '#2e7d32' : 'text.secondary';
      if (row.row_type === 'calculated' || row.row_type === 'total') return v < 0 ? '#d32f2f' : v > 0 ? '#2e7d32' : 'inherit';
      return 'inherit';
    };

    const fmtCell = (row: PLReportResponse['rows'][0], v: number) => {
      if (row.row_type === 'spacer' || row.row_type === 'header') return '';
      if (row.is_percent) return v === 0 ? '—' : fmtPct(v);
      if (v === 0) return row.row_type === 'article' ? '—' : '0';
      return fmtMoney(v);
    };

    const monthLabel = (period: string) => {
      const [y, m] = period.split('-');
      const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
      return `${months[parseInt(m, 10) - 1]} ${y}`;
    };

    return (
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField
              label="С"
              type="month"
              size="small"
              value={plFrom}
              onChange={(e) => setPlFrom(e.target.value)}
              sx={{ width: 160 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="По"
              type="month"
              size="small"
              value={plTo}
              onChange={(e) => setPlTo(e.target.value)}
              sx={{ width: 160 }}
              InputLabelProps={{ shrink: true }}
            />
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={() => void loadPlReport()}
              disabled={plLoading || !selectedModelId}
            >
              Сформировать
            </Button>
            {plLoading && <LinearProgress sx={{ flex: 1, minWidth: 80 }} />}
          </Stack>
        </Paper>

        {!selectedModelId && (
          <Alert severity="info">Выберите финансовую модель в верхней части страницы.</Alert>
        )}
        {selectedModelId && !plReport && !plLoading && (
          <Alert severity="info">Нажмите «Сформировать» для построения P&L отчёта.</Alert>
        )}
        {plReport && !plReport.target_id && (
          <Alert severity="warning">
            Финансовая модель не привязана к проекту — данные о транзакциях отсутствуют.
          </Alert>
        )}

        {plReport && plReport.target_id && (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 700, minWidth: 240, position: 'sticky', left: 0, bgcolor: 'grey.100', zIndex: 2 }}>
                    Статья
                  </TableCell>
                  {plReport.periods.map((p) => (
                    <TableCell key={p} align="right" sx={{ fontWeight: 700, minWidth: 100, whiteSpace: 'nowrap' }}>
                      {monthLabel(p)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700, minWidth: 100, bgcolor: 'grey.200', whiteSpace: 'nowrap' }}>
                    Итого
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plReport.rows.map((row, idx) => {
                  if (row.row_type === 'spacer') {
                    return <TableRow key={idx}><TableCell colSpan={plReport.periods.length + 2} sx={{ py: 0.3, border: 0 }} /></TableRow>;
                  }
                  return (
                    <TableRow
                      key={idx}
                      sx={{
                        bgcolor: rowBg(row),
                        '&:hover': { filter: 'brightness(0.97)' },
                        borderTop: row.row_type === 'calculated' ? '2px solid #e0e0e0' : undefined,
                      }}
                    >
                      <TableCell
                        sx={{
                          fontWeight: row.bold ? 700 : 400,
                          pl: row.row_type === 'article' ? `${16 + row.level * 20}px` : 2,
                          fontSize: row.row_type === 'header' ? '0.85rem' : '0.8rem',
                          letterSpacing: row.row_type === 'header' ? '0.04em' : undefined,
                          textTransform: row.row_type === 'header' ? 'uppercase' : undefined,
                          color: row.row_type === 'header' ? 'text.secondary' : 'text.primary',
                          position: 'sticky',
                          left: 0,
                          bgcolor: rowBg(row) || 'background.paper',
                          zIndex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        {row.color && row.row_type === 'article' && (
                          <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.color, flexShrink: 0, display: 'inline-block' }} />
                        )}
                        {row.name}
                      </TableCell>
                      {plReport.periods.map((p) => {
                        const v = row.cells[p] ?? 0;
                        return (
                          <TableCell
                            key={p}
                            align="right"
                            sx={{
                              fontWeight: row.bold ? 700 : 400,
                              color: cellColor(row, v),
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fmtCell(row, v)}
                          </TableCell>
                        );
                      })}
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          color: cellColor(row, row.total_fact),
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          bgcolor: 'rgba(0,0,0,0.03)',
                        }}
                      >
                        {fmtCell(row, row.is_percent ? (row.total_fact / Math.max(1, plReport.periods.length)) : row.total_fact)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Chip size="small" label="Доходы" sx={{ bgcolor: '#c8e6c9' }} />
          <Chip size="small" label="Расходы" sx={{ bgcolor: '#ffcdd2' }} />
          <Chip size="small" label="Расчётные строки" sx={{ bgcolor: '#fff9c4' }} />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Итого для %-строк — среднее за период
          </Typography>
        </Stack>
      </Stack>
    );
  };

  const renderJournal = () => (
    <Stack spacing={isPwaJournal ? 1 : 2}>
      <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={isPwaJournal ? 1 : 1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
          {isPwaJournal && (
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                  Журнал
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {journalRows.length} операций
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Синхронизировать">
                  <IconButton
                    size="small"
                    onClick={async () => {
                      setJournalLoading(true);
                      try {
                        const result = await financeApi.backfillBankTransactionsToLedger();
                        setMessage(`Синхронизировано: создано ${result.created}, обновлено ${result.updated} из ${result.total}`);
                        await loadJournal();
                      } catch (err: any) {
                        setError(err?.response?.data?.detail || err?.message || 'Ошибка синхронизации');
                      } finally {
                        setJournalLoading(false);
                      }
                    }}
                  >
                    <Refresh fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Добавить операцию">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => {
                      setManualAccountId(accounts[0]?.id || '');
                      setManualToAccountId('');
                      setManualTargetId(selectedTargetId || '');
                      setManualArticleId('');
                      setManualAmount('');
                      setManualDirection('income');
                      setManualDate(today());
                      setManualDescription('');
                      setManualDialogOpen(true);
                    }}
                  >
                    <Add fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          )}
          <Stack direction="row" spacing={1} sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: '1fr 1fr' }}>
          <TextField
            label="С"
            type="date"
            size="small"
            value={journalFrom}
            onChange={(event) => setJournalFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 0 }}
          />
          <TextField
            label="По"
            type="date"
            size="small"
            value={journalTo}
            onChange={(event) => setJournalTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 0 }}
          />
          </Stack>
          <FormControl size="small" sx={{ minWidth: { xs: 0, lg: 190 }, width: { xs: '100%', lg: 'auto' } }}>
            <InputLabel>Проект</InputLabel>
            <Select
              label="Проект"
              value={journalTargetFilter === 'all' ? 'all' : String(journalTargetFilter)}
              onChange={(event) =>
                setJournalTargetFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
            >
              <MenuItem value="all">Все проекты</MenuItem>
              {targets.map((target) => (
                <MenuItem key={target.id} value={target.id}>
                  {target.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: 0, lg: 170 }, width: { xs: '100%', lg: 'auto' } }}>
            <InputLabel>Счёт</InputLabel>
            <Select
              label="Счёт"
              value={journalAccountFilter === 'all' ? 'all' : String(journalAccountFilter)}
              onChange={(event) =>
                setJournalAccountFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
            >
              <MenuItem value="all">Все счета</MenuItem>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: 0, lg: 160 }, width: { xs: '100%', lg: 'auto' } }}>
            <InputLabel>Тип</InputLabel>
            <Select
              label="Тип"
              value={journalDirectionFilter}
              onChange={(event) => setJournalDirectionFilter(event.target.value as typeof journalDirectionFilter)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="income">Доход</MenuItem>
              <MenuItem value="expense">Расход</MenuItem>
              <MenuItem value="transfer">Перевод</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant={unclassifiedOnly ? 'contained' : 'outlined'}
            onClick={() => setUnclassifiedOnly((value) => !value)}
            fullWidth={isJournalMobile}
            size={isPwaJournal ? 'small' : 'medium'}
          >
            Неразобранные
          </Button>
          {!isPwaJournal && (
          <Tooltip title="Перенести все банковские операции в журнал (бэкфилл)">
            <Button
              startIcon={<Refresh />}
              variant="outlined"
              fullWidth={isJournalMobile}
              onClick={async () => {
                setJournalLoading(true);
                try {
                  const result = await financeApi.backfillBankTransactionsToLedger();
                  setMessage(`Синхронизировано: создано ${result.created}, обновлено ${result.updated} из ${result.total}`);
                  await loadJournal();
                } catch (err: any) {
                  setError(err?.response?.data?.detail || err?.message || 'Ошибка синхронизации');
                } finally {
                  setJournalLoading(false);
                }
              }}
            >
              Синхронизировать
            </Button>
          </Tooltip>
          )}
          {!isPwaJournal && (
          <Button
            startIcon={<Add />}
            variant="contained"
            fullWidth={isJournalMobile}
            onClick={() => {
              setManualAccountId(accounts[0]?.id || '');
              setManualToAccountId('');
              setManualTargetId(selectedTargetId || '');
              setManualArticleId('');
              setManualAmount('');
              setManualDirection('income');
              setManualDate(today());
              setManualDescription('');
              setManualDialogOpen(true);
            }}
          >
            Операция
          </Button>
          )}
        </Stack>
      </Paper>

      {journalLoading && <LinearProgress />}
      {isJournalMobile && (
        <Stack spacing={1.25}>
          {journalRows.map((row) => {
            const accountLabel = row.transfer_group_id
              ? `${row.account_name || row.account_code || '?'} → ${row.to_account_name || row.to_account_code || '?'}`
              : (row.account_name || row.account_code || '—');
            const amountColor = row.direction === 'expense' ? 'error.main' : 'success.main';

            return (
              <Paper key={row.id} variant="outlined" sx={{ p: isPwaJournal ? 1 : 1.5, borderRadius: 1 }}>
                <Stack spacing={isPwaJournal ? 1 : 1.25}>
                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary">
                        {row.occurred_at
                          ? new Date(row.occurred_at).toLocaleString('ru-RU', isPwaJournal ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : undefined)
                          : '—'}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                        {accountLabel}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ flexShrink: 0 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary">
                          {directionLabel(row.direction)}
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: amountColor, lineHeight: 1.2 }}>
                          {money(row.amount)}
                        </Typography>
                      </Box>
                      {isPwaJournal && (
                        <Stack direction="row" spacing={0.25}>
                          <IconButton size="small" onClick={() => openEditTransaction(row)} aria-label="Редактировать">
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => deleteJournalTransaction(row.id)} aria-label="Удалить">
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      )}
                    </Stack>
                  </Stack>

                  {!isPwaJournal && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={row.target_name || 'Проект не выбран'} variant={row.target_id ? 'filled' : 'outlined'} />
                    <Chip size="small" label={row.article_name || 'Статья не выбрана'} variant={row.article_id ? 'filled' : 'outlined'} />
                  </Stack>
                  )}

                  <Box sx={{ display: !row.counterparty_name && !row.counterparty_phone && isPwaJournal ? 'none' : 'block' }}>
                    <Typography variant="caption" color="text.secondary">
                      Контрагент
                    </Typography>
                    <Box sx={{ overflowWrap: 'anywhere' }}>{renderCounterparty(row)}</Box>
                  </Box>

                  {(row.description || row.bank_source) && (
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      {row.description || row.bank_source}
                    </Typography>
                  )}

                  <Stack direction={isPwaJournal ? 'row' : 'column'} spacing={1}>
                    <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
                      <InputLabel>Проект</InputLabel>
                      <Select
                        label="Проект"
                        value={row.target_id ?? ''}
                        displayEmpty
                        onChange={async (event) => {
                          const target_id = event.target.value === '' ? null : Number(event.target.value);
                          await updateJournalTransaction(row.id, { target_id });
                        }}
                      >
                        <MenuItem value="">
                          <em>Не выбран</em>
                        </MenuItem>
                        {targets.map((target) => (
                          <MenuItem key={target.id} value={target.id}>
                            {target.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {row.direction === 'transfer' ? (
                      <Typography variant="body2" color="text.secondary">
                        {row.article_name || 'Без статьи'}
                      </Typography>
                    ) : (
                      <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
                        <InputLabel>Статья</InputLabel>
                        <Select
                          label="Статья"
                          value={row.article_id ?? ''}
                          displayEmpty
                          onChange={async (event) => {
                            const article_id = event.target.value === '' ? null : Number(event.target.value);
                            await updateJournalTransaction(row.id, { article_id });
                          }}
                        >
                          <MenuItem value="">
                            <em>Не выбрана</em>
                          </MenuItem>
                          {articles
                            .filter((article) => article.direction === row.direction)
                            .map((article) => (
                              <MenuItem key={article.id} value={article.id}>
                                {article.name}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    )}
                  </Stack>

                  {!isPwaJournal && (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Редактировать операцию">
                      <IconButton size="small" onClick={() => openEditTransaction(row)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить операцию">
                      <IconButton size="small" color="error" onClick={() => deleteJournalTransaction(row.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  )}
                </Stack>
              </Paper>
            );
          })}

          {journalRows.length === 0 && !journalLoading && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Операций за выбранный период нет.
              </Typography>
            </Paper>
          )}
        </Stack>
      )}
      {!isJournalMobile && (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1500 }}>
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Счет</TableCell>
              <TableCell>Проект</TableCell>
              <TableCell>Статья</TableCell>
              <TableCell>Тип</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell>Контрагент</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {journalRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.occurred_at ? new Date(row.occurred_at).toLocaleString('ru-RU') : '—'}</TableCell>
                <TableCell>
                  {row.transfer_group_id
                    ? `${row.account_name || row.account_code || '?'} → ${row.to_account_name || row.to_account_code || '?'}`
                    : (row.account_name || row.account_code || '—')}
                </TableCell>
                <TableCell>
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <Select
                      value={row.target_id ?? ''}
                      displayEmpty
                      onChange={async (event) => {
                        const target_id = event.target.value === '' ? null : Number(event.target.value);
                        await updateJournalTransaction(row.id, { target_id });
                      }}
                    >
                      <MenuItem value="">
                        <em>Не выбран</em>
                      </MenuItem>
                      {targets.map((target) => (
                        <MenuItem key={target.id} value={target.id}>
                          {target.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  {row.direction === 'transfer' ? (
                    row.article_name || '—'
                  ) : (
                    <FormControl size="small" sx={{ minWidth: 190 }}>
                      <Select
                        value={row.article_id ?? ''}
                        displayEmpty
                        onChange={async (event) => {
                          const article_id = event.target.value === '' ? null : Number(event.target.value);
                          await updateJournalTransaction(row.id, { article_id });
                        }}
                      >
                        <MenuItem value="">
                          <em>Не выбрана</em>
                        </MenuItem>
                        {articles
                          .filter((article) => article.direction === row.direction)
                          .map((article) => (
                            <MenuItem key={article.id} value={article.id}>
                              {article.name}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  )}
                </TableCell>
                <TableCell>{directionLabel(row.direction)}</TableCell>
                <TableCell align="right" sx={{ color: row.direction === 'expense' ? 'error.main' : 'success.main' }}>
                  {money(row.amount)}
                </TableCell>
                <TableCell>{renderCounterparty(row)}</TableCell>
                <TableCell>{row.description || row.bank_source || '—'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Редактировать операцию">
                    <IconButton
                      size="small"
                      onClick={() => openEditTransaction(row)}
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Удалить операцию">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteJournalTransaction(row.id)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {journalRows.length === 0 && !journalLoading && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  Операций за выбранный период нет.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </TableContainer>
      </Paper>
      )}
    </Stack>
  );

  const renderUnitEconomics = () => {
    const data = unitEconomics;
    const kpi = data?.kpi;
    const funnel = data?.funnel;
    const retention = data?.retention;
    const kpiCards = kpi
      ? [
          { label: 'LTV ученика', value: rub(kpi.ltv), tone: kpi.ltv_cac_ratio >= 3 ? 'success.main' : kpi.ltv_cac_ratio > 0 ? 'warning.main' : 'text.primary' },
          { label: 'CAC', value: rub(kpi.cac), tone: 'text.primary' },
          { label: 'LTV / CAC', value: money(kpi.ltv_cac_ratio), tone: kpi.ltv_cac_ratio >= 3 ? 'success.main' : kpi.ltv_cac_ratio >= 1 ? 'warning.main' : 'error.main' },
          { label: 'Payback', value: `${money(kpi.payback_months)} мес.`, tone: kpi.payback_months && kpi.payback_months <= 6 ? 'success.main' : kpi.payback_months <= 12 ? 'warning.main' : 'error.main' },
          { label: 'ARPU / месяц', value: rub(kpi.arpu), tone: 'text.primary' },
          { label: 'Gross Margin', value: pct(kpi.gross_margin_pct), tone: kpi.gross_margin_pct >= 50 ? 'success.main' : 'warning.main' },
          { label: 'Churn / месяц', value: pct(kpi.churn_pct), tone: kpi.churn_pct <= 5 ? 'success.main' : kpi.churn_pct <= 10 ? 'warning.main' : 'error.main' },
          { label: 'Lifetime', value: `${money(kpi.lifetime_months)} мес.`, tone: 'text.primary' },
        ]
      : [];

    return (
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Юнит-экономика ученика
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Расчёт по выбранной финансовой модели за {period}. Все суммы в рублях.
              </Typography>
            </Box>
            <Button startIcon={<Refresh />} variant="outlined" onClick={loadUnitEconomics} disabled={!selectedModelId || unitLoading}>
              Обновить
            </Button>
          </Stack>
        </Paper>

        {unitLoading && <LinearProgress />}

        {!unitLoading && !data && (
          <Alert severity="info">Выберите финансовую модель, чтобы увидеть юнит-экономику.</Alert>
        )}

        {data && (
          <>
            {data.notes.length > 0 && (
              <Alert severity="warning">
                <Stack spacing={0.5}>
                  {data.notes.map((note) => (
                    <Typography key={note} variant="body2">{note}</Typography>
                  ))}
                </Stack>
              </Alert>
            )}

            <Grid container spacing={1.5}>
              {kpiCards.map((card) => (
                <Grid item xs={12} sm={6} md={3} key={card.label}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, height: '100%' }}>
                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                    <Typography variant="h5" sx={{ mt: 0.75, fontWeight: 700, color: card.tone }}>{card.value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {kpi && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, height: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>P&L на ученика</Typography>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Выручка</Typography><Typography>{rub(kpi.revenue)}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Переменные расходы</Typography><Typography>{rub(kpi.variable_cost)}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Валовая прибыль</Typography><Typography>{rub(kpi.gross_profit)}</Typography></Stack>
                      <Divider />
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Активные ученики</Typography><Typography>{kpi.active_students}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Новые ученики</Typography><Typography>{kpi.new_students}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Ушли</Typography><Typography>{kpi.churned_students}</Typography></Stack>
                    </Stack>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, height: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Воронка</Typography>
                    {funnel && (
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Лиды</Typography><Typography>{funnel.leads}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Пробные/демо</Typography><Typography>{funnel.trials}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Покупки</Typography><Typography>{funnel.sales}</Typography></Stack>
                        <Divider />
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Lead → Trial</Typography><Typography>{pct(funnel.lead_to_trial_pct)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Trial → Sale</Typography><Typography>{pct(funnel.trial_to_sale_pct)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">CPL</Typography><Typography>{rub(funnel.cpl)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">CPT</Typography><Typography>{rub(funnel.cpt)}</Typography></Stack>
                      </Stack>
                    )}
                  </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, height: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Retention</Typography>
                    {retention && (
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">После 3 месяцев</Typography><Typography>{pct(retention.month_3_pct)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">После 6 месяцев</Typography><Typography>{pct(retention.month_6_pct)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">После 12 месяцев</Typography><Typography>{pct(retention.month_12_pct)}</Typography></Stack>
                        <Divider />
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Маркетинг + продажи</Typography><Typography>{rub(kpi.marketing_sales_cost)}</Typography></Stack>
                        <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Прибыль / ученик / мес.</Typography><Typography>{rub(kpi.monthly_gross_profit_per_student)}</Typography></Stack>
                      </Stack>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            )}

            <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Когорта</TableCell>
                      <TableCell align="right">Ученики</TableCell>
                      <TableCell align="right">Выручка</TableCell>
                      <TableCell align="right">Валовая прибыль</TableCell>
                      <TableCell align="right">ARPU</TableCell>
                      <TableCell align="right">Retention 3м</TableCell>
                      <TableCell align="right">6м</TableCell>
                      <TableCell align="right">12м</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.cohorts.map((row) => (
                      <TableRow key={row.cohort}>
                        <TableCell>{row.cohort}</TableCell>
                        <TableCell align="right">{row.students}</TableCell>
                        <TableCell align="right">{rub(row.revenue)}</TableCell>
                        <TableCell align="right">{rub(row.gross_profit)}</TableCell>
                        <TableCell align="right">{rub(row.arpu)}</TableCell>
                        <TableCell align="right">{pct(row.retention_3_pct)}</TableCell>
                        <TableCell align="right">{pct(row.retention_6_pct)}</TableCell>
                        <TableCell align="right">{pct(row.retention_12_pct)}</TableCell>
                      </TableRow>
                    ))}
                    {data.cohorts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center">Когорты пока не сформированы.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
      </Stack>
    );
  };

  return (
    <Box sx={{ p: isPwaJournal ? 1 : { xs: 1, sm: 2 }, pb: isPwaJournal ? 8 : undefined, display: 'flex', flexDirection: 'column', gap: isPwaJournal ? 1 : { xs: 1.5, sm: 2 } }}>
      {!isPwaJournal && (
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Финансы
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Единый журнал, модели, статьи, бюджет и показатели по проектам.
          </Typography>
        </Box>
        {renderModelSelector()}
      </Stack>
      )}

      {loading && <LinearProgress />}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {!isPwaJournal && !selectedModel && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={openCreateModel}>
              Создать
            </Button>
          }
        >
          Создайте первую финансовую модель, чтобы настроить статьи, бюджет и dashboard.
        </Alert>
      )}

      {!isPwaJournal && (
      <Paper variant="outlined" sx={{ borderRadius: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 0.5, sm: 1 },
            minHeight: { xs: 44, sm: 48 },
            '& .MuiTab-root': {
              minHeight: { xs: 44, sm: 48 },
              minWidth: { xs: 104, sm: 120 },
              px: { xs: 1, sm: 2 },
            },
          }}
        >
          <Tab value="overview" icon={<Hub />} iconPosition="start" label="Обзор" />
          <Tab value="dashboard" icon={<Dashboard />} iconPosition="start" label="Dashboard" />
          <Tab value="models" icon={<Assessment />} iconPosition="start" label="Модели" />
          <Tab value="report" icon={<TableChart />} iconPosition="start" label="P&L Отчёт" />
          <Tab value="budget" icon={<TableRows />} iconPosition="start" label="Бюджет" />
          <Tab value="articles" icon={<AccountTree />} iconPosition="start" label="Статьи" />
          <Tab value="journal" icon={<TableRows />} iconPosition="start" label="Журнал" />
          <Tab value="unit" icon={<Assessment />} iconPosition="start" label="Юнит экономика" />
        </Tabs>
      </Paper>
      )}

      {isPwaJournal ? renderJournal() : (
        <>
          {tab === 'overview' && <FinanceCommandCenter onNavigateToJournal={() => setTab('journal')} />}
          {tab === 'dashboard' && renderDashboard()}
          {tab === 'models' && renderModels()}
          {tab === 'report' && renderReport()}
          {tab === 'budget' && renderBudget()}
          {tab === 'articles' && renderArticles()}
          {tab === 'journal' && renderJournal()}
          {tab === 'unit' && renderUnitEconomics()}
        </>
      )}

      <Dialog open={modelDialogOpen} onClose={() => { setModelDialogOpen(false); setEditingModel(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingModel ? 'Редактировать модель' : 'Новая финансовая модель'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Наименование" size="small" value={modelName} onChange={(e) => setModelName(e.target.value)} />
            {!editingModel && (
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel>Шаблон</InputLabel>
                  <Select label="Шаблон" value={modelTemplate} onChange={(e) => setModelTemplate(e.target.value)}>
                    {templates.map((template) => (
                      <MenuItem key={template.key} value={template.key}>
                        {template.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Проект</InputLabel>
                  <Select
                    label="Проект"
                    value={modelTargetId === '' ? '' : String(modelTargetId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || v === 'new') setModelTargetId(v);
                      else setModelTargetId(Number(v));
                    }}
                  >
                    <MenuItem value="">Без проекта</MenuItem>
                    <MenuItem value="new">Создать новый проект</MenuItem>
                    {targets.map((target) => (
                      <MenuItem key={target.id} value={target.id}>
                        {target.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {modelTargetId === 'new' && (
                  <>
                    <Divider />
                    <TextField
                      label="Название нового проекта"
                      size="small"
                      value={modelTargetName}
                      onChange={(e) => {
                        setModelTargetName(e.target.value);
                        setModelTargetCode(transliterate(e.target.value));
                      }}
                    />
                    <TextField
                      label="Код нового проекта (латиница)"
                      size="small"
                      value={modelTargetCode}
                      helperText="Заполняется автоматически из названия"
                      onChange={(e) => setModelTargetCode(e.target.value)}
                    />
                  </>
                )}
              </>
            )}
            {editingModel && (
              <TextField
                label="Проект"
                size="small"
                value={editingModel.target_name || editingModel.target_code || String(editingModel.target_id)}
                disabled
                helperText="Проект нельзя изменить после создания модели"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setModelDialogOpen(false); setEditingModel(null); }}>Отмена</Button>
          <Button variant="contained" onClick={editingModel ? saveModel : createModel} disabled={!modelName.trim()}>
            {editingModel ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={articleDialogOpen} onClose={() => setArticleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingArticle ? 'Редактировать статью' : 'Новая статья'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Наименование"
              size="small"
              value={articleName}
              autoFocus
              onChange={(e) => {
                setArticleName(e.target.value);
                if (!articleCodeUserEdited.current) setArticleCode(transliterate(e.target.value));
              }}
            />
            <TextField
              label="Код (латиница)"
              size="small"
              value={articleCode}
              helperText="Заполняется автоматически из наименования"
              onChange={(e) => { articleCodeUserEdited.current = true; setArticleCode(e.target.value); }}
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
            <FormControl size="small" fullWidth>
              <InputLabel>Родитель</InputLabel>
              <Select
                label="Родитель"
                value={articleParentId === '' ? '' : String(articleParentId)}
                onChange={(e) => setArticleParentId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">Корневой уровень</MenuItem>
                {flatArticles
                  .filter((article) => article.id !== editingArticle?.id)
                  .map((article) => (
                    <MenuItem key={article.id} value={article.id}>
                      {' '.repeat(article.level * 2)}
                      {article.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            {articleDirection === 'expense' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Тип расходов (для P&L)</InputLabel>
                <Select
                  label="Тип расходов (для P&L)"
                  value={articleCostKind}
                  onChange={(e) => setArticleCostKind(e.target.value as 'none' | 'variable' | 'fixed')}
                >
                  <MenuItem value="none">Прочие / не задано</MenuItem>
                  <MenuItem value="variable">Переменные</MenuItem>
                  <MenuItem value="fixed">Постоянные</MenuItem>
                </Select>
              </FormControl>
            )}
            <TextField label="Цвет (HEX)" size="small" value={articleColor} onChange={(e) => setArticleColor(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArticleDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveArticle} disabled={!articleName.trim() || !selectedTargetId}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={metricDialogOpen} onClose={() => setMetricDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingMetric ? 'Редактировать метрику' : 'Новая метрика'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Наименование" size="small" value={metricName} onChange={(e) => setMetricName(e.target.value)} />
            <TextField
              label="Формула"
              size="small"
              value={metricFormula}
              onChange={(e) => setMetricFormula(e.target.value)}
              helperText="Например: SUM(revenue) - SUM(expenses), BALANCE(), COUNT(revenue)"
            />
            <TextField label="Единица" size="small" value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} />
            <TextField
              label="План"
              type="number"
              size="small"
              value={metricGoal}
              onChange={(e) => setMetricGoal(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveMetric} disabled={!metricName.trim() || !metricFormula.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingTransaction} onClose={() => setEditingTransaction(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать операцию</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Дата"
              type="date"
              size="small"
              value={editTxDate}
              onChange={(e) => setEditTxDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Счет</InputLabel>
              <Select
                label="Счет"
                value={editTxAccountId === '' ? '' : String(editTxAccountId)}
                onChange={(e) => setEditTxAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                    {account.code ? ` (${account.code})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Сумма"
              type="number"
              size="small"
              value={editTxAmount}
              onChange={(e) => setEditTxAmount(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select
                label="Тип"
                value={editTxDirection}
                onChange={(e) => {
                  const direction = e.target.value as 'income' | 'expense' | 'transfer';
                  setEditTxDirection(direction);
                  setEditTxArticleId('');
                  if (direction !== 'transfer') setEditTxToAccountId('');
                }}
              >
                <MenuItem value="income">Доход</MenuItem>
                <MenuItem value="expense">Расход</MenuItem>
                <MenuItem value="transfer">Перевод</MenuItem>
              </Select>
            </FormControl>
            {editTxDirection === 'transfer' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Счет назначения</InputLabel>
                <Select
                  label="Счет назначения"
                  value={editTxToAccountId === '' ? '' : String(editTxToAccountId)}
                  onChange={(e) => setEditTxToAccountId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  {accounts
                    .filter((acc) => acc.id !== editTxAccountId)
                    .map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.name}
                        {account.code ? ` (${account.code})` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel>Проект</InputLabel>
              <Select
                label="Проект"
                value={editTxTargetId === '' ? '' : String(editTxTargetId)}
                onChange={(e) => setEditTxTargetId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">Не выбран</MenuItem>
                {targets.map((target) => (
                  <MenuItem key={target.id} value={target.id}>
                    {target.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {editTxDirection !== 'transfer' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Статья</InputLabel>
                <Select
                  label="Статья"
                  value={editTxArticleId === '' ? '' : String(editTxArticleId)}
                  onChange={(e) => setEditTxArticleId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <MenuItem value="">Не выбрана</MenuItem>
                  {articles
                    .filter((article) => article.direction === editTxDirection)
                    .map((article) => (
                      <MenuItem key={article.id} value={article.id}>
                        {article.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Контрагент"
              size="small"
              value={editTxCounterparty}
              onChange={(e) => setEditTxCounterparty(e.target.value)}
            />
            <TextField
              label="Описание"
              size="small"
              value={editTxDescription}
              onChange={(e) => setEditTxDescription(e.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTransaction(null)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={saveTransactionEdit}
            disabled={!editTxAccountId || !editTxAmount || Number(editTxAmount) <= 0 || (editTxDirection === 'transfer' && !editTxToAccountId)}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manualDialogOpen} onClose={() => setManualDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ручная операция</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Счет</InputLabel>
              <Select
                label="Счет"
                value={manualAccountId === '' ? '' : String(manualAccountId)}
                onChange={(e) => setManualAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                    {account.code ? ` (${account.code})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Дата"
              type="date"
              size="small"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select
                label="Тип"
                value={manualDirection}
                onChange={(e) => {
                  setManualDirection(e.target.value as 'income' | 'expense' | 'transfer');
                  setManualArticleId('');
                  setManualToAccountId('');
                }}
              >
                <MenuItem value="income">Доход</MenuItem>
                <MenuItem value="expense">Расход</MenuItem>
                <MenuItem value="transfer">Перевод</MenuItem>
              </Select>
            </FormControl>
            {manualDirection === 'transfer' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Счёт-назначения</InputLabel>
                <Select
                  label="Счёт-назначения"
                  value={manualToAccountId === '' ? '' : String(manualToAccountId)}
                  onChange={(e) => setManualToAccountId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  {accounts
                    .filter((acc) => acc.id !== manualAccountId)
                    .map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.name}
                        {account.code ? ` (${account.code})` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Сумма"
              type="number"
              size="small"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Проект</InputLabel>
              <Select
                label="Проект"
                value={manualTargetId === '' ? '' : String(manualTargetId)}
                onChange={(e) => setManualTargetId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">Не выбран</MenuItem>
                {targets.map((target) => (
                  <MenuItem key={target.id} value={target.id}>
                    {target.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {manualDirection !== 'transfer' && (
              <FormControl size="small" fullWidth>
                <InputLabel>Статья</InputLabel>
                <Select
                  label="Статья"
                  value={manualArticleId === '' ? '' : String(manualArticleId)}
                  onChange={(e) => setManualArticleId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <MenuItem value="">Не выбрана</MenuItem>
                  {articles
                    .filter((article) => article.direction === manualDirection)
                    .map((article) => (
                      <MenuItem key={article.id} value={article.id}>
                        {article.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Комментарий"
              size="small"
              multiline
              minRows={2}
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualDialogOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={createManualOperation}
            disabled={
              !manualAccountId || !manualAmount || Number(manualAmount) <= 0 ||
              (manualDirection === 'transfer' && !manualToAccountId)
            }
          >
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const FinanceOverviewPage: React.FC = () => (
  <Layout>
    <FinanceOverviewPageContent />
  </Layout>
);

export default FinanceOverviewPage;
