/**
 * Self-contained "Настройки контрагентов и таск трекера" section.
 *
 * Wraps the {@link useOwnerWorkspaceSettings} hook together with
 * {@link OwnerWorkspaceSettingsConfigSection} so the whole settings block can be
 * dropped into any page (currently a tab on the main settings page) without the
 * host needing to manage any of the underlying state.
 */
import React, { Suspense } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

import { useAuth } from '../../contexts/AuthContext';
import { getEffectiveRole } from '../../utils/permissions';
import { useOwnerWorkspaceSettings } from '../../hooks/useOwnerWorkspaceSettings';

const OwnerWorkspaceSettingsConfigSection = React.lazy(() =>
  import('./OwnerWorkspaceSettingsConfigSection').then((module) => ({
    default: module.OwnerWorkspaceSettingsConfigSection,
  }))
);

export function OwnerWorkspaceSettingsSection() {
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const isWorkspaceFullAccess = effectiveRole === 'admin' || effectiveRole === 'owner';

  const s = useOwnerWorkspaceSettings();

  if (s.loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Справочники и параметры таск трекера и карточек контрагентов: статусы и приоритеты задач,
        статусы проектов, уведомления, теги, роли и отрасли контрагентов.
      </Typography>
      <Suspense
        fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        }
      >
        <OwnerWorkspaceSettingsConfigSection
          taskViewMode={s.taskViewMode}
          taskListRowsPerPage={s.taskListRowsPerPage}
          digestDueHours={s.digestDueHours}
          digestScope={s.digestScope}
          notifyEmailEnabled={s.notifyEmailEnabled}
          notifyWebPushEnabled={s.notifyWebPushEnabled}
          notifyTaskOverdue={s.notifyTaskOverdue}
          notifyTaskDueSoon={s.notifyTaskDueSoon}
          notifyTaskAssigned={s.notifyTaskAssigned}
          notifyTaskComment={s.notifyTaskComment}
          notifyTaskUpdated={s.notifyTaskUpdated}
          notifyContactIncomingMessage={s.notifyContactIncomingMessage}
          notifyTaskMention={s.notifyTaskMention}
          webPushStatus={s.webPushStatus}
          webPushBrowserSupported={s.webPushBrowserSupported}
          webPushPermission={s.webPushPermission}
          webPushConnected={s.webPushConnected}
          webPushBusy={s.webPushBusy}
          notificationLabels={s.notificationLabels}
          notificationConfigMap={s.notificationConfigMap}
          settingsSaving={s.settingsSaving}
          taskConfigDraft={isWorkspaceFullAccess ? s.taskConfigDraft : null}
          taskConfigSaving={s.taskConfigSaving}
          projectConfigDraft={isWorkspaceFullAccess ? s.projectConfigDraft : null}
          projectConfigSaving={s.projectConfigSaving}
          permissionMatrixRows={s.permissionMatrixRows as never}
          notificationConfigDraft={isWorkspaceFullAccess ? s.notificationConfigDraft : null}
          notificationConfigSaving={s.notificationConfigSaving}
          notificationDeliveryStats={s.notificationDeliveryStats}
          notificationDeliveryStatsLoading={s.notificationDeliveryStatsLoading}
          notificationDeliveryRetrying={s.notificationDeliveryRetrying}
          taskTagDictionaryDraft={s.taskTagDictionaryDraft}
          taskTagDictionarySaving={s.taskTagDictionarySaving}
          contactTagDictionaryDraft={s.contactTagDictionaryDraft}
          contactTagDictionarySaving={s.contactTagDictionarySaving}
          contactSourceDictionaryDraft={s.contactSourceDictionaryDraft}
          contactSourceDictionarySaving={s.contactSourceDictionarySaving}
          counterpartyRoleDictionaryDraft={s.counterpartyRoleDictionaryDraft}
          counterpartyRoleDictionarySaving={s.counterpartyRoleDictionarySaving}
          counterpartyIndustryDictionaryDraft={s.counterpartyIndustryDictionaryDraft}
          counterpartyIndustryDictionarySaving={s.counterpartyIndustryDictionarySaving}
          onTaskViewModeChange={s.setTaskViewMode}
          onTaskListRowsPerPageChange={s.setTaskListRowsPerPage}
          onDigestDueHoursChange={s.setDigestDueHours}
          onDigestScopeChange={s.setDigestScope}
          onNotifyEmailEnabledChange={s.setNotifyEmailEnabled}
          onNotifyWebPushEnabledChange={s.setNotifyWebPushEnabled}
          onNotifyTaskOverdueChange={s.setNotifyTaskOverdue}
          onNotifyTaskDueSoonChange={s.setNotifyTaskDueSoon}
          onNotifyTaskAssignedChange={s.setNotifyTaskAssigned}
          onNotifyTaskCommentChange={s.setNotifyTaskComment}
          onNotifyTaskUpdatedChange={s.setNotifyTaskUpdated}
          onNotifyContactIncomingMessageChange={s.setNotifyContactIncomingMessage}
          onNotifyTaskMentionChange={s.setNotifyTaskMention}
          onConnectWebPush={s.connectWebPush}
          onDisconnectWebPush={s.disconnectWebPush}
          onSaveWorkspaceSettings={s.saveWorkspaceSettings}
          onTaskStatusLabelChange={(index, value) =>
            s.setTaskConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    statuses: prev.statuses.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, label: value } : current
                    ),
                  }
                : prev
            )
          }
          onTaskStatusEnabledChange={(index, value) =>
            s.setTaskConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    statuses: prev.statuses.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, enabled: value } : current
                    ),
                  }
                : prev
            )
          }
          onTaskPriorityLabelChange={(index, value) =>
            s.setTaskConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    priorities: prev.priorities.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, label: value } : current
                    ),
                  }
                : prev
            )
          }
          onTaskPriorityEnabledChange={(index, value) =>
            s.setTaskConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    priorities: prev.priorities.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, enabled: value } : current
                    ),
                  }
                : prev
            )
          }
          onSaveWorkspaceTaskConfig={s.saveWorkspaceTaskConfig}
          onResetTaskConfig={() => s.taskConfig && s.setTaskConfigDraft(s.taskConfig)}
          onProjectStatusLabelChange={(index, value) =>
            s.setProjectConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    statuses: prev.statuses.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, label: value } : current
                    ),
                  }
                : prev
            )
          }
          onProjectStatusEnabledChange={(index, value) =>
            s.setProjectConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    statuses: prev.statuses.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, enabled: value } : current
                    ),
                  }
                : prev
            )
          }
          onSaveWorkspaceProjectConfig={s.saveWorkspaceProjectConfig}
          onResetProjectConfig={() => s.projectConfig && s.setProjectConfigDraft(s.projectConfig)}
          onNotificationConfigLabelChange={(index, value) =>
            s.setNotificationConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, label: value } : current
                    ),
                  }
                : prev
            )
          }
          onNotificationConfigEnabledChange={(index, value) =>
            s.setNotificationConfigDraft((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((current, currentIndex) =>
                      currentIndex === index ? { ...current, enabled: value } : current
                    ),
                  }
                : prev
            )
          }
          onSaveWorkspaceNotificationConfig={s.saveWorkspaceNotificationConfig}
          onResetNotificationConfig={() =>
            s.notificationConfig && s.setNotificationConfigDraft(s.notificationConfig)
          }
          onLoadNotificationDeliveryStats={s.loadNotificationDeliveryStats}
          onRetryNotificationDelivery={s.retryNotificationDelivery}
          onTaskTagDictionaryDraftChange={(items) => s.setTaskTagDictionaryDraft({ items })}
          onSaveWorkspaceTaskTagDictionary={s.saveWorkspaceTaskTagDictionary}
          onResetTaskTagDictionary={() => s.setTaskTagDictionaryDraft(s.taskTagDictionary)}
          onContactTagDictionaryDraftChange={(items) => s.setContactTagDictionaryDraft({ items })}
          onSaveWorkspaceContactTagDictionary={s.saveWorkspaceContactTagDictionary}
          onResetContactTagDictionary={() => s.setContactTagDictionaryDraft(s.contactTagDictionary)}
          onContactSourceDictionaryDraftChange={(items) => s.setContactSourceDictionaryDraft({ items })}
          onSaveWorkspaceContactSourceDictionary={s.saveWorkspaceContactSourceDictionary}
          onResetContactSourceDictionary={() =>
            s.setContactSourceDictionaryDraft(s.contactSourceDictionary)
          }
          onCounterpartyRoleDictionaryDraftChange={(items) =>
            s.setCounterpartyRoleDictionaryDraft({ items })
          }
          onSaveCounterpartyRoleDictionary={s.saveCounterpartyRoleDictionary}
          onResetCounterpartyRoleDictionary={() =>
            s.setCounterpartyRoleDictionaryDraft(s.counterpartyRoleDictionary)
          }
          onCounterpartyIndustryDictionaryDraftChange={(items) =>
            s.setCounterpartyIndustryDictionaryDraft({ items })
          }
          onSaveCounterpartyIndustryDictionary={s.saveCounterpartyIndustryDictionary}
          onResetCounterpartyIndustryDictionary={() =>
            s.setCounterpartyIndustryDictionaryDraft(s.counterpartyIndustryDictionary)
          }
        />
      </Suspense>
    </Box>
  );
}

export default OwnerWorkspaceSettingsSection;
