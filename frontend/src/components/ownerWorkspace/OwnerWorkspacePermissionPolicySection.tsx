import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';

import type { OwnerWorkspacePermissionPolicy } from '../../types';

type OwnerWorkspacePermissionPolicySectionProps = {
  permissionPolicyDraft: OwnerWorkspacePermissionPolicy;
  permissionPolicy: OwnerWorkspacePermissionPolicy;
  permissionPolicySaving: boolean;
  onPermissionPolicyChange: <K extends keyof OwnerWorkspacePermissionPolicy>(key: K, value: OwnerWorkspacePermissionPolicy[K]) => void;
  onSaveWorkspacePermissionPolicy: () => void | Promise<void>;
  onResetPermissionPolicy: () => void;
};

const POLICY_FIELDS: Array<{
  key: keyof OwnerWorkspacePermissionPolicy;
  label: string;
  disabled?: (draft: OwnerWorkspacePermissionPolicy) => boolean;
}> = [
  {
    key: 'manager_can_manage_team',
    label: 'Менеджер проекта может управлять составом команды',
  },
  {
    key: 'manager_can_change_roles',
    label: 'Менеджер проекта может менять роли существующих участников',
    disabled: (draft) => !draft.manager_can_manage_team,
  },
  {
    key: 'manager_can_assign_manager',
    label: 'Менеджер проекта может назначать других менеджеров',
    disabled: (draft) => !draft.manager_can_manage_team,
  },
  {
    key: 'manager_can_assign_observer',
    label: 'Менеджер проекта может назначать наблюдателей',
    disabled: (draft) => !draft.manager_can_manage_team,
  },
  {
    key: 'manager_can_remove_manager',
    label: 'Менеджер проекта может удалять других менеджеров',
    disabled: (draft) => !draft.manager_can_manage_team,
  },
  {
    key: 'manager_can_edit_project_meta',
    label: 'Менеджер проекта может редактировать название и описание проекта',
  },
  {
    key: 'manager_can_archive_project',
    label: 'Менеджер проекта может архивировать проект',
  },
  {
    key: 'limited_can_create_projects',
    label: 'Ограниченные роли (sales / trainer) могут создавать проекты',
  },
  {
    key: 'limited_can_create_contacts',
    label: 'Ограниченные роли (sales / trainer) могут создавать контакты',
  },
  {
    key: 'limited_can_create_tasks',
    label: 'Ограниченные роли (sales / trainer) могут создавать задачи',
  },
  {
    key: 'limited_can_edit_contacts',
    label: 'Ограниченные роли (sales / trainer) могут редактировать карточки контактов',
  },
  {
    key: 'limited_can_edit_tasks',
    label: 'Ограниченные роли (sales / trainer) могут редактировать поля задач',
  },
  {
    key: 'limited_can_manage_project_contacts',
    label: 'Ограниченные роли (sales / trainer) могут привязывать и отвязывать контакты в проектах',
  },
  {
    key: 'limited_can_complete_tasks',
    label: 'Ограниченные роли (sales / trainer) могут завершать задачи',
  },
  {
    key: 'limited_can_bulk_update_tasks',
    label: 'Ограниченные роли (sales / trainer) могут массово обновлять задачи',
  },
  {
    key: 'limited_can_link_messages',
    label: 'Ограниченные роли (sales / trainer) могут привязывать сообщения к задачам',
  },
  {
    key: 'limited_can_send_messages',
    label: 'Ограниченные роли (sales / trainer) могут отправлять сообщения',
  },
  {
    key: 'limited_can_comment_tasks',
    label: 'Ограниченные роли (sales / trainer) могут комментировать задачи',
  },
];

export function OwnerWorkspacePermissionPolicySection({
  permissionPolicyDraft,
  permissionPolicy,
  permissionPolicySaving,
  onPermissionPolicyChange,
  onSaveWorkspacePermissionPolicy,
  onResetPermissionPolicy,
}: OwnerWorkspacePermissionPolicySectionProps) {
  return (
    <>
      <Divider sx={{ my: 3 }} />
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Policy ролей проекта
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Эти правила управляют тем, что project manager может делать с составом команды без участия owner/admin.
          </Typography>
        </Box>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={0.5}>
              {POLICY_FIELDS.map((field) => (
                <FormControlLabel
                  key={field.key}
                  control={
                    <Checkbox
                      checked={permissionPolicyDraft[field.key]}
                      disabled={field.disabled?.(permissionPolicyDraft) ?? false}
                      onChange={(_, checked) => onPermissionPolicyChange(field.key, checked)}
                    />
                  }
                  label={field.label}
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="contained" disabled={permissionPolicySaving} onClick={() => void onSaveWorkspacePermissionPolicy()}>
            {permissionPolicySaving ? 'Сохранение...' : 'Сохранить policy'}
          </Button>
          <Button variant="outlined" disabled={permissionPolicySaving} onClick={onResetPermissionPolicy}>
            Сбросить
          </Button>
        </Stack>
      </Stack>
    </>
  );
}
