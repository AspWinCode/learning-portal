import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import type { OwnerWorkspaceProject, User } from '../../types';

type OwnerWorkspaceProjectsTabProps = {
  projects: OwnerWorkspaceProject[];
  topOverdueProjects: OwnerWorkspaceProject[];
  projectStatusLabels: Record<string, string>;
  enabledProjectStatuses: string[];
  projectListStatus: string;
  projectListSearchInput: string;
  projectListOwnerId: number | '';
  projectListOverdueOnly: boolean;
  projectName: string;
  canCreateProjectUi: boolean;
  isWorkspaceFullAccess: boolean;
  userOptions: User[];
  userName: (userId?: number | null) => string;
  onProjectListStatusChange: (value: string) => void;
  onProjectListSearchInputChange: (value: string) => void;
  onProjectListOwnerIdChange: (value: number | '') => void;
  onProjectListOverdueOnlyChange: (value: boolean) => void;
  onProjectNameChange: (value: string) => void;
  onCreateProject: () => void | Promise<void>;
  onOpenProject: (project: OwnerWorkspaceProject) => void | Promise<void>;
  onOpenProjectOverdueTasks: (projectId: number) => void | Promise<void>;
};

export function OwnerWorkspaceProjectsTab({
  projects,
  topOverdueProjects,
  projectStatusLabels,
  enabledProjectStatuses,
  projectListStatus,
  projectListSearchInput,
  projectListOwnerId,
  projectListOverdueOnly,
  projectName,
  canCreateProjectUi,
  isWorkspaceFullAccess,
  userOptions,
  userName,
  onProjectListStatusChange,
  onProjectListSearchInputChange,
  onProjectListOwnerIdChange,
  onProjectListOverdueOnlyChange,
  onProjectNameChange,
  onCreateProject,
  onOpenProject,
  onOpenProjectOverdueTasks,
}: OwnerWorkspaceProjectsTabProps) {
  return (
    <Stack spacing={2}>
      {topOverdueProjects.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">РџСЂРѕРµРєС‚С‹ СЃ СЃР°РјРѕР№ Р±РѕР»СЊС€РѕР№ РїСЂРѕСЃСЂРѕС‡РєРѕР№</Typography>
              <Typography variant="body2" color="text.secondary">
                Р‘Р»РѕРє СЃС‚СЂРѕРёС‚СЃСЏ РїРѕ С‚РµРєСѓС‰РµР№ РІРёРґРёРјРѕР№ РІС‹Р±РѕСЂРєРµ РїСЂРѕРµРєС‚РѕРІ Рё РїРѕРјРѕРіР°РµС‚ Р±С‹СЃС‚СЂРѕ РїРµСЂРµР№С‚Рё Рє РїСЂРѕР±Р»РµРјРЅС‹Рј Р·Р°РґР°С‡Р°Рј.
              </Typography>
              <Grid container spacing={1.5}>
                {topOverdueProjects.map((project) => (
                  <Grid key={project.id} item xs={12} md={6} xl={4}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle2">{project.name}</Typography>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" color="warning" label={`РџСЂРѕСЃСЂРѕС‡РµРЅРѕ: ${project.overdue_tasks_count ?? 0}`} />
                            <Chip size="small" label={`РђРєС‚РёРІРЅС‹С…: ${project.active_tasks_count ?? 0}`} />
                            <Chip size="small" variant="outlined" label={`Р’СЃРµРіРѕ: ${project.total_tasks_count ?? 0}`} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№: <strong>{userName(project.owner_id)}</strong>
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Button size="small" variant="outlined" onClick={() => void onOpenProject(project)}>
                              РћС‚РєСЂС‹С‚СЊ РїСЂРѕРµРєС‚
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => void onOpenProjectOverdueTasks(project.id)}
                            >
                              РџСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Рµ Р·Р°РґР°С‡Рё
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="subtitle2" gutterBottom>
            Р¤РёР»СЊС‚СЂС‹ СЃРїРёСЃРєР° РїСЂРѕРµРєС‚РѕРІ
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
            <TextField
              select
              label="РЎС‚Р°С‚СѓСЃ"
              size="small"
              sx={{ minWidth: 160 }}
              value={projectListStatus}
              onChange={(e) => onProjectListStatusChange(e.target.value)}
            >
              <MenuItem value="">Р’СЃРµ</MenuItem>
              {enabledProjectStatuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {projectStatusLabels[status] ?? status}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="РџРѕРёСЃРє РїРѕ РЅР°Р·РІР°РЅРёСЋ/РѕРїРёСЃР°РЅРёСЋ"
              size="small"
              sx={{ minWidth: 220, flex: 1 }}
              value={projectListSearchInput}
              onChange={(e) => onProjectListSearchInputChange(e.target.value)}
            />
            <TextField
              select
              label="РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№"
              size="small"
              sx={{ minWidth: 200 }}
              value={projectListOwnerId === '' ? '' : String(projectListOwnerId)}
              onChange={(e) => {
                const value = e.target.value;
                onProjectListOwnerIdChange(value === '' ? '' : Number(value));
              }}
            >
              <MenuItem value="">Р’СЃРµ</MenuItem>
              {userOptions.map((user) => (
                <MenuItem key={user.id} value={String(user.id)}>
                  {user.full_name}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={projectListOverdueOnly} onChange={(_, checked) => onProjectListOverdueOnlyChange(checked)} />}
              label="РўРѕР»СЊРєРѕ СЃ РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹РјРё Р°РєС‚РёРІРЅС‹РјРё Р·Р°РґР°С‡Р°РјРё"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              label="РќР°Р·РІР°РЅРёРµ РїСЂРѕРµРєС‚Р°"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              disabled={!canCreateProjectUi}
            />
            <Button variant="contained" onClick={() => void onCreateProject()} disabled={!canCreateProjectUi}>
              РЎРѕР·РґР°С‚СЊ
            </Button>
          </Stack>
          {!canCreateProjectUi && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              РЎРѕР·РґР°РЅРёРµ РЅРѕРІС‹С… РїСЂРѕРµРєС‚РѕРІ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ admin / owner.
            </Alert>
          )}
          {!isWorkspaceFullAccess && canCreateProjectUi && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              РЎРѕР·РґР°РЅРёРµ РЅРѕРІС‹С… РїСЂРѕРµРєС‚РѕРІ СЂР°Р·СЂРµС€РµРЅРѕ РґР»СЏ РѕРіСЂР°РЅРёС‡РµРЅРЅС‹С… СЂРѕР»РµР№ С‚РµРєСѓС‰РµР№ policy-РјРѕРґРµР»СЊСЋ.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {projects.map((project) => (
          <Grid item xs={12} md={6} key={project.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6">{project.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№: {userName(project.owner_id)}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => void onOpenProject(project)} aria-label="РћС‚РєСЂС‹С‚СЊ">
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" label={projectStatusLabels[project.status] ?? project.status} />
                  <Chip size="small" label={`Р—Р°РґР°С‡ РІСЃРµРіРѕ: ${project.total_tasks_count ?? 0}`} />
                  <Chip size="small" label={`РђРєС‚РёРІРЅ.: ${project.active_tasks_count}`} />
                  {(project.overdue_tasks_count ?? 0) > 0 && (
                    <Chip size="small" color="warning" label={`РџСЂРѕСЃСЂРѕС‡.: ${project.overdue_tasks_count}`} />
                  )}
                  <Chip size="small" label={`РљРѕРЅС‚Р°РєС‚РѕРІ: ${project.contacts_count}`} />
                  {project.subprojects_count > 0 && <Chip size="small" label={`РџРѕРґРїСЂРѕРµРєС‚РѕРІ: ${project.subprojects_count}`} />}
                </Stack>
                {project.updated_at ? (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                    РћР±РЅРѕРІР»С‘РЅ:{' '}
                    {new Date(project.updated_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          </Grid>
        ))}
        {projects.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">
              РќРµС‚ РїСЂРѕРµРєС‚РѕРІ РїРѕ С‚РµРєСѓС‰РёРј С„РёР»СЊС‚СЂР°Рј.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
}
