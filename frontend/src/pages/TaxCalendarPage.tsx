import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import Layout from '../components/Layout';

type Regime = 'usn' | 'osno' | 'psn';
type TaxItem = { date: Date; title: string; detail: string; tone: 'primary' | 'warning' | 'success' | 'info' };

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

function getPatentItems(start: string, end: string): TaxItem[] {
  if (!start || !end) return [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];
  const durationDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (durationDays <= 150) {
    return [{ date: endDate, title: 'Оплата патента', detail: '100% стоимости — не позднее окончания действия патента', tone: 'primary' }];
  }
  return [
    { date: addDays(startDate, 89), title: '1-й платеж по патенту', detail: 'Не менее 1/3 стоимости — в течение 90 дней с начала действия', tone: 'primary' },
    { date: endDate, title: '2-й платеж по патенту', detail: 'Оставшиеся 2/3 — не позднее окончания действия патента', tone: 'primary' },
  ];
}

function buildItems(year: number, regime: Regime, patentStart: string, patentEnd: string): TaxItem[] {
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
  return [...getPatentItems(patentStart, patentEnd), ...common];
}

const TaxCalendarPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [regime, setRegime] = useState<Regime>('usn');
  const [patentStart, setPatentStart] = useState(`${currentYear}-01-01`);
  const [patentEnd, setPatentEnd] = useState(`${currentYear}-12-31`);
  const items = useMemo(() => buildItems(year, regime, patentStart, patentEnd).sort((a, b) => a.date.getTime() - b.date.getTime()), [year, regime, patentStart, patentEnd]);
  const nextSwitchDate = `${year}-12-31`;

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

        {regime === 'psn' && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>Параметры патента</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="date" label="Начало действия" InputLabelProps={{ shrink: true }} value={patentStart} onChange={(e) => setPatentStart(e.target.value)} /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth size="small" type="date" label="Окончание действия" InputLabelProps={{ shrink: true }} value={patentEnd} onChange={(e) => setPatentEnd(e.target.value)} /></Grid>
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
