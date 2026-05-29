import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

import type {
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceMessage,
} from '../../types';

type OwnerWorkspaceCommsTabProps = {
  conversations: OwnerWorkspaceConversation[];
  conversationsFiltered: OwnerWorkspaceConversation[];
  commsDialogSearch: string;
  commsThreadSearch: string;
  commsContactId: number | null;
  commsMessages: OwnerWorkspaceMessage[];
  commsMessagesFiltered: OwnerWorkspaceMessage[];
  commsSelectedContact?: OwnerWorkspaceContact;
  canCreateTaskUi: boolean;
  canEditContactContentUi: (contactId: number) => boolean;
  onSyncMaxIntoWorkspace: () => void | Promise<void>;
  onCommsDialogSearchChange: (value: string) => void;
  onCommsThreadSearchChange: (value: string) => void;
  onSelectCommsContact: (contactId: number) => void | Promise<void>;
  onCreateTaskFromMessage: (message: OwnerWorkspaceMessage) => void;
  onLinkMessageToTask: (message: OwnerWorkspaceMessage) => void | Promise<void>;
  onOpenCommsContactCard: () => void | Promise<void>;
};

export function OwnerWorkspaceCommsTab({
  conversations,
  conversationsFiltered,
  commsDialogSearch,
  commsThreadSearch,
  commsContactId,
  commsMessages,
  commsMessagesFiltered,
  commsSelectedContact,
  canCreateTaskUi,
  canEditContactContentUi,
  onSyncMaxIntoWorkspace,
  onCommsDialogSearchChange,
  onCommsThreadSearchChange,
  onSelectCommsContact,
  onCreateTaskFromMessage,
  onLinkMessageToTask,
  onOpenCommsContactCard,
}: OwnerWorkspaceCommsTabProps) {
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Button variant="outlined" onClick={() => void onSyncMaxIntoWorkspace()}>
          Импорт MAX в переписки
        </Button>
        <Typography variant="caption" color="text.secondary">
          Исходящие из `max_messages` переносятся в ленту контакта по совпадению нормализованного телефона. Дубликаты по
          `id` пропускаются.
        </Typography>
      </Stack>
      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
              <Typography variant="h6" gutterBottom>
                Диалоги
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="Поиск по имени или тексту…"
                value={commsDialogSearch}
                onChange={(e) => onCommsDialogSearchChange(e.target.value)}
                sx={{ mb: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                {conversationsFiltered.length === conversations.length
                  ? `${conversations.length} диалогов`
                  : `Найдено ${conversationsFiltered.length} из ${conversations.length}`}
              </Typography>
              <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {conversationsFiltered.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {conversations.length === 0 ? 'Нет переписок с сообщениями.' : 'Ничего не найдено.'}
                  </Typography>
                )}
                {conversationsFiltered.map((conversation) => (
                  <Box
                    key={conversation.contact_id}
                    onClick={() => void onSelectCommsContact(conversation.contact_id)}
                    sx={{
                      p: 1,
                      border: '1px solid',
                      borderColor: commsContactId === conversation.contact_id ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      cursor: 'pointer',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2">{conversation.contact_name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {conversation.last_message_text || '—'}
                        </Typography>
                        {conversation.last_message_at ? (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                            {new Date(conversation.last_message_at).toLocaleString('ru-RU', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </Typography>
                        ) : null}
                      </Box>
                      {conversation.unread_count > 0 ? (
                        <Chip
                          size="small"
                          color="error"
                          label={conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                          sx={{ height: 22, flexShrink: 0 }}
                        />
                      ) : null}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
              <Typography variant="h6" gutterBottom>
                {commsContactId
                  ? `Переписка · ${commsSelectedContact?.full_name ?? `контакт #${commsContactId}`}`
                  : 'Выберите диалог слева'}
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="Поиск по сообщениям…"
                value={commsThreadSearch}
                onChange={(e) => onCommsThreadSearchChange(e.target.value)}
                disabled={!commsContactId}
                sx={{ mb: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              {commsContactId && commsThreadSearch.trim() && (
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                  Показано {commsMessagesFiltered.length} из {commsMessages.length}
                </Typography>
              )}
              <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {!commsContactId && (
                  <Typography variant="body2" color="text.secondary">
                    Лента сообщений появится после выбора контакта.
                  </Typography>
                )}
                {commsContactId &&
                  commsMessagesFiltered.map((message) => (
                    <Box
                      key={message.id}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        bgcolor: message.direction === 'outgoing' ? 'action.hover' : 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {message.direction} · {message.created_at ? new Date(message.created_at).toLocaleString('ru-RU') : ''}
                      </Typography>
                      <Typography variant="body2">{message.text}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        <Button
                          size="small"
                          disabled={!canCreateTaskUi || !canEditContactContentUi(message.contact_id)}
                          onClick={() => onCreateTaskFromMessage(message)}
                        >
                          Задача из сообщения
                        </Button>
                        <Button size="small" color="secondary" onClick={() => void onLinkMessageToTask(message)}>
                          К существующей задаче
                        </Button>
                      </Stack>
                    </Box>
                  ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Контекст
              </Typography>
              {!commsContactId && (
                <Typography variant="body2" color="text.secondary">
                  Выберите диалог, чтобы увидеть карточку контакта и быстрые действия.
                </Typography>
              )}
              {commsContactId && (
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">{commsSelectedContact?.full_name ?? `Контакт #${commsContactId}`}</Typography>
                  {commsSelectedContact?.phone && (
                    <Typography variant="body2" color="text.secondary">
                      {commsSelectedContact.phone}
                    </Typography>
                  )}
                  {commsSelectedContact?.company && (
                    <Typography variant="body2" color="text.secondary">
                      {commsSelectedContact.company}
                    </Typography>
                  )}
                  <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void onOpenCommsContactCard()}>
                    Открыть карточку контакта
                  </Button>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">
                    Непрочитанные в API пока не учитываются: поле зарезервировано под будущую синхронизацию.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
