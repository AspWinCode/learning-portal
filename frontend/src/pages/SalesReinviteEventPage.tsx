import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { EventItem, EventRegistration, Lead } from '../types';

function hasNoShowTag(note: string | null | undefined): boolean {
  const lower = (note || '').toLowerCase();
  return lower.includes('[no-show]') || lower.includes('no-show');
}

interface NoShowRow {
  event: EventItem;
  registration: EventRegistration;
  lead: Lead | null;
}

const SalesReinviteEventPage: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [registrationsByEvent, setRegistrationsByEvent] = useState<Map<number, EventRegistration[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const data = await salesApi.listEvents();
      setEvents(data);
      return data;
    } catch (err: any) {
      setError(extractApiError(err, '\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F'));
      return [];
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await salesApi.listLeads();
      setLeads(data);
    } catch {
      // ignore
    }
  }, []);

  const loadAllRegistrations = useCallback(async (eventIds: number[]) => {
    const results = await Promise.allSettled(
      eventIds.map((id) => salesApi.listEventRegistrations(id))
    );
    const map = new Map<number, EventRegistration[]>();
    results.forEach((result, index) => {
      const eventId = eventIds[index];
      if (result.status === 'fulfilled') {
        map.set(eventId, result.value);
      } else {
        map.set(eventId, []);
      }
    });
    setRegistrationsByEvent(map);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([loadEvents(), loadLeads()]).then(([data]) => {
      if (cancelled || !data.length) {
        setLoading(false);
        return;
      }
      loadAllRegistrations(data.map((e) => e.id)).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadEvents, loadLeads, loadAllRegistrations]);

  const leadMap = useMemo(() => {
    const map = new Map<number, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    return map;
  }, [leads]);

  const noShowRows = useMemo((): NoShowRow[] => {
    const rows: NoShowRow[] = [];
    events.forEach((event) => {
      const regs = registrationsByEvent.get(event.id) || [];
      regs.forEach((reg) => {
        if (reg.status === 'registered' && hasNoShowTag(reg.note)) {
          const lead = reg.lead ?? leadMap.get(reg.lead_id) ?? null;
          rows.push({
            event,
            registration: reg,
            lead,
          });
        }
      });
    });
    return rows.sort((a, b) => {
      const dateA = parseISO(a.event.starts_at).getTime();
      const dateB = parseISO(b.event.starts_at).getTime();
      return dateB - dateA;
    });
  }, [events, registrationsByEvent, leadMap]);

  return (
    <Layout>
      <Stack spacing={2}>
        <Typography variant="h4">{'\u041F\u043E\u0437\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430 \u043D\u0430 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {'\u0417\u0434\u0435\u0441\u044C \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u044E\u0442\u0441\u044F \u0442\u0435, \u043A\u0442\u043E \u043D\u0435 \u043F\u0440\u0438\u0448\u0451\u043B \u043D\u0430 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435 (\u043D\u0435\u044F\u0432\u043A\u0430). \u041C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u043B\u0438\u0434\u0430 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B \u00AB\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F\u00BB, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435.'}
        </Typography>
        {error && (
          <Alert severity="error">{error}</Alert>
        )}
        {loading ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress />
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{'\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435'}</TableCell>
                  <TableCell>{'\u0414\u0430\u0442\u0430 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F'}</TableCell>
                  <TableCell>{'\u041A\u043B\u0438\u0435\u043D\u0442'}</TableCell>
                  <TableCell>{'\u0422\u0435\u043B\u0435\u0444\u043E\u043D'}</TableCell>
                  <TableCell align="right">{'\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {noShowRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">
                        {'\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0441 \u043D\u0435\u044F\u0432\u043A\u043E\u0439. \u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u043D\u0435\u044F\u0432\u043A\u0443 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u00AB\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F\u00BB, \u0447\u0442\u043E\u0431\u044B \u043B\u0438\u0434\u044B \u043F\u043E\u044F\u0432\u0438\u043B\u0438\u0441\u044C \u0437\u0434\u0435\u0441\u044C.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  noShowRows.map(({ event, registration, lead }) => (
                    <TableRow key={`${event.id}-${registration.id}`}>
                      <TableCell>{event.title}</TableCell>
                      <TableCell>
                        {(() => {
                          const d = parseISO(event.starts_at);
                          return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : event.starts_at;
                        })()}
                      </TableCell>
                      <TableCell>{lead?.contact_name ?? '\u2014'}</TableCell>
                      <TableCell>{lead?.phone ?? '\u2014'}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => navigate(`/sales/leads?open=${registration.lead_id}`)}
                          >
                            {'\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043B\u0438\u0434\u0430'}
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => navigate('/sales/events')}
                          >
                            {'\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F'}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Layout>
  );
};

export default SalesReinviteEventPage;
