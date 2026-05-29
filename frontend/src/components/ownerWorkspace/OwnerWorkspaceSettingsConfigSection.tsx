import React from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import type {
  OwnerWorkspaceNotificationConfig,
  OwnerWorkspaceNotificationDeliveryStats,
  OwnerWorkspaceProjectConfig,
  OwnerWorkspaceTagDictionary,
  OwnerWorkspaceTaskConfig,
  OwnerWorkspaceWebPushStatus,
} from '../../types';

type PermissionMatrixRow = {
  action: string;
  adminOwner: string;
  limited: string;
  projectOwner: string;
  manager: string;
  member: string;
  observer: string;
};

type OwnerWorkspaceSettingsConfigSectionProps = {
  taskViewMode: 'list' | 'kanban' | 'calendar';
  taskListRowsPerPage: number;
  digestDueHours: number;
  digestScope: 'all' | 'mine';
  notifyEmailEnabled: boolean;
  notifyWebPushEnabled: boolean;
  notifyTaskOverdue: boolean;
  notifyTaskDueSoon: boolean;
  notifyTaskAssigned: boolean;
  notifyTaskComment: boolean;
  notifyTaskUpdated: boolean;
  notifyContactIncomingMessage: boolean;
  notifyTaskMention: boolean;
  webPushStatus: OwnerWorkspaceWebPushStatus | null;
  webPushBrowserSupported: boolean;
  webPushPermission: string;
  webPushConnected: boolean;
  webPushBusy: boolean;
  notificationLabels: Record<string, string>;
  notificationConfigMap: Record<string, { label: string; enabled: boolean }>;
  settingsSaving: boolean;
  taskConfigDraft: OwnerWorkspaceTaskConfig | null;
  taskConfigSaving: boolean;
  projectConfigDraft: OwnerWorkspaceProjectConfig | null;
  projectConfigSaving: boolean;
  permissionMatrixRows: PermissionMatrixRow[];
  notificationConfigDraft: OwnerWorkspaceNotificationConfig | null;
  notificationConfigSaving: boolean;
  notificationDeliveryStats: OwnerWorkspaceNotificationDeliveryStats | null;
  notificationDeliveryStatsLoading: boolean;
  notificationDeliveryRetrying: number | 'all' | null;
  taskTagDictionaryDraft: OwnerWorkspaceTagDictionary;
  taskTagDictionarySaving: boolean;
  contactTagDictionaryDraft: OwnerWorkspaceTagDictionary;
  contactTagDictionarySaving: boolean;
  contactSourceDictionaryDraft: OwnerWorkspaceTagDictionary;
  contactSourceDictionarySaving: boolean;
  onTaskViewModeChange: (value: 'list' | 'kanban' | 'calendar') => void;
  onTaskListRowsPerPageChange: (value: number) => void;
  onDigestDueHoursChange: (value: number) => void;
  onDigestScopeChange: (value: 'all' | 'mine') => void;
  onNotifyEmailEnabledChange: (value: boolean) => void;
  onNotifyWebPushEnabledChange: (value: boolean) => void;
  onNotifyTaskOverdueChange: (value: boolean) => void;
  onNotifyTaskDueSoonChange: (value: boolean) => void;
  onNotifyTaskAssignedChange: (value: boolean) => void;
  onNotifyTaskCommentChange: (value: boolean) => void;
  onNotifyTaskUpdatedChange: (value: boolean) => void;
  onNotifyContactIncomingMessageChange: (value: boolean) => void;
  onNotifyTaskMentionChange: (value: boolean) => void;
  onConnectWebPush: () => void | Promise<void>;
  onDisconnectWebPush: () => void | Promise<void>;
  onSaveWorkspaceSettings: () => void | Promise<void>;
  onTaskStatusLabelChange: (index: number, value: string) => void;
  onTaskStatusEnabledChange: (index: number, value: boolean) => void;
  onTaskPriorityLabelChange: (index: number, value: string) => void;
  onTaskPriorityEnabledChange: (index: number, value: boolean) => void;
  onSaveWorkspaceTaskConfig: () => void | Promise<void>;
  onResetTaskConfig: () => void;
  onProjectStatusLabelChange: (index: number, value: string) => void;
  onProjectStatusEnabledChange: (index: number, value: boolean) => void;
  onSaveWorkspaceProjectConfig: () => void | Promise<void>;
  onResetProjectConfig: () => void;
  onNotificationConfigLabelChange: (index: number, value: string) => void;
  onNotificationConfigEnabledChange: (index: number, value: boolean) => void;
  onSaveWorkspaceNotificationConfig: () => void | Promise<void>;
  onResetNotificationConfig: () => void;
  onLoadNotificationDeliveryStats: () => void | Promise<void>;
  onRetryNotificationDelivery: (ids: number[]) => void | Promise<void>;
  onTaskTagDictionaryDraftChange: (items: string[]) => void;
  onSaveWorkspaceTaskTagDictionary: () => void | Promise<void>;
  onResetTaskTagDictionary: () => void;
  onContactTagDictionaryDraftChange: (items: string[]) => void;
  onSaveWorkspaceContactTagDictionary: () => void | Promise<void>;
  onResetContactTagDictionary: () => void;
  onContactSourceDictionaryDraftChange: (items: string[]) => void;
  onSaveWorkspaceContactSourceDictionary: () => void | Promise<void>;
  onResetContactSourceDictionary: () => void;
};

