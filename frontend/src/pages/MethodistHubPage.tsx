import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Typography,
} from '@mui/material';
import {
  Shield as ShieldIcon,
  SportsEsports as GameIcon,
  School as SchoolIcon,
  Add as AddIcon,
  CheckCircleOutline as CheckIcon,
  RateReview as ReviewIcon,
  EditNote as DraftIcon,
  ErrorOutline as ErrorIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { kodexExternalApi, KodexExternalSummary } from '../services/kodexApi';

interface Direction {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
  status: 'live' | 'soon' | 'planned';
  color: 'primary' | 'warning' | 'info' | 'secondary' | 'default';
  route?: string;
}

const DIRECTIONS: Direction[] = [
  {
    id: 'kodex',
    name: 'Кодэкс',
    desc: 'Детективные дела на программирование. Брифинг, улики, финал.',
    icon: <ShieldIcon />,
    status: 'live',
    color: 'primary',
    route: '/kodex-menu',
  },
  {
    id: 'game',
    name: 'Гейм Студия',
    desc: 'Интерактивные игровые сценарии и обучающие механики.',
    icon: <GameIcon />,
    status: 'soon',
    color: 'warning',
  },
  {
    id: 'oge',
    name: 'ОГЭ / ЕГЭ',
    desc: 'Тестовые задания и разборы по информатике и математике.',
    icon: <SchoolIcon />,
    status: 'soon',
    color: 'info',
  },
  {
    id: 'new',
    name: 'Новое направление',
    desc: 'Подключается по запросу. Собственный редактор контента.',
    icon: <AddIcon />,
    status: 'planned',
    color: 'default',
  },
];

const STATUS_CHIP: Record<Direction['status'], { label: string; color: 'success' | 'warning' | 'default' }> = {
  live: { label: 'Подключено', color: 'success' },
  soon: { label: 'Скоро', color: 'warning' },
  planned: { label: 'Планируется', color: 'default' },
};

const STATUS_META: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'error' }> = {
  draft: { label: 'Черновик', color: 'default' },
  in_review: { label: 'Ревью', color: 'info' },
  approved: { label: 'Активно', color: 'success' },
  changes_requested: { label: 'Правки', color: 'error' },
};

