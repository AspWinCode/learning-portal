import React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import type {
  OwnerWorkspaceTaskStatusCounts,
  OwnerWorkspaceTasksAnalyticsOverview,
} from '../../types';

type AssigneeAnalyticsRow = {
  assigneeId: number | null;
  assigneeName: string;
  activeCount: number;
  overdueCount: number;
  completedCount: number;
  avgDaysToComplete: number | null;
};

type AssigneeAnalyticsSummary = {
  assigneesWithActiveTasks: number;
  assigneesWithOverdueTasks: number;
  overloadedAssignees: number;
};

type OwnerWorkspaceTaskInsightsSectionProps = {
  tasksAnalytics: OwnerWorkspaceTasksAnalyticsOverview | null;
  taskStatusCounts: OwnerWorkspaceTaskStatusCounts | null;
  assigneeAnalyticsRows: AssigneeAnalyticsRow[];
  assigneeAnalyticsSummary: AssigneeAnalyticsSummary;
  assigneeAttentionRows: AssigneeAnalyticsRow[];
  taskViewMode: 'list' | 'kanban' | 'calendar';
  taskListTotal: number;
  taskFetchCap: number;
  onTaskViewModeChange: (value: 'list' | 'kanban' | 'calendar') => void;
  onDrillDownToAssigneeTasks: (assigneeId: number | null, options?: { overdueOnly?: boolean }) => void | Promise<void>;
};

