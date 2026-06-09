import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  AccountTree,
  Assessment,
  Dashboard,
  Delete,
  Edit,
  Refresh,
  Save,
  TableRows,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { financeApi } from '../services/api';
import type {
  BudgetEntry,
  DashboardWidgetComputed,
  FinanceArticle,
  FinanceArticleTreeItem,
  FinanceLedgerBankRow,
  FinanceModel,
  MetricDefinition,
} from '../types';

type TargetOption = { id: number; code: string; name: string; is_active?: boolean };
type AccountOption = { id: number; code: string; name: string; owner_scope?: string; is_active?: boolean };
type FinanceTab = 'dashboard' | 'models' | 'budget' | 'articles' | 'journal';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

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
  const [tab, setTab] = useState<FinanceTab>('dashboard');
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
  const [modelName, setModelName] = useState('');
  const [modelTemplate, setModelTemplate] = useState('education_center');
  const [modelTargetId, setModelTargetId] = useState<number | ''>('');
  const [modelTargetName, setModelTargetName] = useState('');
  const [modelTargetCode, setModelTargetCode] = useState('');

  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FinanceArticle | null>(null);
  const [articleName, setArticleName] = useState('');
  const [articleCode, setArticleCode] = useState('');
  const [articleDirection, setArticleDirection] = useState<'income' | 'expense'>('expense');
  const [articleParentId, setArticleParentId] = useState<number | ''>('');
  const [articleColor, setArticleColor] = useState('#2f6fef');

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
    try {
      const rows = await financeApi.listJournalTransactions({
        unclassified_only: unclassifiedOnly,
        target_ids: journalTargetFilter === 'all' ? undefined : [journalTargetFilter],
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

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (selectedTargetId) {
      loadModelData(selectedTargetId);
    } else {
      setArticleTree([]);
      setArticles([]);
      setMetrics([]);
      setBudget([]);
      setWidgets([]);
    }
  }, [selectedTargetId, period]);

  useEffect(() => {
    loadJournal();
  }, [journalFrom, journalTo, journalTargetFilter, journalDirectionFilter, unclassifiedOnly]);

  const openCreateModel = () => {
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
      const model = await financeApi.createModel({
        target_id: modelTargetId === '' ? null : Number(modelTargetId),
        target_name: modelTargetId === '' ? modelTargetName.trim() || modelName.trim() : null,
        target_code: modelTargetId === '' ? modelTargetCode.trim() || null : null,
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
    setArticleDirection('expense');
    setArticleParentId('');
    setArticleColor('#2f6fef');
    setArticleDialogOpen(true);
  };

  const openEditArticle = (article: FinanceArticle) => {
    setEditingArticle(article);
    setArticleName(article.name);
    setArticleCode(article.code || '');
    setArticleDirection(article.direction === 'income' ? 'income' : 'expense');
    setArticleParentId(article.parent_id || '');
    setArticleColor(article.color || '#2f6fef');
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
        cost_kind: 'none',
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

  const renderModelSelector = () => (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
      <FormControl size="small" sx={{ minWidth: 280 }}>
        <InputLabel>Финансовая модель</InputLabel>
        <Select
          label="Финансовая модель"
          value={selectedModelId === '' ? '' : String(selectedModelId)}
          onChange={(event) => setSelectedModelId(event.target.value === '' ? '' : Number(event.target.value))}
        >
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
                <IconButton size="small" color="error" onClick={() => deleteModel(model)}>
                  <Delete fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );

  const renderBudget = () => {
    const incomePlan = budgetArticles
      .filter((article) => article.direction === 'income')
      .reduce((sum, article) => sum + (budgetMap.get(article.id) || 0), 0);
    const expensePlan = budgetArticles
      .filter((article) => article.direction === 'expense')
      .reduce((sum, article) => sum + (budgetMap.get(article.id) || 0), 0);

    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h6">Бюджет</Typography>
            <Typography variant="body2" color="success.main">
              Доход: {money(incomePlan)}
            </Typography>
            <Typography variant="body2" color="error.main">
              Расход: {money(expensePlan)}
            </Typography>
            <Typography variant="body2">Итог: {money(incomePlan - expensePlan)}</Typography>
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
            </TableRow>
          </TableHead>
          <TableBody>
            {budgetArticles.map((article) => (
              <TableRow key={article.id}>
                <TableCell sx={{ pl: 2 + article.level * 3 }}>{article.name}</TableCell>
                <TableCell>{directionLabel(article.direction)}</TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    type="number"
                    value={budgetMap.get(article.id) ?? 0}
                    onChange={(event) => setBudgetAmount(article.id, Number(event.target.value || 0))}
                    inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                    sx={{ width: 160 }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {budgetArticles.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center">
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

  const renderJournal = () => (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
          <TextField
            label="С"
            type="date"
            size="small"
            value={journalFrom}
            onChange={(event) => setJournalFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="По"
            type="date"
            size="small"
            value={journalTo}
            onChange={(event) => setJournalTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" sx={{ minWidth: 190 }}>
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
          <FormControl size="small" sx={{ minWidth: 160 }}>
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
          >
            Неразобранные
          </Button>
          <Button
            startIcon={<Add />}
            variant="contained"
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
        </Stack>
      </Paper>

      {journalLoading && <LinearProgress />}
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Table size="small">
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
                        const updated = await financeApi.updateTransaction(row.id, { target_id });
                        setJournalRows((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
                        if (selectedTargetId) await loadModelData(selectedTargetId);
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
                          const updated = await financeApi.updateTransaction(row.id, { article_id });
                          setJournalRows((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
                          if (selectedTargetId) await loadModelData(selectedTargetId);
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
                <TableCell>{row.counterparty_name || '—'}</TableCell>
                <TableCell>{row.description || row.bank_source || '—'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Удалить операцию">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={async () => {
                        if (!window.confirm('Удалить операцию? Это действие необратимо.')) return;
                        await financeApi.deleteTransaction(row.id);
                        setJournalRows((prev) => prev.filter((r) => r.id !== row.id));
                        if (selectedTargetId) await loadModelData(selectedTargetId);
                      }}
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
      </Paper>
    </Stack>
  );

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
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

      {!selectedModel && (
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

      <Paper variant="outlined" sx={{ borderRadius: 1 }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 1 }}
        >
          <Tab value="dashboard" icon={<Dashboard />} iconPosition="start" label="Dashboard" />
          <Tab value="models" icon={<Assessment />} iconPosition="start" label="Модели" />
          <Tab value="budget" icon={<TableRows />} iconPosition="start" label="Бюджет" />
          <Tab value="articles" icon={<AccountTree />} iconPosition="start" label="Статьи" />
          <Tab value="journal" icon={<TableRows />} iconPosition="start" label="Журнал" />
        </Tabs>
      </Paper>

      {tab === 'dashboard' && renderDashboard()}
      {tab === 'models' && renderModels()}
      {tab === 'budget' && renderBudget()}
      {tab === 'articles' && renderArticles()}
      {tab === 'journal' && renderJournal()}

      <Dialog open={modelDialogOpen} onClose={() => setModelDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Финансовая модель</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Наименование" size="small" value={modelName} onChange={(e) => setModelName(e.target.value)} />
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
              <InputLabel>Существующий проект</InputLabel>
              <Select
                label="Существующий проект"
                value={modelTargetId === '' ? '' : String(modelTargetId)}
                onChange={(e) => setModelTargetId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">Создать новый проект</MenuItem>
                {targets.map((target) => (
                  <MenuItem key={target.id} value={target.id}>
                    {target.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {modelTargetId === '' && (
              <>
                <Divider />
                <TextField
                  label="Название нового проекта"
                  size="small"
                  value={modelTargetName}
                  onChange={(e) => setModelTargetName(e.target.value)}
                />
                <TextField
                  label="Код нового проекта"
                  size="small"
                  value={modelTargetCode}
                  onChange={(e) => setModelTargetCode(e.target.value)}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModelDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={createModel} disabled={!modelName.trim()}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={articleDialogOpen} onClose={() => setArticleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingArticle ? 'Редактировать статью' : 'Новая статья'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Наименование" size="small" value={articleName} onChange={(e) => setArticleName(e.target.value)} />
            <TextField label="Код" size="small" value={articleCode} onChange={(e) => setArticleCode(e.target.value)} />
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
            <TextField label="Цвет" size="small" value={articleColor} onChange={(e) => setArticleColor(e.target.value)} />
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
