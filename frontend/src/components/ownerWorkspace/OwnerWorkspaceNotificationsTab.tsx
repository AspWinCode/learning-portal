import React from 'react';
import {
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';

import type { OwnerWorkspaceNotificationsEnvelope } from '../../types';

type OwnerWorkspaceNotificationsTabProps = {
  notifEnvelope: OwnerWorkspaceNotificationsEnvelope | null;
  notificationLabels: Record<string, string>;
  onRefresh: (limit?: number) => void | Promise<void>;
  onOpenTask: (taskId: number) => void | Promise<void>;
  onOpenComms: (contactId: number) => void | Promise<void>;
  onMarkRead: (notificationId: number) => void | Promise<void>;
};

export function OwnerWorkspaceNotificationsTab({
  notifEnvelope,
  notificationLabels,
  onRefresh,
  onOpenTask,
  onOpenComms,
  onMarkRead,
}: OwnerWorkspaceNotificationsTabProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
          <Typography variant="subtitle1">Все уведомления</Typography>
          <Button size="small" variant="outlined" onClick={() => void onRefresh(200)}>
            Обновить
          </Button>
          <Typography variant="caption" color="text.secondary">
            Дедлайны — при открытии списка; назначения, комментарии, обновления задач и входящие по контакту — по
            событиям.
          </Typography>
        </Stack>
        <Stack spacing={1} sx={{ maxHeight: 640, overflow: 'auto' }}>
          {(notifEnvelope?.items || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Пока пусто. Здесь: просрочки и дедлайны, назначения, комментарии и обновления задач, новые входящие по
              контактам (если вы вовлечены в задачи или проекты контакта).
            </Typography>
          )}
          {(notifEnvelope?.items || []).map((notification) => (
            <Card key={notification.id} variant="outlined" sx={{ bgcolor: notification.read_at ? 'transparent' : 'action.hover' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={notificationLabels[notification.kind] || notification.kind} />
                  {!notification.read_at && <Chip size="small" color="warning" label="Новое" />}
                  <Typography variant="caption" color="text.secondary">
                    {notification.created_at ? new Date(notification.created_at).toLocaleString('ru-RU') : ''}
                  </Typography>
                </Stack>
                <Typography variant="subtitle2">{notification.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {notification.body}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {notification.task_id != null && (
                    <Button size="small" variant="contained" onClick={() => void onOpenTask(notification.task_id!)}>
                      Открыть задачу
                    </Button>
                  )}
                  {notification.contact_id != null && (
                    <Button size="small" variant="outlined" onClick={() => void onOpenComms(notification.contact_id!)}>
                      Переписка
                    </Button>
                  )}
                  {!notification.read_at && (
                    <Button size="small" variant="outlined" onClick={() => void onMarkRead(notification.id)}>
                      Прочитано
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
