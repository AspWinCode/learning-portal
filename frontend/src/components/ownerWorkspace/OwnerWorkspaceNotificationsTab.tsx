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
          <Typography variant="subtitle1">Р’СЃРµ СѓРІРµРґРѕРјР»РµРЅРёСЏ</Typography>
          <Button size="small" variant="outlined" onClick={() => void onRefresh(200)}>
            РћР±РЅРѕРІРёС‚СЊ
          </Button>
          <Typography variant="caption" color="text.secondary">
            Р”РµРґР»Р°Р№РЅС‹ вЂ” РїСЂРё РѕС‚РєСЂС‹С‚РёРё СЃРїРёСЃРєР°; РЅР°Р·РЅР°С‡РµРЅРёСЏ, РєРѕРјРјРµРЅС‚Р°СЂРёРё, РѕР±РЅРѕРІР»РµРЅРёСЏ Р·Р°РґР°С‡ Рё РІС…РѕРґСЏС‰РёРµ РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ вЂ” РїРѕ
            СЃРѕР±С‹С‚РёСЏРј.
          </Typography>
        </Stack>
        <Stack spacing={1} sx={{ maxHeight: 640, overflow: 'auto' }}>
          {(notifEnvelope?.items || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">
              РџРѕРєР° РїСѓСЃС‚Рѕ. Р—РґРµСЃСЊ: РїСЂРѕСЃСЂРѕС‡РєРё Рё РґРµРґР»Р°Р№РЅС‹, РЅР°Р·РЅР°С‡РµРЅРёСЏ, РєРѕРјРјРµРЅС‚Р°СЂРёРё Рё РѕР±РЅРѕРІР»РµРЅРёСЏ Р·Р°РґР°С‡, РЅРѕРІС‹Рµ РІС…РѕРґСЏС‰РёРµ РїРѕ
              РєРѕРЅС‚Р°РєС‚Р°Рј (РµСЃР»Рё РІС‹ РІРѕРІР»РµС‡РµРЅС‹ РІ Р·Р°РґР°С‡Рё РёР»Рё РїСЂРѕРµРєС‚С‹ РєРѕРЅС‚Р°РєС‚Р°).
            </Typography>
          )}
          {(notifEnvelope?.items || []).map((notification) => (
            <Card key={notification.id} variant="outlined" sx={{ bgcolor: notification.read_at ? 'transparent' : 'action.hover' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={notificationLabels[notification.kind] || notification.kind} />
                  {!notification.read_at && <Chip size="small" color="warning" label="РќРѕРІРѕРµ" />}
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
                      РћС‚РєСЂС‹С‚СЊ Р·Р°РґР°С‡Сѓ
                    </Button>
                  )}
                  {notification.contact_id != null && (
                    <Button size="small" variant="outlined" onClick={() => void onOpenComms(notification.contact_id!)}>
                      РџРµСЂРµРїРёСЃРєР°
                    </Button>
                  )}
                  {!notification.read_at && (
                    <Button size="small" variant="outlined" onClick={() => void onMarkRead(notification.id)}>
                      РџСЂРѕС‡РёС‚Р°РЅРѕ
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
