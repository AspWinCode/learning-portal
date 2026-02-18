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
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П'));
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
        <Typography variant="h4">╨Я╨╛╨╖╨▓╨░╤В╤М ╨╡╤Й╨╡ ╤А╨░╨╖ ╨╜╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡</Typography>
        <Typography variant="body2" color="text.secondary">
          ╨Ч╨┤╨╡╤Б╤М ╨╛╤В╨╛╨▒╤А╨░╨╢╨░╤О╤В╤Б╤П ╤В╨╡, ╨║╤В╨╛ ╨╜╨╡ ╤П╨▓╨╕╨╗╤Б╤П ╨╜╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡ (╨╜╨╡╤П╨▓╨║╨░). ╨Ь╨╛╨╢╨╜╨╛ ╨╛╤В╨║╤А╤Л╤В╤М ╨║╨░╤А╤В╨╛╤З╨║╤Г ╨╗╨╕╨┤╨░ ╨╕╨╗╨╕ ╨┐╨╡╤А╨╡╨╣╤В╨╕ ╨▓ ╤А╨░╨╖╨┤╨╡╨╗ ┬л╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П┬╗, ╤З╤В╨╛╨▒╤Л ╨╖╨░╨┐╨╕╤Б╨░╤В╤М ╨╜╨░ ╨┤╤А╤Г╨│╨╛╨╡ ╤Б╨╛╨▒╤Л╤В╨╕╨╡.
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
                  <TableCell>╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡</TableCell>
                  <TableCell>╨Ф╨░╤В╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П</TableCell>
                  <TableCell>╨Ъ╨╗╨╕╨╡╨╜╤В</TableCell>
                  <TableCell>╨в╨╡╨╗╨╡╤Д╨╛╨╜</TableCell>
                  <TableCell align="right">╨Ф╨╡╨╣╤Б╤В╨▓╨╕╤П</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {noShowRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">
                        ╨Э╨╡╤В ╨╖╨░╨┐╨╕╤Б╨╡╨╣ ╤Б ╨╜╨╡╤П╨▓╨║╨╛╨╣. ╨Ю╤В╨╝╨╡╤В╤М╤В╨╡ ╨╜╨╡╤П╨▓╨║╤Г ╨▓ ╤А╨░╨╖╨┤╨╡╨╗╨╡ ┬л╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П┬╗, ╤З╤В╨╛╨▒╤Л ╨╗╨╕╨┤╤Л ╨┐╨╛╤П╨▓╨╕╨╗╨╕╤Б╤М ╨╖╨┤╨╡╤Б╤М.
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
                      <TableCell>{lead?.contact_name ?? 'тАФ'}</TableCell>
                      <TableCell>{lead?.phone ?? 'тАФ'}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => navigate(`/sales/leads?open=${registration.lead_id}`)}
                          >
                            ╨Ъ╨░╤А╤В╨╛╤З╨║╨░ ╨╗╨╕╨┤╨░
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => navigate('/sales/events')}
                          >
                            ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П
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
