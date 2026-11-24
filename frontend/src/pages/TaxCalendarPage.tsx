import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import Layout from '../components/Layout';
import { financeApi } from '../services/api';
import type { FinanceLedgerBankRow } from '../types';

type Regime = 'usn' | 'osno' | 'psn';
type TaxItem = { date: Date; title: string; detail: string; tone: 'primary' | 'warning' | 'success' | 'info' };
type ChecklistStep = { id: string; title: string; detail: string };

const regimeLabels: Record<Regime, string> = {
  usn: 'УСН 6% (доходы)',
  osno: 'ОСНО',
  psn: 'Патент (ПСН)',
};

function dateAt(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function defaultFixedContribution(year: number): number {
  if (year === 2026) return 57390;
  if (year === 2025) return 53658;
  return 0;
}

function defaultPatentCost(year: number): number {
  // Черемхово, Иркутская область, 2026: дополнительное образование и репетиторство,
  // без работников, полный календарный год.
  if (year === 2026) return 29262;
  return 0;
}

function getPatentItems(start: string, end: string, patentCost: number): TaxItem[] {
  if (!start || !end) return [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const durationDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (durationDays <= 150) {
    return [{ date: endDate, title: 'Оплата патента', detail: '100% стоимости — ' + patentCost.toLocaleString('ru-RU') + ' ₽, не позднее окончания действия патента', tone: 'primary' }];
  }
  return [
    { date: addDays(startDate, 89), title: '1-й платеж по патенту', detail: 'Не менее 1/3 стоимости — ' + (patentCost / 3).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽, в течение 90 дней с начала действия', tone: 'primary' },
    { date: endDate, title: '2-й платеж по патенту', detail: 'Оставшиеся 2/3 — ' + (patentCost * 2 / 3).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽, не позднее окончания действия патента', tone: 'primary' },
  ];
}

function buildItems(year: number, regime: Regime, patentStart: string, patentEnd: string, patentCost: number): TaxItem[] {
  const next = year + 1;
  const common: TaxItem[] = [
    { date: dateAt(year, 12, 28), title: 'Фиксированные страховые взносы ИП', detail: 'За себя, в совокупном размере за расчетный год', tone: 'success' },
    { date: dateAt(next, 7, 1), title: 'Дополнительный взнос 1%', detail: 'С дохода свыше 300 000 ₽ за предыдущий год', tone: 'success' },
  ];
  if (regime === 'usn') {
    return [
      { date: dateAt(year, 4, 28), title: 'Аванс по УСН за I квартал', detail: 'Уведомление об исчисленной сумме — до 27 апреля; уплата — до 28 апреля', tone: 'primary' },
      { date: dateAt(year, 7, 28), title: 'Аванс по УСН за полугодие', detail: 'Уведомление — до 27 июля; уплата — до 28 июля', tone: 'primary' },
      { date: dateAt(year, 10, 28), title: 'Аванс по УСН за 9 месяцев', detail: 'Уведомление — до 27 октября; уплата — до 28 октября', tone: 'primary' },
      { date: dateAt(next, 4, 30), title: 'Декларация и доплата УСН за год', detail: 'ИП: декларация и окончательный налог — не позднее 30 апреля следующего года', tone: 'warning' },
      ...common,
    ];
  }
  if (regime === 'osno') {
    return [
      { date: dateAt(year, 4, 28), title: 'Аванс НДФЛ за I квартал', detail: 'Уведомление — до 27 апреля; уплата — до 28 апреля', tone: 'primary' },
      { date: dateAt(year, 7, 28), title: 'Аванс НДФЛ за полугодие', detail: 'Уведомление — до 27 июля; уплата — до 28 июля', tone: 'primary' },
      { date: dateAt(year, 10, 28), title: 'Аванс НДФЛ за 9 месяцев', detail: 'Уведомление — до 27 октября; уплата — до 28 октября', tone: 'primary' },
      { date: dateAt(next, 4, 30), title: '3-НДФЛ за год', detail: 'Декларация ИП — не позднее 30 апреля следующего года', tone: 'warning' },
      { date: dateAt(next, 7, 15), title: 'НДФЛ по итогам года', detail: 'Окончательный НДФЛ — не позднее 15 июля следующего года', tone: 'warning' },
      { date: dateAt(year, 4, 25), title: 'Декларация по НДС за I квартал', detail: 'Квартальная декларация — не позднее 25 апреля', tone: 'info' },
      { date: dateAt(year, 7, 25), title: 'Декларация по НДС за II квартал', detail: 'Квартальная декларация — не позднее 25 июля', tone: 'info' },
      { date: dateAt(year, 10, 25), title: 'Декларация по НДС за III квартал', detail: 'Квартальная декларация — не позднее 25 октября', tone: 'info' },
      { date: dateAt(next, 1, 25), title: 'Декларация по НДС за IV квартал', detail: 'Квартальная декларация — не позднее 25 января следующего года', tone: 'info' },
      ...common,
    ];
  }
  return [...getPatentItems(patentStart, patentEnd, patentCost), ...common];
}

const TaxCalendarPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [regime, setRegime] = useState<Regime>('usn');
  const [patentStart, setPatentStart] = useState(`${currentYear}-01-01`);
  const [patentEnd, setPatentEnd] = useState(`${currentYear}-12-31`);
  const [patentCost, setPatentCost] = useState(defaultPatentCost(currentYear));
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [incomeCount, setIncomeCount] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [hasEmployees, setHasEmployees] = useState(false);
  const [fixedContributions, setFixedContributions] = useState(defaultFixedContribution(currentYear));
  const [additionalContributions, setAdditionalContributions] = useState(0);
  const [documentedExpenses, setDocumentedExpenses] = useState(0);
  const [completedChecklistIds, setCompletedChecklistIds] = useState<string[]>([]);
  const items = useMemo(() => buildItems(year, regime, patentStart, patentEnd, patentCost).sort((a, b) => a.date.getTime() - b.date.getTime()), [year, regime, patentStart, patentEnd, patentCost]);
  const nextSwitchDate = `${year}-12-31`;

  useEffect(() => {
    let active = true;
    setIncomeLoading(true);
    setIncomeError(null);
    Promise.all([
      financeApi.listJournalTransactions({ direction: 'income', date_from: `${year}-01-01`, date_to: `${year}-12-31`, limit: 50000, include_unassigned_targets: true }),
      financeApi.listJournalTransactions({ direction: 'expense', date_from: `${year}-01-01`, date_to: `${year}-12-31`, limit: 50000, include_unassigned_targets: true }),
    ]).then(([incomeRows, expenseRows]) => {
      if (!active) return;
      const sum = (rows: FinanceLedgerBankRow[]) => rows.reduce((total, row) => total + Math.abs(Number(row.amount) || 0), 0);
      setIncomeTotal(sum(incomeRows));
      setExpenseTotal(sum(expenseRows));
      setIncomeCount(incomeRows.length);
    }).catch((error) => {
      if (!active) return;
      setIncomeError(error instanceof Error ? error.message : 'Не удалось загрузить операции из финансового журнала');
      setIncomeTotal(0);
      setExpenseTotal(0);
      setIncomeCount(0);
    }).finally(() => {
      if (active) setIncomeLoading(false);
    });
    return () => { active = false; };
  }, [year]);

  useEffect(() => {
    setFixedContributions(defaultFixedContribution(year));
    setPatentCost(defaultPatentCost(year));
    setAdditionalContributions(0);
    setDocumentedExpenses(0);
  }, [year]);

  const taxCalculation = useMemo(() => {
    const grossUsn = incomeTotal * 0.06;
    const paidContributions = Math.max(0, Number(fixedContributions) || 0) + Math.max(0, Number(additionalContributions) || 0);
    const reductionLimit = hasEmployees ? grossUsn * 0.5 : grossUsn;
    const usnReduction = Math.min(grossUsn, reductionLimit, paidContributions);
    const usnPayable = Math.max(0, grossUsn - usnReduction);
    const osnoBase = Math.max(0, incomeTotal - Math.max(0, Number(documentedExpenses) || 0));
    const osnoNdfl = osnoBase * 0.13;
    const expectedAdditional = Math.max(0, incomeTotal - 300000) * 0.01;
    return { grossUsn, paidContributions, reductionLimit, usnReduction, usnPayable, osnoBase, osnoNdfl, expectedAdditional };
  }, [additionalContributions, documentedExpenses, fixedContributions, hasEmployees, incomeTotal]);

  const money = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const highlightedTax = regime === 'usn'
    ? { label: 'УСН до уменьшения', value: `${money(taxCalculation.grossUsn)} ₽`, hint: '6% от доходов' }
    : regime === 'osno'
      ? { label: 'ОСНО: ориентировочный НДФЛ', value: `${money(taxCalculation.osnoNdfl)} ₽`, hint: `13% от базы ${money(taxCalculation.osnoBase)} ₽` }
      : { label: 'Патент', value: patentCost ? `${money(patentCost)}` + ' ₽' : '—', hint: 'Черемхово · дополнительное образование' };
  const checklistSteps = useMemo<ChecklistStep[]>(() => {
    if (regime === 'usn') {
      return [
        { id: 'income', title: 'Сверить доходы за год', detail: 'Проверьте операции в журнале, уберите дубли и убедитесь, что в доходах остались только предпринимательские поступления.' },
        { id: 'contributions', title: 'Рассчитать страховые взносы', detail: 'Зафиксируйте обязательные взносы за себя и дополнительный 1% с дохода свыше 300 000 ₽.' },
        { id: 'limit', title: 'Проверить лимит уменьшения', detail: hasEmployees ? 'При работниках уменьшение УСН ограничено 50%; проверьте, что взносы не используются повторно.' : 'Без работников налог можно уменьшить вплоть до нуля, но только на фактически начисленные и уплаченные взносы.' },
        { id: 'payment', title: 'Подтвердить оплату взносов', detail: 'Сверьте платежи и сальдо ЕНС, чтобы взносы можно было учесть при расчете аванса или годового налога.' },
        { id: 'advance', title: 'Пересчитать аванс УСН', detail: 'Сначала посчитайте 6% от доходов, затем вычтите допустимую сумму взносов и проверьте сумму к доплате.' },
        { id: 'notification', title: 'Подать уведомление и оплатить налог', detail: 'Перед каждым сроком из календаря проверьте уведомление об исчисленной сумме и оплату через ЕНС.' },
        { id: 'declaration', title: 'Закрыть годовую декларацию', detail: 'Сверьте итоговый доход, взносы и авансы, затем подайте декларацию и доплатите остаток в установленный срок.' },
      ];
    }
    if (regime === 'osno') {
      return [
        { id: 'income', title: 'Сверить доходы и расходы', detail: 'Закройте финансовый журнал за период и проверьте, что операции относятся к правильному году.' },
        { id: 'primary', title: 'Собрать первичные документы', detail: 'Оставьте в расходах только затраты, связанные с доходом и подтвержденные договорами, актами, чеками и оплатой.' },
        { id: 'deduction', title: 'Выбрать способ учета расходов', detail: 'Сравните фактические подтвержденные расходы с профессиональным вычетом 20%, если документы невозможно собрать.' },
        { id: 'vat', title: 'Отдельно сверить НДС', detail: 'Проверьте книгу продаж, входной НДС, счета-фактуры, вычеты и квартальные декларации — они не входят в расчет НДФЛ на экране.' },
        { id: 'advance', title: 'Пересчитать аванс НДФЛ', detail: 'Проверьте налоговую базу после вычетов, аванс и уведомление об исчисленной сумме.' },
        { id: 'year-end', title: 'Закрыть год по ОСНО', detail: 'Подготовьте 3-НДФЛ, проверьте ЕНС и оплатите итоговый НДФЛ по срокам календаря.' },
      ];
    }
    return [
      { id: 'activity', title: 'Проверить право на патент', detail: 'Сверьте вид деятельности, муниципалитет, физические показатели и период действия патента.' },
      { id: 'cost', title: 'Подтвердить стоимость патента', detail: `Укажите сумму из патента: сейчас в расчете ${patentCost ? `${money(patentCost)} ₽` : 'сумма не задана'}.` },
      { id: 'schedule', title: 'Разнести платежи по срокам', detail: 'Проверьте график 1/3 и 2/3 либо единого платежа в зависимости от срока патента.' },
      { id: 'contributions', title: 'Рассчитать взносы для уменьшения', detail: 'Определите, какие взносы относятся к патентной деятельности и не были использованы в другом режиме.' },
      { id: 'notice', title: 'Подать уведомление КНД 1112021', detail: 'Передайте уведомление об уменьшении стоимости патента в ФНС и сохраните подтверждение отправки.' },
      { id: 'combine', title: 'Проверить совмещение режимов', detail: 'Не уменьшайте УСН и ПСН одними и теми же взносами; распределение зафиксируйте в учете.' },
      { id: 'change', title: 'Проверить изменения показателей', detail: 'Если площадь, число объектов или другой физический показатель изменились, уточните необходимость переоформления патента.' },
    ];
  }, [hasEmployees, money, patentCost, regime]);
  const checklistStorageKey = `tax-checklist:${year}:${regime}`;
  const completedChecklistCount = checklistSteps.filter((step) => completedChecklistIds.includes(step.id)).length;
  const checklistProgress = checklistSteps.length ? Math.round((completedChecklistCount / checklistSteps.length) * 100) : 0;
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(checklistStorageKey);
      setCompletedChecklistIds(saved ? JSON.parse(saved) : []);
    } catch {
      setCompletedChecklistIds([]);
    }
  }, [checklistStorageKey]);
  const toggleChecklistStep = (id: string) => {
    setCompletedChecklistIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(checklistStorageKey, JSON.stringify(next));
      return next;
    });
  };
  const resetChecklist = () => {
    window.localStorage.removeItem(checklistStorageKey);
    setCompletedChecklistIds([]);
  };
  const recommendations = useMemo(() => {
    if (regime === 'usn') {
      const remainingReduction = Math.max(0, taxCalculation.reductionLimit - taxCalculation.usnReduction);
      return [
        {
          title: 'Зачтите страховые взносы в уменьшение УСН',
          text: `Сейчас учтено ${money(taxCalculation.usnReduction)} ₽. Потенциально доступный остаток уменьшения — ${money(remainingReduction)} ₽, но только в пределах фактически начисленных/уплаченных взносов и правил ЕНС.`,
        },
        {
          title: hasEmployees ? 'Контролируйте лимит 50%' : 'Без работников можно уменьшить налог до 100%',
          text: hasEmployees
            ? 'При наличии работников взносы уменьшают налог не более чем на 50%. Не переносите одни и те же взносы одновременно на УСН и патент.'
            : 'Если работников нет, налог и авансы по УСН «Доходы» можно уменьшать на страховые взносы вплоть до нуля.',
        },
        {
          title: 'Сверяйте классификацию доходов',
          text: 'Перед расчетом аванса проверьте, что платежи не задублированы и относятся к предпринимательской деятельности. Расходы сами по себе не уменьшают УСН 6%.',
        },
        {
          title: 'Сравните УСН с патентом до переключения',
          text: `Ориентир для сравнения: УСН до уменьшения — ${money(taxCalculation.grossUsn)} ₽, стоимость патента — ${patentCost ? `${money(patentCost)} ₽` : 'не задана'}. Сравнивать нужно по виду деятельности, муниципалитету, сроку и возможности уменьшения на взносы.`,
        },
      ];
    }
    if (regime === 'osno') {
      return [
        {
          title: 'Подтверждайте расходы первичными документами',
          text: 'Для НДФЛ ИП учитывает фактически произведенные и документально подтвержденные расходы, непосредственно связанные с получением дохода.',
        },
        {
          title: 'Если документов нет — проверьте профессиональный вычет 20%',
          text: 'ФНС допускает профессиональный вычет в размере 20% дохода от предпринимательской деятельности, когда расходы невозможно документально подтвердить.',
        },
        {
          title: 'Ведите отдельный контроль НДС',
          text: 'НДС, входной налог и сроки деклараций не входят в ориентировочный НДФЛ на этом экране. Их нужно вести отдельным регистром и проверять право на освобождение или вычеты.',
        },
        {
          title: 'Сравните ОСНО с УСН и ПСН до смены режима',
          text: 'Сравнивайте не только ставку, но и расходы, НДС, страховые взносы, ограничения режима и региональные условия. Переключение должно быть подтверждено расчетом за полный год.',
        },
      ];
    }
    return [
      {
        title: 'Уменьшите стоимость патента на страховые взносы',
        text: `В расчет можно заложить до ${money(Math.min(patentCost, taxCalculation.paidContributions))} ₽ уменьшения, но фактическое распределение зависит от работников, периода патента и уже использованных взносов.`,
      },
      {
        title: 'Подайте уведомление об уменьшении патента',
        text: 'Для уменьшения стоимости патента используется уведомление по форме КНД 1112021. Система не отправляет его автоматически — срок и отправку нужно подтвердить в личном кабинете ФНС.',
      },
      {
        title: 'При совмещении режимов распределяйте взносы',
        text: 'Не учитывайте одни и те же страховые взносы повторно на УСН и ПСН. Распределение зависит от доходов и от того, в какой деятельности заняты работники.',
      },
      {
        title: 'Проверьте физические показатели патента',
        text: 'Если показатель, от которого зависит патент, уменьшился, проверьте возможность заменить патент или пересчитать его через налоговую.',
      },
    ];
  }, [hasEmployees, patentCost, regime, taxCalculation]);

  return (
    <Layout>
      <Box sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <EventAvailableIcon color="primary" />
              <Typography variant="h4" fontWeight={700}>Налоговый календарь ИП</Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>Owner · контроль сроков по выбранному режиму</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ minWidth: { md: 420 } }}>
            <FormControl fullWidth size="small">
              <InputLabel>Режим</InputLabel>
              <Select label="Режим" value={regime} onChange={(event) => setRegime(event.target.value as Regime)}>
                <MenuItem value="usn">УСН 6% (доходы)</MenuItem>
                <MenuItem value="osno">ОСНО</MenuItem>
                <MenuItem value="psn">Патент (ПСН)</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Год</InputLabel>
              <Select label="Год" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        <Alert icon={<AccountBalanceIcon />} severity="info" sx={{ mb: 3 }}>
          В календаре установлен режим <strong>{regimeLabels[regime]}</strong>. Это рабочая подсказка для планирования, а не замена проверке сроков в личном кабинете ФНС: при переносе выходных срок переносится на ближайший рабочий день.
        </Alert>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Расчет по операциям за {year}</Typography>
                <Typography variant="body2" color="text.secondary">Доходы берутся из финансового журнала по операциям с направлением «Доход».</Typography>
              </Box>
              {incomeLoading && <CircularProgress size={24} />}
            </Stack>
            {incomeError && <Alert severity="error" sx={{ mb: 2 }}>{incomeError}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}><Card variant="outlined"><CardContent><Typography color="text.secondary">Доходы</Typography><Typography variant="h5" fontWeight={700}>{money(incomeTotal)} ₽</Typography><Typography variant="caption" color="text.secondary">{incomeCount} операций</Typography></CardContent></Card></Grid>
              <Grid item xs={12} sm={4}><Card variant="outlined"><CardContent><Typography color="text.secondary">Расходы в журнале</Typography><Typography variant="h5" fontWeight={700}>{money(expenseTotal)} ₽</Typography><Typography variant="caption" color="text.secondary">для контроля, не уменьшают УСН 6%</Typography></CardContent></Card></Grid>
              <Grid item xs={12} sm={4}><Card variant="outlined" sx={{ bgcolor: 'primary.50' }}><CardContent><Typography color="text.secondary">{highlightedTax.label}</Typography><Typography variant="h5" fontWeight={700}>{highlightedTax.value}</Typography><Typography variant="caption" color="text.secondary">{highlightedTax.hint}</Typography></CardContent></Card></Grid>
            </Grid>
            {regime === 'usn' && (
              <>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={3}><TextField fullWidth size="small" type="number" label="Фиксированные взносы оплачены" value={fixedContributions} onChange={(e) => setFixedContributions(Number(e.target.value))} InputProps={{ endAdornment: <Typography variant="caption">₽</Typography> }} /></Grid>
                  <Grid item xs={12} md={3}><TextField fullWidth size="small" type="number" label="Доп. 1% оплачено" value={additionalContributions} onChange={(e) => setAdditionalContributions(Number(e.target.value))} InputProps={{ endAdornment: <Typography variant="caption">₽</Typography> }} /></Grid>
                  <Grid item xs={12} md={3}><FormControlLabel control={<Checkbox checked={hasEmployees} onChange={(e) => setHasEmployees(e.target.checked)} />} label="Есть работники" /></Grid>
                  <Grid item xs={12} md={3}><Typography variant="body2" color="text.secondary">Ожидаемый 1%: <strong>{money(taxCalculation.expectedAdditional)} ₽</strong></Typography></Grid>
                </Grid>
                <Alert severity="success" sx={{ mt: 2 }}>К доплате по УСН 6%: <strong>{money(taxCalculation.usnPayable)} ₽</strong>. Уменьшение на взносы: {money(taxCalculation.usnReduction)} ₽ из {money(taxCalculation.reductionLimit)} ₽ допустимого лимита.</Alert>
              </>
            )}
            {regime === 'osno' && (
              <>
                <Divider sx={{ my: 2 }} />
                <TextField fullWidth size="small" type="number" label="Документально подтвержденные расходы для ориентировочного НДФЛ" value={documentedExpenses} onChange={(e) => setDocumentedExpenses(Number(e.target.value))} InputProps={{ endAdornment: <Typography variant="caption">₽</Typography> }} />
                <Alert severity="warning" sx={{ mt: 2 }}>Ориентировочный НДФЛ: <strong>{money(taxCalculation.osnoNdfl)} ₽</strong> с базы {money(taxCalculation.osnoBase)} ₽. НДС, профессиональные вычеты и авансы требуют отдельного учета.</Alert>
              </>
            )}
            {regime === 'psn' && <Alert severity="info" sx={{ mt: 2 }}>Для города Черемхово установлена стоимость 29 262 ₽ на 2026 год для дополнительного образования и репетиторства. В других муниципалитетах Иркутской области сумма может отличаться.</Alert>}
          </CardContent>
        </Card>

        <Card sx={{ mb: 3, border: '1px solid', borderColor: 'warning.light' }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <LightbulbOutlinedIcon color="warning" />
              <Typography variant="h6" fontWeight={700}>Законные способы снизить налоговую нагрузку</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Рекомендации рассчитаны по выбранному режиму и данным журнала. Они не означают автоматическое право на вычет: подтверждайте операции, сроки и условия в ФНС.
            </Typography>
            <Stack spacing={1.5}>
              {recommendations.map((recommendation) => (
                <Box key={recommendation.title} sx={{ pl: 2, borderLeft: '3px solid', borderColor: 'warning.main' }}>
                  <Typography fontWeight={700}>{recommendation.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{recommendation.text}</Typography>
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Источники: <a href="https://www.nalog.gov.ru/rn77/ip/ip_pay_taxes/usn/" target="_blank" rel="noreferrer">ФНС — УСН</a>, <a href="https://www.nalog.gov.ru/rn77/ip/ip_pay_taxes/ndfl/" target="_blank" rel="noreferrer">ФНС — НДФЛ ИП</a>, <a href="https://www.nalog.gov.ru/rn77/about_fts/about_nalog/14140758/" target="_blank" rel="noreferrer">ФНС — уменьшение ПСН на взносы</a>.
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Пошаговый чек-лист уменьшения налогов</Typography>
                <Typography variant="body2" color="text.secondary">Отмечайте выполненные действия по режиму {regimeLabels[regime]}. Прогресс хранится отдельно для {year} года.</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={`${completedChecklistCount}/${checklistSteps.length}`} color={checklistProgress === 100 ? 'success' : 'primary'} />
                <Button size="small" onClick={resetChecklist} disabled={!completedChecklistCount}>Сбросить</Button>
              </Stack>
            </Stack>
            <LinearProgress variant="determinate" value={checklistProgress} sx={{ mb: 1.5, height: 7, borderRadius: 4 }} />
            <Typography variant="caption" color="text.secondary">Готово: {checklistProgress}%</Typography>
            <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
              {checklistSteps.map((step, index) => (
                <FormControlLabel
                  key={step.id}
                  sx={{ alignItems: 'flex-start', m: 0, py: 1 }}
                  control={<Checkbox checked={completedChecklistIds.includes(step.id)} onChange={() => toggleChecklistStep(step.id)} />}
                  label={<Box><Typography fontWeight={600}>{index + 1}. {step.title}</Typography><Typography variant="body2" color="text.secondary">{step.detail}</Typography></Box>}
                />
              ))}
            </Stack>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Чек-лист помогает не пропустить законные действия, но не заменяет проверку ограничений режима, ЕНС и документов в личном кабинете ФНС.
            </Alert>
          </CardContent>
        </Card>

        {regime === 'psn' && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>Параметры патента</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="date" label="Начало действия" InputLabelProps={{ shrink: true }} value={patentStart} onChange={(e) => setPatentStart(e.target.value)} /></Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="date" label="Окончание действия" InputLabelProps={{ shrink: true }} value={patentEnd} onChange={(e) => setPatentEnd(e.target.value)} /></Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth size="small" type="number" label="Стоимость патента, ₽" value={patentCost} onChange={(e) => setPatentCost(Number(e.target.value))} helperText="Черемхово, доп. образование" /></Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6" fontWeight={700}>Сроки на {year} год</Typography>
              <Chip label={`${items.length} событий`} color="primary" variant="outlined" />
            </Stack>
            <Divider />
            <Stack divider={<Divider flexItem />}>
              {items.length === 0 ? <Alert severity="warning" sx={{ mt: 2 }}>Проверьте даты действия патента.</Alert> : items.map((item) => (
                <Stack key={`${item.title}-${item.date.toISOString()}`} direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ py: 2 }}>
                  <Box sx={{ minWidth: { sm: 170 } }}><Typography fontWeight={700}>{formatDate(item.date)}</Typography><Chip size="small" label={item.tone === 'warning' ? 'годовой срок' : item.tone === 'success' ? 'взносы' : 'налог'} color={item.tone} sx={{ mt: 0.5 }} /></Box>
                  <Box><Typography fontWeight={600}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.detail}</Typography></Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ mt: 3, border: '1px solid', borderColor: 'primary.light' }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><SwapHorizIcon color="primary" /><Typography variant="h6" fontWeight={700}>Переключение режима</Typography></Stack>
            <Typography variant="body2" color="text.secondary">Для планирования смены режима ориентир — {nextSwitchDate}. Переход УСН ↔ ОСНО обычно планируется с начала нового года; для ПСН подается отдельное заявление на конкретный вид деятельности и срок патента. Перед подачей уведомления проверьте ограничения, лимиты доходов и региональные ставки.</Typography>
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
};

export default TaxCalendarPage;