export function OwnerWorkspaceTaskInsightsSection({
  tasksAnalytics,
  taskStatusCounts,
  assigneeAnalyticsRows,
  assigneeAnalyticsSummary,
  assigneeAttentionRows,
  taskViewMode,
  taskListTotal,
  taskFetchCap,
  onTaskViewModeChange,
  onDrillDownToAssigneeTasks,
}: OwnerWorkspaceTaskInsightsSectionProps) {
  return (
    <>
      {tasksAnalytics != null && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              РђРЅР°Р»РёС‚РёРєР° (РІР°С€Р° Р·РѕРЅР° РІРёРґРёРјРѕСЃС‚Рё)
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
              <Typography variant="body2">
                Р—Р°РІРµСЂС€РµРЅРѕ Р·Р° 7 РґРЅРµР№: <strong>{tasksAnalytics.completed_last_7_days}</strong>
              </Typography>
              <Typography variant="body2">
                Р—Р° 30 РґРЅРµР№: <strong>{tasksAnalytics.completed_last_30_days}</strong>
              </Typography>
              <Typography variant="body2">
                РЎСЂРµРґРЅРµРµ РІСЂРµРјСЏ РґРѕ Р·Р°РєСЂС‹С‚РёСЏ (Р·Р°РІРµСЂС€С‘РЅРЅС‹Рµ Р·Р° 30 РґРЅ.):{' '}
                <strong>
                  {tasksAnalytics.avg_days_to_complete_last_30 != null &&
                  tasksAnalytics.avg_days_to_complete_last_30 !== undefined
                    ? `${tasksAnalytics.avg_days_to_complete_last_30} РґРЅ.`
                    : 'вЂ”'}
                </strong>
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {assigneeAnalyticsRows.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">РќР°РіСЂСѓР·РєР° РїРѕ СЃРѕС‚СЂСѓРґРЅРёРєР°Рј</Typography>
              <Typography variant="body2" color="text.secondary">
                Р‘Р»РѕРє СЃС‚СЂРѕРёС‚СЃСЏ РїРѕ С‚РµРєСѓС‰РµР№ РІРёРґРёРјРѕР№ РІС‹Р±РѕСЂРєРµ Р·Р°РґР°С‡ СЃ СѓС‡С‘С‚РѕРј Р°РєС‚РёРІРЅС‹С… С„РёР»СЊС‚СЂРѕРІ.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`РЎ Р°РєС‚РёРІРЅС‹РјРё Р·Р°РґР°С‡Р°РјРё: ${assigneeAnalyticsSummary.assigneesWithActiveTasks}`} />
                <Chip
                  size="small"
                  color={assigneeAnalyticsSummary.assigneesWithOverdueTasks > 0 ? 'warning' : 'default'}
                  label={`РЎ РїСЂРѕСЃСЂРѕС‡РєРѕР№: ${assigneeAnalyticsSummary.assigneesWithOverdueTasks}`}
                />
                <Chip
                  size="small"
                  color={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'error' : 'default'}
                  variant={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'filled' : 'outlined'}
                  label={`РџРµСЂРµРіСЂСѓР¶РµРЅС‹ (5+ Р°РєС‚РёРІРЅС‹С…): ${assigneeAnalyticsSummary.overloadedAssignees}`}
                />
              </Stack>
              {assigneeAttentionRows.length > 0 && (
                <Alert severity="warning">
                  <Typography variant="subtitle2" gutterBottom>
                    Р—РѕРЅР° РІРЅРёРјР°РЅРёСЏ
                  </Typography>
                  <Stack spacing={0.5}>
                    {assigneeAttentionRows.map((row) => (
                      <Stack
                        key={`attention-${row.assigneeId == null ? 'unassigned' : row.assigneeId}`}
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1}
                        alignItems={{ sm: 'center' }}
                      >
                        <Typography variant="body2">
                          {row.assigneeName}: Р°РєС‚РёРІРЅС‹С… {row.activeCount}, РїСЂРѕСЃСЂРѕС‡РµРЅРѕ {row.overdueCount}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="outlined" onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId)}>
                            Р’СЃРµ Р°РєС‚РёРІРЅС‹Рµ
                          </Button>
                          {row.overdueCount > 0 && (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId, { overdueOnly: true })}
                            >
                              РўРѕР»СЊРєРѕ РїСЂРѕСЃСЂРѕС‡РєР°
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Alert>
              )}
              <Grid container spacing={1.5}>
                {assigneeAnalyticsRows.slice(0, 8).map((row) => (
                  <Grid key={row.assigneeId == null ? 'unassigned' : row.assigneeId} item xs={12} md={6} xl={4}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle2">{row.assigneeName}</Typography>
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={`РђРєС‚РёРІРЅС‹С…: ${row.activeCount}`} />
                            <Chip size="small" color={row.overdueCount > 0 ? 'warning' : 'default'} label={`РџСЂРѕСЃСЂРѕС‡РµРЅРѕ: ${row.overdueCount}`} />
                            <Chip size="small" color="success" variant="outlined" label={`Р—Р°РІРµСЂС€РµРЅРѕ: ${row.completedCount}`} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            РЎСЂРµРґРЅРµРµ РІСЂРµРјСЏ Р·Р°РєСЂС‹С‚РёСЏ:{' '}
                            <strong>{row.avgDaysToComplete != null ? `${row.avgDaysToComplete} РґРЅ.` : 'вЂ”'}</strong>
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            sx={{ alignSelf: 'flex-start' }}
                            onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId)}
                          >
                            РћС‚РєСЂС‹С‚СЊ Р·Р°РґР°С‡Рё
                          </Button>
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

      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <ToggleButtonGroup
          size="small"
          value={taskViewMode}
          exclusive
          onChange={(_, value) => value && onTaskViewModeChange(value)}
        >
          <ToggleButton value="list">РЎРїРёСЃРѕРє</ToggleButton>
          <ToggleButton value="kanban">РљР°РЅР±Р°РЅ</ToggleButton>
          <ToggleButton value="calendar">РљР°Р»РµРЅРґР°СЂСЊ</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Р’ РєР°РЅР±Р°РЅРµ РїРµСЂРµС‚Р°С‰РёС‚Рµ РєР°СЂС‚РѕС‡РєСѓ РЅР° РґСЂСѓРіСѓСЋ РєРѕР»РѕРЅРєСѓ, С‡С‚РѕР±С‹ СЃРјРµРЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ.
        </Typography>
      </Stack>

      {taskViewMode !== 'list' && taskListTotal > taskFetchCap && (
        <Alert severity="warning">
          Р—Р°РіСЂСѓР¶РµРЅРѕ РЅРµ Р±РѕР»РµРµ {taskFetchCap} Р·Р°РґР°С‡ РїСЂРё С‚РµРєСѓС‰РёС… С„РёР»СЊС‚СЂР°С… (РІСЃРµРіРѕ РїРѕ С„РёР»СЊС‚СЂСѓ: {taskListTotal}). РЈС‚РѕС‡РЅРёС‚Рµ С„РёР»СЊС‚СЂС‹ РёР»Рё
          РїРµСЂРµРєР»СЋС‡РёС‚РµСЃСЊ РІ СЂРµР¶РёРј В«РЎРїРёСЃРѕРєВ» СЃ РїР°РіРёРЅР°С†РёРµР№.
        </Alert>
      )}
    </>
  );
}