export default function MethodistHubPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<KodexExternalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setCases(await kodexExternalApi.list()); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = cases.length;
  const active = cases.filter((c) => c.playable).length;
  const attention = cases.filter((c) => c.status === 'changes_requested').length;
  const inReview = cases.filter((c) => c.status === 'in_review').length;
  const drafts = cases.filter((c) => !c.status || c.status === 'draft').length;

  const recentChanged = cases.filter((c) => c.is_override).slice(0, 5);
  const needAttention = cases.filter(
    (c) => c.status === 'changes_requested' || c.status === 'in_review',
  ).slice(0, 5);

  const stats = [
    {
      label: 'Направлений',
      value: '1 / 5',
      sub: 'подключено',
      icon: <CheckIcon fontSize="small" color="success" />,
    },
    {
      label: 'Контент всего',
      value: loading ? '…' : total,
      sub: 'дел, задач, тем',
      icon: <DraftIcon fontSize="small" color="action" />,
    },
    {
      label: 'На проверке',
      value: loading ? '…' : inReview,
      sub: 'ждут ревью',
      icon: <ReviewIcon fontSize="small" color="info" />,
    },
    {
      label: 'Нужны правки',
      value: loading ? '…' : attention,
      sub: 'по замечаниям',
      icon: <ErrorIcon fontSize="small" color={attention > 0 ? 'error' : 'disabled'} />,
    },
  ];

  return (
    <Layout>
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        {/* Page header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5">Студия методиста</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Управление учебными направлениями платформы
          </Typography>
        </Box>

        {/* Stats row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {stats.map((s) => (
            <Grid item xs={12} sm={6} md={3} key={s.label}>
              <Card variant="outlined">
                <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ mt: 0.25 }}>{s.icon}</Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                    <Typography variant="h4" sx={{ lineHeight: 1.2, my: 0.25 }}>{s.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.sub}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Pipeline */}
        {!loading && total > 0 && (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Воронка по статусам — Кодэкс
              </Typography>
              <Box sx={{ display: 'flex', gap: '3px', height: 8, borderRadius: 999, overflow: 'hidden', bgcolor: 'action.hover' }}>
                <Box sx={{ width: `${(active / total) * 100}%`, bgcolor: 'success.main', borderRadius: 999 }} />
                <Box sx={{ width: `${(inReview / total) * 100}%`, bgcolor: 'info.main', borderRadius: 999 }} />
                <Box sx={{ width: `${(attention / total) * 100}%`, bgcolor: 'error.main', borderRadius: 999 }} />
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5 }}>
                {[
                  { label: `Активно — ${active}`, color: 'success.main' },
                  { label: `На ревью — ${inReview}`, color: 'info.main' },
                  { label: `Правки — ${attention}`, color: 'error.main' },
                  { label: `Черновик — ${drafts}`, color: 'text.disabled' },
                ].map((s) => (
                  <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Directions */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
          Направления
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {DIRECTIONS.map((dir) => {
            const chip = STATUS_CHIP[dir.status];
            const isLive = dir.status === 'live';
            const isPlanned = dir.status === 'planned';
            return (
              <Grid item xs={12} sm={6} md={4} key={dir.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    opacity: isPlanned ? 0.55 : 1,
                    transition: 'box-shadow 150ms',
                    '&:hover': isLive ? { boxShadow: 2 } : {},
                  }}
                >
                  {isLive ? (
                    <CardActionArea
                      onClick={() => dir.route && navigate(dir.route)}
                      sx={{ height: '100%', alignItems: 'flex-start', display: 'flex', flexDirection: 'column' }}
                    >
                      <DirectionCardContent
                        dir={dir}
                        chip={chip}
                        loading={loading}
                        total={total}
                        active={active}
                        attention={attention}
                        isLive
                      />
                    </CardActionArea>
                  ) : (
                    <DirectionCardContent
                      dir={dir}
                      chip={chip}
                      loading={loading}
                      total={total}
                      active={active}
                      attention={attention}
                      isLive={false}
                    />
                  )}
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {/* Bottom panels */}
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
              Последние изменения
            </Typography>
            <Card variant="outlined">
              {loading ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={20} />
                </Box>
              ) : recentChanged.length === 0 ? (
                <Box sx={{ p: 2.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Нет изменённых дел
                  </Typography>
                </Box>
              ) : recentChanged.map((c, i) => (
                <React.Fragment key={c.slug}>
                  {i > 0 && <Divider />}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      Кодэкс
                    </Typography>
                    {c.status && (
                      <Chip
                        label={STATUS_META[c.status]?.label || c.status}
                        color={STATUS_META[c.status]?.color || 'default'}
                        size="small"
                      />
                    )}
                  </Box>
                </React.Fragment>
              ))}
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
              Требуют внимания
            </Typography>
            <Card variant="outlined">
              {loading ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={20} />
                </Box>
              ) : needAttention.length === 0 ? (
                <Box sx={{ p: 2.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Всё в порядке
                  </Typography>
                </Box>
              ) : needAttention.map((c, i) => (
                <React.Fragment key={c.slug}>
                  {i > 0 && <Divider />}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                    <Box sx={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      bgcolor: c.status === 'changes_requested' ? 'error.main' : 'info.main',
                    }} />
                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </Typography>
                    <Chip
                      label={STATUS_META[c.status || '']?.label || c.status}
                      color={STATUS_META[c.status || '']?.color || 'default'}
                      size="small"
                    />
                  </Box>
                </React.Fragment>
              ))}
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
}

interface DirectionCardContentProps {
  dir: Direction;
  chip: { label: string; color: 'success' | 'warning' | 'default' };
  loading: boolean;
  total: number;
  active: number;
  attention: number;
  isLive: boolean;
}

function DirectionCardContent({ dir, chip, loading, total, active, attention, isLive }: DirectionCardContentProps) {
  return (
    <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: 2,
          bgcolor: `${dir.color}.light` === 'default.light' ? 'action.hover' : undefined,
          backgroundColor: dir.color !== 'default' ? undefined : 'action.hover',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: dir.color !== 'default' ? `${dir.color}.main` : 'text.disabled',
          border: '1px solid',
          borderColor: 'divider',
        }}>
          {dir.icon}
        </Box>
        <Chip label={chip.label} color={chip.color} size="small" />
      </Box>
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 0.25 }}>{dir.name}</Typography>
        <Typography variant="body2" color="text.secondary">{dir.desc}</Typography>
      </Box>
      {isLive ? (
        loading ? (
          <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <CircularProgress size={14} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 2.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{total}</Typography>
              <Typography variant="caption" color="text.secondary">единиц</Typography>
            </Box>
            <Box>
              <Typography variant="h6" color="success.main" sx={{ lineHeight: 1.2 }}>{active}</Typography>
              <Typography variant="caption" color="text.secondary">активных</Typography>
            </Box>
            {attention > 0 && (
              <Box>
                <Typography variant="h6" color="error.main" sx={{ lineHeight: 1.2 }}>{attention}</Typography>
                <Typography variant="caption" color="text.secondary">правок</Typography>
              </Box>
            )}
          </Box>
        )
      ) : (
        <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {dir.status === 'planned' ? 'Нет данных' : 'Ожидается подключение'}
          </Typography>
        </Box>
      )}
    </CardContent>
  );
}
