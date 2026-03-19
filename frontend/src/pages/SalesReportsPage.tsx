import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi, usersApi } from '../services/api';
import { EventItem, EventRegistration, FollowUpItem, Lead, LeadStatus, User } from '../types';
import { extractApiError } from '../utils/extractApiError';

type Preset = '7d' | '14d' | '30d' | 'custom';

const SalesReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<Preset>('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [managerFilter, setManagerFilter] = useState<number | ''>('');
  const [eventFilter, setEventFilter] = useState<number | ''>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [followUpsToday, setFollowUpsToday] = useState<FollowUpItem[]>([]);
  const [followUpsWeek, setFollowUpsWeek] = useState<FollowUpItem[]>([]);
  const [followUpsOverdue, setFollowUpsOverdue] = useState<FollowUpItem[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = useCallback((nextPreset: Preset) => {
    if (nextPreset === 'custom') return;
    const now = new Date();
    const from = new Date(now);
    if (nextPreset === '7d') from.setDate(from.getDate() - 7);
    if (nextPreset === '14d') from.setDate(from.getDate() - 14);
    if (nextPreset === '30d') from.setDate(from.getDate() - 30);
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    applyPreset(preset);
  }, [preset, applyPreset]);

  const loadReportsData = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
      const toIso = new Date(`${toDate}T23:59:59`).toISOString();
      const [leadsData, eventsData, managersData, today, week, overdue] = await Promise.all([
        salesApi.listLeads({ created_from: fromIso, created_to: toIso, limit: 1000 }),
        salesApi.listEvents('active'),
        usersApi.getAll('sales').catch(() => [] as User[]),
        salesApi.listFollowUps({ period: 'today' }),
        salesApi.listFollowUps({ period: 'week' }),
        salesApi.listFollowUps({ period: 'overdue' }),
      ]);
      setLeads(leadsData.items);
      setEvents(eventsData);
      setManagers(managersData);
      setFollowUpsToday(today);
      setFollowUpsWeek(week);
      setFollowUpsOverdue(overdue);

      const inRangeEvents = eventsData.filter((ev) => {
        const starts = parseISO(ev.starts_at);
        return isValid(starts) && starts >= new Date(fromIso) && starts <= new Date(toIso);
      });
      const eventIds = eventFilter ? [Number(eventFilter)] : inRangeEvents.map((ev) => ev.id);
      if (eventIds.length === 0) {
        setRegistrations([]);
      } else {
        const regsResults = await Promise.allSettled(eventIds.map((id) => salesApi.listEventRegistrations(id)));
        const regs = regsResults.flatMap((res) => (res.status === 'fulfilled' ? res.value : []));
        setRegistrations(regs);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить отчеты sales'));
    } finally {
      setLoading(false);
    }
  }, [eventFilter, fromDate, toDate]);

  useEffect(() => {
    void loadReportsData();
  }, [loadReportsData]);

  const leadMap = useMemo(() => {
    const map = new Map<number, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    return map;
  }, [leads]);

  const filteredLeadIds = useMemo(() => {
    const source = managerFilter ? leads.filter((l) => l.owner_id === Number(managerFilter)) : leads;
    return new Set(source.map((l) => l.id));
  }, [leads, managerFilter]);

  const filteredLeads = useMemo(
    () => leads.filter((l) => filteredLeadIds.has(l.id)),
    [filteredLeadIds, leads]
  );

  const filteredRegs = useMemo(
    () => registrations.filter((r) => filteredLeadIds.has(r.lead_id)),
    [filteredLeadIds, registrations]
  );

  const filteredToday = useMemo(
    () => followUpsToday.filter((f) => filteredLeadIds.has(f.lead_id)),
    [filteredLeadIds, followUpsToday]
  );
  const filteredWeek = useMemo(
    () => followUpsWeek.filter((f) => filteredLeadIds.has(f.lead_id)),
    [filteredLeadIds, followUpsWeek]
  );
  const filteredOverdue = useMemo(
    () => followUpsOverdue.filter((f) => filteredLeadIds.has(f.lead_id)),
    [filteredLeadIds, followUpsOverdue]
  );

  const stageCounts = useMemo(() => {
    const statuses: LeadStatus[] = ['new', 'contacted', 'no_answer', 'demo', 'invoice_sent', 'won', 'lost', 'thinking', 'refused', 'trial_scheduled', 'event_registered', 'decided_immediately'];
    const base = statuses.reduce<Record<LeadStatus, number>>((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<LeadStatus, number>);
    filteredLeads.forEach((l) => {
      base[l.status] = (base[l.status] ?? 0) + 1;
    });
    return base;
  }, [filteredLeads]);

  const conversion = useMemo(() => {
    const registered = filteredRegs.filter((r) => r.status === 'registered');
    const hasTag = (v: string | null | undefined, tag: string) => (v || '').toLowerCase().includes(tag);
    const confirmed = registered.filter((r) => hasTag(r.note, '[confirmed]'));
    const came = registered.filter((r) => hasTag(r.note, '[came]'));
    const noShow = registered.filter((r) => hasTag(r.note, '[no-show]') || hasTag(r.note, 'no-show'));
    const offer = registered.filter((r) => {
      const lead = leadMap.get(r.lead_id);
      return lead?.status === 'invoice_sent' || lead?.status === 'won';
    });
    const paid = registered.filter((r) => leadMap.get(r.lead_id)?.status === 'won');
    return {
      registered: registered.length,
      confirmed: confirmed.length,
      came: came.length,
      noShow: noShow.length,
      offer: offer.length,
      paid: paid.length,
    };
  }, [filteredRegs, leadMap]);

  const lostReasons = useMemo(() => {
    const byReason: Record<string, number> = {};
    filteredLeads
      .filter((l) => l.status === 'lost')
      .forEach((l) => {
        const reason = (l.lost_reason || 'Не указано').trim();
        byReason[reason] = (byReason[reason] || 0) + 1;
      });
    return Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filteredLeads]);

  const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const schoolStats = useMemo(() => {
    const hasTag = (v: string | null | undefined, tag: string) => (v || '').toLowerCase().includes(tag);
    const bySchoolLeadIds: Record<string, Set<number>> = {};
    const bySchoolPaidIds: Record<string, Set<number>> = {};
    const bySchoolRegisteredIds: Record<string, Set<number>> = {};
    const bySchoolCameIds: Record<string, Set<number>> = {};
    const bySchoolMinutes: Record<string, number> = {};
    const bySchoolClasses: Record<string, Set<string>> = {};
    const leadSchoolMap = new Map<number, string>();

    filteredLeads.forEach((lead) => {
      const school = (lead.school_name || '').trim();
      if (!school) return;
      leadSchoolMap.set(lead.id, school);
      if (!bySchoolLeadIds[school]) bySchoolLeadIds[school] = new Set<number>();
      if (!bySchoolPaidIds[school]) bySchoolPaidIds[school] = new Set<number>();
      if (!bySchoolClasses[school]) bySchoolClasses[school] = new Set<string>();
      if (!bySchoolMinutes[school]) bySchoolMinutes[school] = 0;
      bySchoolLeadIds[school].add(lead.id);
      if (lead.status === 'won') bySchoolPaidIds[school].add(lead.id);
      if (lead.outreach_minutes && lead.outreach_minutes > 0) bySchoolMinutes[school] += lead.outreach_minutes;
      const cls = (lead.school_class || '').trim();
      if (cls) bySchoolClasses[school].add(cls);
    });

    filteredRegs.forEach((reg) => {
      const school = leadSchoolMap.get(reg.lead_id);
      if (!school) return;
      if (!bySchoolRegisteredIds[school]) bySchoolRegisteredIds[school] = new Set<number>();
      bySchoolRegisteredIds[school].add(reg.lead_id);
      if (hasTag(reg.note, '[came]')) {
        if (!bySchoolCameIds[school]) bySchoolCameIds[school] = new Set<number>();
        bySchoolCameIds[school].add(reg.lead_id);
      }
    });

    return Object.keys(bySchoolLeadIds)
      .map((school) => {
        const leadsCount = bySchoolLeadIds[school]?.size || 0;
        const registeredCount = bySchoolRegisteredIds[school]?.size || 0;
        const cameCount = bySchoolCameIds[school]?.size || 0;
        const paidCount = bySchoolPaidIds[school]?.size || 0;
        return {
          school,
          leads: leadsCount,
          registered: registeredCount,
          came: cameCount,
          paid: paidCount,
          convRegistered: pct(registeredCount, leadsCount),
          convCame: pct(cameCount, registeredCount || leadsCount),
          convPaid: pct(paidCount, cameCount || registeredCount || leadsCount),
          classes: bySchoolClasses[school]?.size || 0,
          minutes: bySchoolMinutes[school] || 0,
        };
      })
      .sort((a, b) => b.leads - a.leads);
  }, [filteredLeads, filteredRegs]);

  const classStats = useMemo(() => {
    const acc: Record<string, { school: string; className: string; leads: number; won: number; minutes: number }> = {};
    filteredLeads.forEach((lead) => {
      const school = (lead.school_name || '').trim();
      const className = (lead.school_class || '').trim();
      if (!school || !className) return;
      const key = `${school}::${className}`;
      if (!acc[key]) acc[key] = { school, className, leads: 0, won: 0, minutes: 0 };
      acc[key].leads += 1;
      if (lead.status === 'won') acc[key].won += 1;
      if (lead.outreach_minutes && lead.outreach_minutes > 0) acc[key].minutes += lead.outreach_minutes;
    });
    return Object.values(acc).map((row) => ({ ...row, conv: pct(row.won, row.leads) })).sort((a, b) => b.leads - a.leads);
  }, [filteredLeads]);

  const outreachSummary = useMemo(() => {
    const schoolsVisited = new Set(filteredLeads.map((l) => (l.school_name || '').trim()).filter(Boolean)).size;
    const classesVisited = new Set(
      filteredLeads
        .map((l) => ({ school: (l.school_name || '').trim(), cls: (l.school_class || '').trim() }))
        .filter((x) => Boolean(x.school && x.cls))
        .map((x) => `${x.school}::${x.cls}`)
    ).size;
    const totalMinutes = filteredLeads.reduce((sum, l) => sum + (l.outreach_minutes && l.outreach_minutes > 0 ? l.outreach_minutes : 0), 0);
    return { schoolsVisited, classesVisited, totalMinutes };
  }, [filteredLeads]);

  const handleExportCsv = () => {
    const rows: string[][] = [
      ['section', 'metric', 'value'],
      ['filters', 'period', preset],
      ['filters', 'from_date', fromDate || ''],
      ['filters', 'to_date', toDate || ''],
      ['filters', 'manager_id', managerFilter ? String(managerFilter) : 'all'],
      ['filters', 'event_id', eventFilter ? String(eventFilter) : 'all'],
      ['kpi', 'leads_in_period', String(filteredLeads.length)],
      ['kpi', 'followups_today', String(filteredToday.length)],
      ['kpi', 'followups_week', String(filteredWeek.length)],
      ['kpi', 'followups_overdue', String(filteredOverdue.length)],
      ['kpi', 'schools_visited', String(outreachSummary.schoolsVisited)],
      ['kpi', 'classes_visited', String(outreachSummary.classesVisited)],
      ['kpi', 'outreach_minutes_total', String(outreachSummary.totalMinutes)],
      ['stages', 'new', String(stageCounts.new)],
      ['stages', 'contacted', String(stageCounts.contacted)],
      ['stages', 'demo', String(stageCounts.demo)],
      ['stages', 'invoice_sent', String(stageCounts.invoice_sent)],
      ['stages', 'won', String(stageCounts.won)],
      ['stages', 'lost', String(stageCounts.lost)],
      ['events_chain', 'registered', String(conversion.registered)],
      ['events_chain', 'confirmed', String(conversion.confirmed)],
      ['events_chain', 'came', String(conversion.came)],
      ['events_chain', 'no_show', String(conversion.noShow)],
      ['events_chain', 'offer', String(conversion.offer)],
      ['events_chain', 'paid', String(conversion.paid)],
    ];
    lostReasons.forEach(([reason, count]) => rows.push(['lost_reason', reason, String(count)]));
    schoolStats.forEach((s) =>
      rows.push([
        'school',
        s.school,
        `${s.leads} leads / ${s.registered} registered / ${s.came} came / ${s.paid} paid / paid_conv ${s.convPaid}%`,
      ])
    );
    classStats.forEach((c) => rows.push(['class', `${c.school} ${c.className}`, `${c.leads} leads / ${c.won} won / ${c.conv}% / ${c.minutes}m`]));

    const escapeCell = (value: string) => `"${(value || '').replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_reports_${fromDate || 'from'}_${toDate || 'to'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Отчёты продаж</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={handleExportCsv} disabled={loading}>
            Экспорт CSV
          </Button>
          <Button variant="outlined" onClick={() => void loadReportsData()} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="preset-label">Период</InputLabel>
              <Select
                labelId="preset-label"
                label="Период"
                value={preset}
                onChange={(e) => setPreset(e.target.value as Preset)}
              >
                <MenuItem value="7d">7 дней</MenuItem>
                <MenuItem value="14d">14 дней</MenuItem>
                <MenuItem value="30d">30 дней</MenuItem>
                <MenuItem value="custom">Свой</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="date"
              label="С"
              InputLabelProps={{ shrink: true }}
              value={fromDate}
              onChange={(e) => {
                setPreset('custom');
                setFromDate(e.target.value);
              }}
            />
            <TextField
              size="small"
              type="date"
              label="По"
              InputLabelProps={{ shrink: true }}
              value={toDate}
              onChange={(e) => {
                setPreset('custom');
                setToDate(e.target.value);
              }}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="manager-filter-label">Менеджер</InputLabel>
              <Select
                labelId="manager-filter-label"
                label="Менеджер"
                value={managerFilter}
                onChange={(e) => setManagerFilter((e.target.value as number) || '')}
              >
                <MenuItem value="">Все менеджеры</MenuItem>
                {managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="event-filter-label">Мероприятие</InputLabel>
              <Select
                labelId="event-filter-label"
                label="Мероприятие"
                value={eventFilter}
                onChange={(e) => setEventFilter((e.target.value as number) || '')}
              >
                <MenuItem value="">Все мероприятия</MenuItem>
                {events.map((ev) => (
                  <MenuItem key={ev.id} value={ev.id}>{ev.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={3}>
          <Card variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate('/sales/leads')}>
            <CardContent>
              <Typography variant="caption">Лиды в периоде</Typography>
              <Typography variant="h5">{filteredLeads.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Фоллоу-апы сегодня</Typography>
              <Typography variant="h5">{filteredToday.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Фоллоу-апы неделя</Typography>
              <Typography variant="h5">{filteredWeek.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption">Просроченные</Typography>
              <Typography variant="h5" color={filteredOverdue.length > 0 ? 'error.main' : 'text.primary'}>
                {filteredOverdue.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} mb={2}>
        <Grid item xs={12} md={4}><Card variant="outlined"><CardContent><Typography variant="caption">Школ обошли (период)</Typography><Typography variant="h5">{outreachSummary.schoolsVisited}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card variant="outlined"><CardContent><Typography variant="caption">Классов обошли (период)</Typography><Typography variant="h5">{outreachSummary.classesVisited}</Typography></CardContent></Card></Grid>
        <Grid item xs={12} md={4}><Card variant="outlined"><CardContent><Typography variant="caption">Время обходов (мин)</Typography><Typography variant="h5">{outreachSummary.totalMinutes}</Typography></CardContent></Card></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>Конверсия по стадиям</Typography>
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell>Новый</TableCell><TableCell align="right">{stageCounts.new}</TableCell></TableRow>
                  <TableRow><TableCell>Связались</TableCell><TableCell align="right">{stageCounts.contacted}</TableCell></TableRow>
                  <TableRow><TableCell>Демо</TableCell><TableCell align="right">{stageCounts.demo}</TableCell></TableRow>
                  <TableRow><TableCell>Инвойс</TableCell><TableCell align="right">{stageCounts.invoice_sent}</TableCell></TableRow>
                  <TableRow><TableCell>Оплатил</TableCell><TableCell align="right">{stageCounts.won}</TableCell></TableRow>
                  <TableRow><TableCell>Lost</TableCell><TableCell align="right">{stageCounts.lost}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>Запись → Явка → Оплата</Typography>
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell>Зарегистрировано</TableCell><TableCell align="right">{conversion.registered}</TableCell></TableRow>
                  <TableRow><TableCell>Подтверждено</TableCell><TableCell align="right">{conversion.confirmed} ({pct(conversion.confirmed, conversion.registered)}%)</TableCell></TableRow>
                  <TableRow><TableCell>Пришли</TableCell><TableCell align="right">{conversion.came} ({pct(conversion.came, conversion.confirmed || conversion.registered)}%)</TableCell></TableRow>
                  <TableRow><TableCell>No-show</TableCell><TableCell align="right">{conversion.noShow} ({pct(conversion.noShow, conversion.registered)}%)</TableCell></TableRow>
                  <TableRow><TableCell>Оффер</TableCell><TableCell align="right">{conversion.offer} ({pct(conversion.offer, conversion.came || conversion.registered)}%)</TableCell></TableRow>
                  <TableRow><TableCell>Оплата</TableCell><TableCell align="right">{conversion.paid} ({pct(conversion.paid, conversion.offer || conversion.came || conversion.registered)}%)</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>Причины отказов</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Причина</TableCell>
                    <TableCell align="right">Кол-во</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lostReasons.map(([reason, count]) => (
                    <TableRow key={reason}>
                      <TableCell>{reason}</TableCell>
                      <TableCell align="right">{count}</TableCell>
                    </TableRow>
                  ))}
                  {lostReasons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography color="text.secondary">Нет закрытых лидов за выбранный период</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>Конверсия по школам</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Школа</TableCell>
                    <TableCell align="right">Лиды</TableCell>
                    <TableCell align="right">Записались</TableCell>
                    <TableCell align="right">Пришли</TableCell>
                    <TableCell align="right">Оплатили</TableCell>
                    <TableCell align="right">Конв. в запись</TableCell>
                    <TableCell align="right">Конв. в приход</TableCell>
                    <TableCell align="right">Конв. в оплату</TableCell>
                    <TableCell align="right">Время (мин)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schoolStats.slice(0, 15).map((row) => (
                    <TableRow key={row.school}>
                      <TableCell>{row.school}</TableCell>
                      <TableCell align="right">{row.leads}</TableCell>
                      <TableCell align="right">{row.registered}</TableCell>
                      <TableCell align="right">{row.came}</TableCell>
                      <TableCell align="right">{row.paid}</TableCell>
                      <TableCell align="right">{row.convRegistered}%</TableCell>
                      <TableCell align="right">{row.convCame}%</TableCell>
                      <TableCell align="right">{row.convPaid}%</TableCell>
                      <TableCell align="right">{row.minutes}</TableCell>
                    </TableRow>
                  ))}
                  {schoolStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <Typography color="text.secondary">Нет данных по школам</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>Конверсия по классам</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Школа/Класс</TableCell>
                    <TableCell align="right">Лиды</TableCell>
                    <TableCell align="right">Оплатили</TableCell>
                    <TableCell align="right">Конверсия</TableCell>
                    <TableCell align="right">Время (мин)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classStats.slice(0, 20).map((row) => (
                    <TableRow key={`${row.school}-${row.className}`}>
                      <TableCell>{row.school} / {row.className}</TableCell>
                      <TableCell align="right">{row.leads}</TableCell>
                      <TableCell align="right">{row.won}</TableCell>
                      <TableCell align="right">{row.conv}%</TableCell>
                      <TableCell align="right">{row.minutes}</TableCell>
                    </TableRow>
                  ))}
                  {classStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography color="text.secondary">Нет данных по классам</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
};

export default SalesReportsPage;