export function OwnerWorkspaceSettingsConfigSection({
  taskViewMode,
  taskListRowsPerPage,
  digestDueHours,
  digestScope,
  notifyEmailEnabled,
  notifyWebPushEnabled,
  notifyTaskOverdue,
  notifyTaskDueSoon,
  notifyTaskAssigned,
  notifyTaskComment,
  notifyTaskUpdated,
  notifyContactIncomingMessage,
  notifyTaskMention,
  webPushStatus,
  webPushBrowserSupported,
  webPushPermission,
  webPushConnected,
  webPushBusy,
  notificationLabels,
  notificationConfigMap,
  settingsSaving,
  taskConfigDraft,
  taskConfigSaving,
  projectConfigDraft,
  projectConfigSaving,
  permissionMatrixRows,
  notificationConfigDraft,
  notificationConfigSaving,
  notificationDeliveryStats,
  notificationDeliveryStatsLoading,
  notificationDeliveryRetrying,
  taskTagDictionaryDraft,
  taskTagDictionarySaving,
  contactTagDictionaryDraft,
  contactTagDictionarySaving,
  contactSourceDictionaryDraft,
  contactSourceDictionarySaving,
  onTaskViewModeChange,
  onTaskListRowsPerPageChange,
  onDigestDueHoursChange,
  onDigestScopeChange,
  onNotifyEmailEnabledChange,
  onNotifyWebPushEnabledChange,
  onNotifyTaskOverdueChange,
  onNotifyTaskDueSoonChange,
  onNotifyTaskAssignedChange,
  onNotifyTaskCommentChange,
  onNotifyTaskUpdatedChange,
  onNotifyContactIncomingMessageChange,
  onNotifyTaskMentionChange,
  onConnectWebPush,
  onDisconnectWebPush,
  onSaveWorkspaceSettings,
  onTaskStatusLabelChange,
  onTaskStatusEnabledChange,
  onTaskPriorityLabelChange,
  onTaskPriorityEnabledChange,
  onSaveWorkspaceTaskConfig,
  onResetTaskConfig,
  onProjectStatusLabelChange,
  onProjectStatusEnabledChange,
  onSaveWorkspaceProjectConfig,
  onResetProjectConfig,
  onNotificationConfigLabelChange,
  onNotificationConfigEnabledChange,
  onSaveWorkspaceNotificationConfig,
  onResetNotificationConfig,
  onLoadNotificationDeliveryStats,
  onRetryNotificationDelivery,
  onTaskTagDictionaryDraftChange,
  onSaveWorkspaceTaskTagDictionary,
  onResetTaskTagDictionary,
  onContactTagDictionaryDraftChange,
  onSaveWorkspaceContactTagDictionary,
  onResetContactTagDictionary,
  onContactSourceDictionaryDraftChange,
  onSaveWorkspaceContactSourceDictionary,
  onResetContactSourceDictionary,
}: OwnerWorkspaceSettingsConfigSectionProps) {
  return (
    <>
      <Stack spacing={2} sx={{ maxWidth: 480 }}>
        <TextField
          select
          fullWidth
          label="Вид списка задач по умолчанию"
          value={taskViewMode}
          onChange={(e) => onTaskViewModeChange(e.target.value as 'list' | 'kanban' | 'calendar')}
        >
          <MenuItem value="list">Список</MenuItem>
          <MenuItem value="kanban">Канбан</MenuItem>
          <MenuItem value="calendar">Календарь</MenuItem>
        </TextField>
        <TextField
          fullWidth
          type="number"
          inputProps={{ min: 5, max: 100 }}
          label="Строк на странице (режим «Список», 5–100)"
          value={taskListRowsPerPage}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) return;
            onTaskListRowsPerPageChange(Math.min(100, Math.max(5, n)));
          }}
        />
        <TextField
          select
          fullWidth
          label="Сводка по дедлайнам: окно (часы)"
          value={String(digestDueHours)}
          onChange={(e) => onDigestDueHoursChange(Number(e.target.value))}
        >
          {[8, 24, 48, 72, 168, 336].map((n) => (
            <MenuItem key={n} value={String(n)}>
              {n === 168 ? '7 дней (168 ч)' : `${n} ч`}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          fullWidth
          label="Сводка: область"
          value={digestScope}
          onChange={(e) => onDigestScopeChange(e.target.value as 'all' | 'mine')}
        >
          <MenuItem value="all">Все доступные задачи</MenuItem>
          <MenuItem value="mine">Только мои (исполнитель — я)</MenuItem>
        </TextField>
        <Divider />
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Настройки уведомлений
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Эти переключатели управляют созданием новых in-app уведомлений и, если включён email-канал, их отправкой на
            вашу почту.
          </Typography>
          <Stack spacing={0.5}>
            <FormControlLabel
              control={<Checkbox checked={notifyEmailEnabled} onChange={(_, checked) => onNotifyEmailEnabledChange(checked)} />}
              label="Дублировать включённые уведомления на email"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyWebPushEnabled}
                  disabled={!webPushStatus?.configured}
                  onChange={(_, checked) => onNotifyWebPushEnabledChange(checked)}
                />
              }
              label="Дублировать включённые уведомления в web push"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ pl: 1, pb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {webPushBrowserSupported
                  ? webPushConnected
                    ? `Браузер подключён, подписок на сервере: ${webPushStatus?.subscription_count ?? 0}`
                    : webPushStatus?.configured
                      ? `Браузер не подключён. Разрешение: ${webPushPermission}.`
                      : 'Web push не настроен на сервере.'
                  : 'Этот браузер не поддерживает web push.'}
              </Typography>
              {webPushConnected ? (
                <Button size="small" variant="outlined" disabled={webPushBusy} onClick={() => void onDisconnectWebPush()}>
                  {webPushBusy ? 'Отключение…' : 'Отключить браузер'}
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={webPushBusy || !webPushBrowserSupported || !webPushStatus?.configured}
                  onClick={() => void onConnectWebPush()}
                >
                  {webPushBusy ? 'Подключение…' : 'Подключить браузер'}
                </Button>
              )}
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskOverdue}
                  disabled={notificationConfigMap.task_overdue?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskOverdueChange(checked)}
                />
              }
              label={notificationLabels.task_overdue || 'Просроченные задачи'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskDueSoon}
                  disabled={notificationConfigMap.task_due_soon?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskDueSoonChange(checked)}
                />
              }
              label={notificationLabels.task_due_soon || 'Скоро дедлайн'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskAssigned}
                  disabled={notificationConfigMap.task_assigned?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskAssignedChange(checked)}
                />
              }
              label={notificationLabels.task_assigned || 'Назначение задачи'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskComment}
                  disabled={notificationConfigMap.task_comment?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskCommentChange(checked)}
                />
              }
              label={notificationLabels.task_comment || 'Комментарии к задаче'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskUpdated}
                  disabled={notificationConfigMap.task_updated?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskUpdatedChange(checked)}
                />
              }
              label={notificationLabels.task_updated || 'Обновления задачи'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyContactIncomingMessage}
                  disabled={notificationConfigMap.contact_incoming_message?.enabled === false}
                  onChange={(_, checked) => onNotifyContactIncomingMessageChange(checked)}
                />
              }
              label={notificationLabels.contact_incoming_message || 'Входящие сообщения по контакту'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={notifyTaskMention}
                  disabled={notificationConfigMap.task_mention?.enabled === false}
                  onChange={(_, checked) => onNotifyTaskMentionChange(checked)}
                />
              }
              label={notificationLabels.task_mention || 'Упоминания в комментариях'}
            />
          </Stack>
        </Box>
        <Button variant="contained" disabled={settingsSaving} onClick={() => void onSaveWorkspaceSettings()}>
          {settingsSaving ? 'Сохранение…' : 'Сохранить настройки'}
        </Button>
      </Stack>
      {taskConfigDraft && (
        <>
          <Divider sx={{ my: 3 }} />
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Системные названия задач
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Эти подписи используются в списках задач, канбане, карточках и фильтрах.
              </Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Статусы
                    </Typography>
                    <Stack spacing={1.5}>
                      {taskConfigDraft.statuses.map((item, index) => (
                        <Box key={item.key}>
                          <TextField
                            fullWidth
                            size="small"
                            label={item.key}
                            value={item.label}
                            onChange={(e) => onTaskStatusLabelChange(index, e.target.value)}
                          />
                          <FormControlLabel
                            sx={{ mt: 0.5 }}
                            control={
                              <Checkbox checked={item.enabled !== false} onChange={(e) => onTaskStatusEnabledChange(index, e.target.checked)} />
                            }
                            label="Показывать в интерфейсе"
                          />
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Приоритеты
                    </Typography>
                    <Stack spacing={1.5}>
                      {taskConfigDraft.priorities.map((item, index) => (
                        <Box key={item.key}>
                          <TextField
                            fullWidth
                            size="small"
                            label={item.key}
                            value={item.label}
                            onChange={(e) => onTaskPriorityLabelChange(index, e.target.value)}
                          />
                          <FormControlLabel
                            sx={{ mt: 0.5 }}
                            control={
                              <Checkbox
                                checked={item.enabled !== false}
                                onChange={(e) => onTaskPriorityEnabledChange(index, e.target.checked)}
                              />
                            }
                            label="Показывать в интерфейсе"
                          />
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" disabled={taskConfigSaving} onClick={() => void onSaveWorkspaceTaskConfig()}>
                {taskConfigSaving ? 'Сохранение...' : 'Сохранить названия'}
              </Button>
              <Button variant="outlined" disabled={taskConfigSaving} onClick={onResetTaskConfig}>
                Сбросить
              </Button>
            </Stack>
          </Stack>
        </>
      )}
      {projectConfigDraft && (
        <>
          <Divider sx={{ my: 3 }} />
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Системные статусы проектов
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Эти подписи используются в списке проектов, карточке проекта и фильтрах owner-workspace.
              </Typography>
            </Box>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  {projectConfigDraft.statuses.map((item, index) => (
                    <Box key={item.key}>
                      <TextField
                        fullWidth
                        size="small"
                        label={item.key}
                        value={item.label}
                        onChange={(e) => onProjectStatusLabelChange(index, e.target.value)}
                      />
                      <FormControlLabel
                        sx={{ mt: 0.5 }}
                        control={
                          <Checkbox checked={item.enabled !== false} onChange={(e) => onProjectStatusEnabledChange(index, e.target.checked)} />
                        }
                        label="Показывать в интерфейсе"
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" disabled={projectConfigSaving} onClick={() => void onSaveWorkspaceProjectConfig()}>
                {projectConfigSaving ? 'Сохранение...' : 'Сохранить статусы проектов'}
              </Button>
              <Button variant="outlined" disabled={projectConfigSaving} onClick={onResetProjectConfig}>
                Сбросить
              </Button>
            </Stack>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="subtitle2">Формальная матрица прав</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Таблица ниже показывает, как текущая policy-модель owner workspace влияет на основные действия по ролям.
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Действие</TableCell>
                          <TableCell>Admin / Owner</TableCell>
                          <TableCell>Sales / Trainer</TableCell>
                          <TableCell>Владелец проекта</TableCell>
                          <TableCell>Manager</TableCell>
                          <TableCell>Member</TableCell>
                          <TableCell>Observer</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {permissionMatrixRows.map((row) => (
                          <TableRow key={row.action}>
                            <TableCell sx={{ minWidth: 220 }}>{row.action}</TableCell>
                            <TableCell>{row.adminOwner}</TableCell>
                            <TableCell>{row.limited}</TableCell>
                            <TableCell>{row.projectOwner}</TableCell>
                            <TableCell>{row.manager}</TableCell>
                            <TableCell>{row.member}</TableCell>
                            <TableCell>{row.observer}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </>
      )}
      {notificationConfigDraft && (
        <>
          <Divider sx={{ my: 3 }} />
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Системные типы уведомлений
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Здесь задаются подписи и глобальная видимость типов owner-workspace уведомлений.
              </Typography>
            </Box>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  {notificationConfigDraft.items.map((item, index) => (
                    <Box key={item.key}>
                      <TextField
                        fullWidth
                        size="small"
                        label={item.key}
                        value={item.label}
                        onChange={(e) => onNotificationConfigLabelChange(index, e.target.value)}
                      />
                      <FormControlLabel
                        sx={{ mt: 0.5 }}
                        control={
                          <Checkbox checked={item.enabled !== false} onChange={(e) => onNotificationConfigEnabledChange(index, e.target.checked)} />
                        }
                        label="Показывать и генерировать в модуле"
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" disabled={notificationConfigSaving} onClick={() => void onSaveWorkspaceNotificationConfig()}>
                {notificationConfigSaving ? 'Сохранение...' : 'Сохранить типы уведомлений'}
              </Button>
              <Button variant="outlined" disabled={notificationConfigSaving} onClick={onResetNotificationConfig}>
                Сбросить
              </Button>
            </Stack>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                    <Box>
                      <Typography variant="subtitle2">Диагностика доставки уведомлений</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Состояние owner-workspace outbox по email и web push, включая свежие ошибки доставки.
                      </Typography>
                    </Box>
                    <Button variant="outlined" disabled={notificationDeliveryStatsLoading} onClick={() => void onLoadNotificationDeliveryStats()}>
                      {notificationDeliveryStatsLoading ? 'Обновление...' : 'Обновить'}
                    </Button>
                  </Stack>
                  {notificationDeliveryStats ? (
                    <>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <Card variant="outlined" sx={{ flex: 1 }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="subtitle2">Email</Typography>
                                <Chip
                                  size="small"
                                  color={notificationDeliveryStats.email_configured ? 'success' : 'default'}
                                  label={notificationDeliveryStats.email_configured ? 'Сконфигурирован' : 'Не настроен'}
                                />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Pending: {notificationDeliveryStats.email.pending} · Failed: {notificationDeliveryStats.email.failed} · Terminal:{' '}
                                {notificationDeliveryStats.email.terminal_failed}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Sent 24h: {notificationDeliveryStats.email.sent_last_24h} · Disabled: {notificationDeliveryStats.email.disabled}
                              </Typography>
                              {!notificationDeliveryStats.email_configured && (
                                <Alert severity="warning">
                                  SMTP для owner-workspace уведомлений не настроен на сервере.
                                  {notificationDeliveryStats.missing_email_env.length > 0
                                    ? ` Не хватает: ${notificationDeliveryStats.missing_email_env.join(', ')}.`
                                    : ''}
                                </Alert>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                        <Card variant="outlined" sx={{ flex: 1 }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="subtitle2">Web push</Typography>
                                <Chip
                                  size="small"
                                  color={notificationDeliveryStats.web_push_configured ? 'success' : 'default'}
                                  label={notificationDeliveryStats.web_push_configured ? 'Сконфигурирован' : 'Не настроен'}
                                />
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={`Подписок: ${notificationDeliveryStats.web_push_subscriptions_total}`}
                                />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Pending: {notificationDeliveryStats.web_push.pending} · Failed: {notificationDeliveryStats.web_push.failed} · Terminal:{' '}
                                {notificationDeliveryStats.web_push.terminal_failed}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Sent 24h: {notificationDeliveryStats.web_push.sent_last_24h} · Disabled:{' '}
                                {notificationDeliveryStats.web_push.disabled}
                              </Typography>
                              {!notificationDeliveryStats.web_push_configured && (
                                <Alert severity="warning">
                                  Web push не сконфигурирован на сервере.
                                  {notificationDeliveryStats.missing_web_push_env.length > 0
                                    ? ` Не хватает: ${notificationDeliveryStats.missing_web_push_env.join(', ')}.`
                                    : ''}
                                </Alert>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Последние ошибки доставки
                        </Typography>
                        {notificationDeliveryStats.recent_failures.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Свежих ошибок доставки нет.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                              <Button
                                variant="outlined"
                                size="small"
                                disabled={notificationDeliveryRetrying === 'all'}
                                onClick={() =>
                                  void onRetryNotificationDelivery(notificationDeliveryStats.recent_failures.map((item) => item.id))
                                }
                              >
                                {notificationDeliveryRetrying === 'all' ? 'Повторяем...' : 'Повторить все видимые ошибки'}
                              </Button>
                            </Stack>
                            {notificationDeliveryStats.recent_failures.map((item) => (
                              <Box key={item.id} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Stack spacing={0.5}>
                                  <Typography variant="body2">
                                    <strong>{item.title}</strong> · {item.kind} · {item.user_name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    #{item.id}
                                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString('ru-RU')}` : ''}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    Email: {item.email_delivery_status} ({item.email_attempts})
                                    {item.email_last_error ? ` · ${item.email_last_error}` : ''}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    Web push: {item.web_push_delivery_status} ({item.web_push_attempts})
                                    {item.web_push_last_error ? ` · ${item.web_push_last_error}` : ''}
                                  </Typography>
                                  <Box>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      disabled={notificationDeliveryRetrying === item.id}
                                      onClick={() => void onRetryNotificationDelivery([item.id])}
                                    >
                                      {notificationDeliveryRetrying === item.id ? 'Повторяем...' : 'Повторить доставку'}
                                    </Button>
                                  </Box>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Диагностика ещё не загружена.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </>
      )}
      <Divider sx={{ my: 3 }} />
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Справочники тегов
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Эти списки используются как рекомендованные теги и источники в карточках owner-workspace.
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Теги задач</Typography>
                  <Autocomplete
                    multiple
                    freeSolo
                    options={[] as string[]}
                    value={taskTagDictionaryDraft.items}
                    onChange={(_, value) => onTaskTagDictionaryDraftChange(value.map(String))}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />)
                    }
                    renderInput={(params) => <TextField {...params} label="Теги задач" placeholder="Ввод и Enter" />}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" disabled={taskTagDictionarySaving} onClick={() => void onSaveWorkspaceTaskTagDictionary()}>
                      {taskTagDictionarySaving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                    <Button variant="outlined" disabled={taskTagDictionarySaving} onClick={onResetTaskTagDictionary}>
                      Сбросить
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Теги контактов</Typography>
                  <Autocomplete
                    multiple
                    freeSolo
                    options={[] as string[]}
                    value={contactTagDictionaryDraft.items}
                    onChange={(_, value) => onContactTagDictionaryDraftChange(value.map(String))}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />)
                    }
                    renderInput={(params) => <TextField {...params} label="Теги контактов" placeholder="Ввод и Enter" />}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="contained" disabled={contactTagDictionarySaving} onClick={() => void onSaveWorkspaceContactTagDictionary()}>
                      {contactTagDictionarySaving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                    <Button variant="outlined" disabled={contactTagDictionarySaving} onClick={onResetContactTagDictionary}>
                      Сбросить
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Источники контактов</Typography>
                  <Autocomplete
                    multiple
                    freeSolo
                    options={[] as string[]}
                    value={contactSourceDictionaryDraft.items}
                    onChange={(_, value) => onContactSourceDictionaryDraftChange(value.map(String))}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />)
                    }
                    renderInput={(params) => <TextField {...params} label="Источники контактов" placeholder="Ввод и Enter" />}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button
                      variant="contained"
                      disabled={contactSourceDictionarySaving}
                      onClick={() => void onSaveWorkspaceContactSourceDictionary()}
                    >
                      {contactSourceDictionarySaving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                    <Button variant="outlined" disabled={contactSourceDictionarySaving} onClick={onResetContactSourceDictionary}>
                      Сбросить
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </>
  );
}
