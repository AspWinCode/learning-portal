import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
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
import { S } from './SalesReinviteEventPage.strings';

function hasNoShowTag(note: string | null | undefined): boolean {
  const lower = (note || '').toLowerCase();
  return lower.includes('[no-show]') || lower.includes('no-show');
}

interface NoShowRow {
  event: EventItem;
  registration: EventRegistration;
  lead: Lead | null;
}

const TAG_REINVITE_NEXT_EVENT = 'reinvite_next_event';

export const SalesReinviteEventPageContent: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reinviteLeads, setReinviteLeads] = useState<Lead[]>([]);
  const [registrationsByEvent, setRegistrationsByEvent] = useState<Map<number, EventRegistration[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventsMenuAnchor, setEventsMenuAnchor] = useState<{ el: HTMLElement; leadId: number; excludeEventId?: number } | null>(null);
  const [moveLoadingLeadId, setMoveLoadingLeadId] = useState<number | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const data = await salesApi.listEvents();
      setEvents(data);
      return data;
    } catch (err: any) {
      setError(extractApiError(err, S.loadError));
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

  const loadReinviteLeads = useCallback(async () => {
    try {
      const data = await salesApi.listLeads({ tag: TAG_REINVITE_NEXT_EVENT });
      setReinviteLeads(data);
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
    Promise.all([loadEvents(), loadLeads(), loadReinviteLeads()]).then(([data]) => {
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
  }, [loadEvents, loadLeads, loadReinviteLeads, loadAllRegistrations]);

  const leadMap = useMemo(() => {
    const map = new Map<number, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    return map;
  }, [leads]);

  const leadDisplayName = (lead: Lead) =>
    [lead.parent_full_name || lead.contact_name, lead.child_full_name].filter(Boolean).join(' / ') ||
    lead.phone ||
    `Лид #${lead.id}`;

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

  const eventsToOffer = useMemo(() => {
    if (!eventsMenuAnchor) return [];
    const exclude = eventsMenuAnchor.excludeEventId;
    return events
      .filter((e) => e.status === 'active' && e.id !== exclude)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [events, eventsMenuAnchor]);

  const handleOpenEventsMenu = (e: React.MouseEvent<HTMLElement>, leadId: number, excludeEventId?: number) => {
    e.stopPropagation();
    setEventsMenuAnchor({ el: e.currentTarget, leadId, excludeEventId });
  };

  const handleCloseEventsMenu = () => {
    setEventsMenuAnchor(null);
  };

  const handleSelectEventToMove = async (eventId: number) => {
    if (!eventsMenuAnchor) return;
    const { leadId } = eventsMenuAnchor;
    setMoveLoadingLeadId(leadId);
    setError(null);
    try {
      await salesApi.registerLeadToEvent(eventId, { lead_id: leadId });
      const lead = leadMap.get(leadId) ?? reinviteLeads.find((l) => l.id === leadId);
      if (lead && (lead.tags || []).includes(TAG_REINVITE_NEXT_EVENT)) {
        const nextTags = (lead.tags || []).filter((t) => t !== TAG_REINVITE_NEXT_EVENT);
        await salesApi.updateLead(leadId, { tags: nextTags });
      }
      handleCloseEventsMenu();
      await Promise.all([
        loadReinviteLeads(),
        loadAllRegistrations(events.map((ev) => ev.id)),
      ]);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось записать на мероприятие'));
    } finally {
      setMoveLoadingLeadId(null);
    }
  };

  return (
    <>
      <Stack spacing={2}>
        <Typography variant="h4">{S.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {S.description}{S.buildId}
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
                  <TableCell>{S.colEvent}</TableCell>
                  <TableCell>{S.colDate}</TableCell>
                  <TableCell>{S.colClient}</TableCell>
                  <TableCell>{S.colPhone}</TableCell>
                  <TableCell align="right">{S.colActions}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {noShowRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">
                        {S.emptyText}
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
                      <TableCell>{lead ? leadDisplayName(lead) : S.dash}</TableCell>
                      <TableCell>{lead?.phone ?? S.dash}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => navigate(`/sales/leads?open=${registration.lead_id}`)}
                          >
                            {S.btnLeadCard}
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={moveLoadingLeadId === registration.lead_id}
                            onClick={(e) => handleOpenEventsMenu(e, registration.lead_id, event.id)}
                          >
                            {moveLoadingLeadId === registration.lead_id ? '...' : S.btnEvents}
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

        {!loading && (
          <>
            <Typography variant="h6" sx={{ mt: 3 }}>
              {S.sectionFromPipeline}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{S.colClient}</TableCell>
                    <TableCell>{S.colPhone}</TableCell>
                    <TableCell align="right">{S.colActions}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reinviteLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography color="text.secondary">{S.emptyFromPipeline}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reinviteLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>{leadDisplayName(lead)}</TableCell>
                        <TableCell>{lead.phone ?? S.dash}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/sales/leads?open=${lead.id}`)}
                            >
                              {S.btnLeadCard}
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={moveLoadingLeadId === lead.id}
                              onClick={(e) => handleOpenEventsMenu(e, lead.id)}
                            >
                              {moveLoadingLeadId === lead.id ? '...' : S.btnEvents}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        <Menu
          anchorEl={eventsMenuAnchor?.el ?? null}
          open={!!eventsMenuAnchor}
          onClose={handleCloseEventsMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {eventsToOffer.length === 0 ? (
            <MenuItem disabled>Нет доступных мероприятий</MenuItem>
          ) : (
            eventsToOffer.map((ev) => (
              <MenuItem
                key={ev.id}
                onClick={() => void handleSelectEventToMove(ev.id)}
              >
                <Stack>
                  <Typography variant="body2">{ev.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isValid(parseISO(ev.starts_at)) ? format(parseISO(ev.starts_at), 'dd.MM.yyyy HH:mm') : ev.starts_at}
                  </Typography>
                </Stack>
              </MenuItem>
            ))
          )}
        </Menu>
      </Stack>
    </>
  );
};

const SalesReinviteEventPage: React.FC = () => (
  <Layout>
    <SalesReinviteEventPageContent />
  </Layout>
);

export default SalesReinviteEventPage;
