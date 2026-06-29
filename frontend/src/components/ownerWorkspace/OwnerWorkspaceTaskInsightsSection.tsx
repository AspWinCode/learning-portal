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
  taskViewMode: 'list' | 'kanban' | 'calendar' | 'gantt';
  taskListTotal: number;
  taskFetchCap: number;
  /** Скрыть переключатель вида и подсказку (когда они вынесены в общий тулбар). */
  hideViewControls?: boolean;
  onTaskViewModeChange: (value: 'list' | 'kanban' | 'calendar' | 'gantt') => void;
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
  hideViewControls = false,
  onTaskViewModeChange,
  onDrillDownToAssigneeTasks,
}: OwnerWorkspaceTaskInsightsSectionProps) {
  return (
    <>
      {tasksAnalytics != null && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              Аналитика (ваша зона видимости)
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap" useFlexGap>
              <Typography variant="body2">
                Завершено за 7 дней: <strong>{tasksAnalytics.completed_last_7_days}</strong>
              </Typography>
              <Typography variant="body2">
                За 30 дней: <strong>{tasksAnalytics.completed_last_30_days}</strong>
              </Typography>
              <Typography variant="body2">
                Среднее время до закрытия (завершённые за 30 дн.):{' '}
                <strong>
                  {tasksAnalytics.avg_days_to_complete_last_30 != null &&
                  tasksAnalytics.avg_days_to_complete_last_30 !== undefined
                    ? `${tasksAnalytics.avg_days_to_complete_last_30} дн.`
                    : '—'}
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
              <Typography variant="subtitle2">Нагрузка по сотрудникам</Typography>
              <Typography variant="body2" color="text.secondary">
                Блок строится по текущей видимой выборке задач с учётом активных фильтров.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`С активными задачами: ${assigneeAnalyticsSummary.assigneesWithActiveTasks}`} />
                <Chip
                  size="small"
                  color={assigneeAnalyticsSummary.assigneesWithOverdueTasks > 0 ? 'warning' : 'default'}
                  label={`С просрочкой: ${assigneeAnalyticsSummary.assigneesWithOverdueTasks}`}
                />
                <Chip
                  size="small"
                  color={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'error' : 'default'}
                  variant={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'filled' : 'outlined'}
                  label={`Перегружены (5+ активных): ${assigneeAnalyticsSummary.overloadedAssignees}`}
                />
              </Stack>
              {assigneeAttentionRows.length > 0 && (
                <Alert severity="warning">
                  <Typography variant="subtitle2" gutterBottom>
                    Зона внимания
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
                          {row.assigneeName}: активных {row.activeCount}, просрочено {row.overdueCount}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="outlined" onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId)}>
                            Все активные
                          </Button>
                          {row.overdueCount > 0 && (
                            <Button
                              size="small"
                              variant="contained"
                              color="warning"
                              onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId, { overdueOnly: true })}
                            >
                              Только просрочка
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
                            <Chip size="small" label={`Активных: ${row.activeCount}`} />
                            <Chip size="small" color={row.overdueCount > 0 ? 'warning' : 'default'} label={`Просрочено: ${row.overdueCount}`} />
                            <Chip size="small" color="success" variant="outlined" label={`Завершено: ${row.completedCount}`} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            Среднее время закрытия:{' '}
                            <strong>{row.avgDaysToComplete != null ? `${row.avgDaysToComplete} дн.` : '—'}</strong>
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            sx={{ alignSelf: 'flex-start' }}
                            onClick={() => void onDrillDownToAssigneeTasks(row.assigneeId)}
                          >
                            Открыть задачи
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

      {!hideViewControls && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <ToggleButtonGroup
            size="small"
            value={taskViewMode}
            exclusive
            onChange={(_, value) => value && onTaskViewModeChange(value)}
          >
            <ToggleButton value="list">Список</ToggleButton>
            <ToggleButton value="kanban">Канбан</ToggleButton>
            <ToggleButton value="calendar">Календарь</ToggleButton>
            <ToggleButton value="gantt">Гант</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            В канбане перетащите карточку на другую колонку, чтобы сменить статус.
          </Typography>
        </Stack>
      )}

      {!hideViewControls && taskViewMode !== 'list' && taskListTotal > taskFetchCap && (
        <Alert severity="warning">
          Загружено не более {taskFetchCap} задач при текущих фильтрах (всего по фильтру: {taskListTotal}). Уточните фильтры или
          переключитесь в режим «Список» с пагинацией.
        </Alert>
      )}
    </>
  );
}
