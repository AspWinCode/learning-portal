import React from 'react';
import { Box, Card, Chip, Stack, Typography } from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import { Lead } from '../../types';
import {
  arrivalChannelLabel,
  isLeadOverdue,
  isLeadDueToday,
  scheduledEventTypeLabel,
} from '../../utils/leadPipeline';

interface LeadKanbanCardProps {
  lead: Lead;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onOpen: (lead: Lead) => void;
}

/**
 * Карточка лида в канбане воронки: компактный, но информативный вид —
 * без открытия деталей менеджер видит ключевые данные (п.7 ТЗ).
 */
export const LeadKanbanCard: React.FC<LeadKanbanCardProps> = ({ lead, draggable, onDragStart, onDragEnd, onOpen }) => {
  const overdue = isLeadOverdue(lead);
  const dueToday = !overdue && isLeadDueToday(lead);

  const childName = lead.child_full_name?.trim();
  const parentName = (lead.parent_full_name || lead.contact_name || '').trim();
  const primaryName = childName || parentName || lead.phone || `Лид #${lead.id}`;
  const secondaryName = childName && parentName ? parentName : null;

  const createdLabel = (() => {
    const d = parseISO(lead.created_at);
    return isValid(d) ? format(d, 'dd.MM.yyyy') : null;
  })();

  const nextContactLabel = (() => {
    if (!lead.next_contact_at) return null;
    const d = parseISO(lead.next_contact_at);
    return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : null;
  })();

  const arrivalLabel = arrivalChannelLabel(lead.arrival_channel);
  const eventTypeLabel = scheduledEventTypeLabel(lead.scheduled_event_type);

  return (
    <Card
      variant="outlined"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead)}
      sx={{
        borderRadius: 2,
        p: 1.25,
        cursor: 'pointer',
        borderLeft: '4px solid',
        borderLeftColor: overdue ? 'error.main' : dueToday ? 'warning.main' : 'divider',
        '&:hover': { boxShadow: 2 },
      }}
    >
      <Stack spacing={0.5}>
        <Typography variant="subtitle2" fontWeight={600} noWrap title={primaryName}>
          {primaryName}
        </Typography>
        {secondaryName && (
          <Typography variant="caption" color="text.secondary" noWrap title={secondaryName}>
            Родитель: {secondaryName}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" noWrap>
          {lead.parent_phone || lead.phone || 'нет телефона'}
        </Typography>
        {(lead.city || lead.school_name || lead.school_class) && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {[lead.city, lead.school_name, lead.school_class ? `${lead.school_class} кл.` : null]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        )}

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {arrivalLabel && <Chip size="small" variant="outlined" label={arrivalLabel} />}
          {lead.source && <Chip size="small" variant="outlined" color="primary" label={lead.source} />}
          {lead.questionnaire_filled && <Chip size="small" color="info" variant="outlined" label="Из анкеты" />}
          {lead.arrival_channel === 'game_jam' && <Chip size="small" color="secondary" label="Game Jam" />}
          {lead.campaign_event_id && !( lead.arrival_channel === 'game_jam') && (
            <Chip size="small" color="secondary" variant="outlined" label={`Мероприятие #${lead.campaign_event_id}`} />
          )}
          {eventTypeLabel && <Chip size="small" color="default" variant="outlined" label={eventTypeLabel} />}
          {lead.no_answer_attempt ? (
            <Chip size="small" color="warning" variant="outlined" label={`Недозвон ${lead.no_answer_attempt}/3`} />
          ) : null}
        </Stack>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.disabled">
            {createdLabel ? `Создан ${createdLabel}` : ''}
          </Typography>
          {nextContactLabel && (
            <Typography
              variant="caption"
              sx={{ fontWeight: 600 }}
              color={overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary'}
            >
              {overdue ? 'Просрочено: ' : 'Контакт: '}
              {nextContactLabel}
            </Typography>
          )}
        </Stack>

        {lead.comment && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontStyle: 'italic',
            }}
          >
            {lead.comment}
          </Typography>
        )}

        <Box
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(lead);
          }}
          sx={{
            alignSelf: 'flex-start',
            mt: 0.5,
            fontSize: 12,
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Открыть →
        </Box>
      </Stack>
    </Card>
  );
};

export default LeadKanbanCard;
