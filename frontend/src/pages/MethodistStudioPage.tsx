import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  createTheme,
  Divider,
  IconButton,
  ThemeProvider,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  AutoAwesome as AiIcon,
  Logout as LogoutIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { METHODIST_STUDIO_TOKEN_KEY } from '../services/methodistStudioClient';
import { methodistKodexApi } from '../services/methodistKodexApi';
import { KodexExternalSummary } from '../services/kodexApi';
import KodexStudioPage from './KodexStudioPage';

// ─── Brand ───────────────────────────────────────────────────────────────────
const K = {
  void: '#05070a',
  surface: '#0d1117',
  surfaceUp: '#131a21',
  border: 'rgba(0,255,171,0.14)',
  neon: '#00ffab',
  neonSoft: '#58ffcb',
  neonDim: '#00c98a',
  cyan: '#35c7ff',
  danger: '#ff3d54',
  warning: '#f59e0b',
  text: '#ddeae7',
  textDim: '#7a9490',
  textFaint: '#3e5450',
  mono: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
};

const hubTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: K.neon },
    background: { default: K.void, paper: K.surface },
    text: { primary: K.text, secondary: K.textDim },
    divider: K.border,
  },
  typography: { fontFamily: K.mono, fontSize: 13 },
  shape: { borderRadius: 6 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontFamily: K.mono } } },
    MuiChip: { styleOverrides: { root: { fontFamily: K.mono } } },
  },
});

// ─── Direction definitions ────────────────────────────────────────────────────
interface Direction {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
  status: 'live' | 'soon' | 'planned';
  accentBg: string;
  accentColor: string;
}

const DIRECTIONS: Direction[] = [
  {
    id: 'kodex',
    name: 'Кодэкс',
    desc: 'Детективные дела на программирование. Брифинг, улики, финал.',
    icon: <ShieldIcon sx={{ fontSize: 20 }} />,
    status: 'live',
    accentBg: 'rgba(0,255,171,0.1)',
    accentColor: K.neon,
  },
  {
    id: 'game',
    name: 'Гейм Студия',
    desc: 'Интерактивные игровые сценарии и обучающие механики.',
    icon: <span style={{ fontFamily: K.mono, fontSize: 18, lineHeight: 1 }}>⬡</span>,
    status: 'soon',
    accentBg: 'rgba(245,158,11,0.08)',
    accentColor: K.warning,
  },
  {
    id: 'oge',
    name: 'ОГЭ / ЕГЭ',
    desc: 'Тестовые задания и разборы по информатике и математике.',
    icon: <span style={{ fontFamily: K.mono, fontSize: 16, lineHeight: 1 }}>∑</span>,
    status: 'soon',
    accentBg: 'rgba(53,199,255,0.08)',
    accentColor: K.cyan,
  },
  {
    id: 'courses',
    name: 'Учебные курсы',
    desc: 'Уроки, теория, домашние задания по программам обучения.',
    icon: <span style={{ fontFamily: K.mono, fontSize: 18, lineHeight: 1 }}>◈</span>,
    status: 'soon',
    accentBg: 'rgba(167,139,250,0.08)',
    accentColor: '#a78bfa',
  },
  {
    id: 'new',
    name: 'Новое направление',
    desc: 'Подключается по запросу. Собственный редактор контента.',
    icon: <span style={{ fontFamily: K.mono, fontSize: 20, lineHeight: 1, color: K.textFaint }}>+</span>,
    status: 'planned',
    accentBg: 'transparent',
    accentColor: K.textFaint,
  },
];

const STATUS_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  live: { label: 'Подключено', color: K.neonDim, bg: 'rgba(0,201,138,0.12)' },
  soon: { label: 'Скоро', color: K.warning, bg: 'rgba(245,158,11,0.1)' },
  planned: { label: 'Планируется', color: K.textFaint, bg: 'rgba(62,84,80,0.2)' },
};

// ─── Direction card ───────────────────────────────────────────────────────────
const DirectionCard: React.FC<{
  dir: Direction;
  stats?: { total: number; active: number; attention: number };
  onClick?: () => void;
}> = ({ dir, stats, onClick }) => {
  const chip = STATUS_CHIP[dir.status];
  const isLive = dir.status === 'live';
  return (
    <Box
      onClick={isLive ? onClick : undefined}
      sx={{
        border: `1px solid ${isLive ? K.border : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 2,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        cursor: isLive ? 'pointer' : 'default',
        opacity: dir.status === 'planned' ? 0.5 : 1,
        transition: 'all 0.15s',
        bgcolor: K.surface,
        '&:hover': isLive ? {
          borderColor: dir.accentColor,
          bgcolor: dir.accentBg,
        } : {},
      }}
    >
      {/* Head */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{
          width: 38, height: 38, borderRadius: 1.5,
          bgcolor: dir.accentBg,
          border: `1px solid ${dir.accentColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: dir.accentColor, flexShrink: 0,
        }}>
          {dir.icon}
        </Box>
        <Chip
          label={chip.label} size="small"
          sx={{ fontSize: 10, height: 20, color: chip.color, bgcolor: chip.bg, borderRadius: 1 }}
        />
      </Box>

      {/* Text */}
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: K.text, mb: 0.5 }}>{dir.name}</Typography>
        <Typography sx={{ fontSize: 12, color: K.textDim, lineHeight: 1.5 }}>{dir.desc}</Typography>
      </Box>

      {/* Stats */}
      {isLive && stats ? (
        <Box sx={{ display: 'flex', gap: 2.5, pt: 0.5, borderTop: `1px solid ${K.border}` }}>
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: K.text, lineHeight: 1.2 }}>{stats.total}</Typography>
            <Typography sx={{ fontSize: 10, color: K.textFaint }}>единиц</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: K.neonDim, lineHeight: 1.2 }}>{stats.active}</Typography>
            <Typography sx={{ fontSize: 10, color: K.textFaint }}>активных</Typography>
          </Box>
          {stats.attention > 0 && (
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: K.danger, lineHeight: 1.2 }}>{stats.attention}</Typography>
              <Typography sx={{ fontSize: 10, color: K.textFaint }}>правок</Typography>
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ pt: 0.5, borderTop: `1px solid rgba(255,255,255,0.04)` }}>
          <Typography sx={{ fontSize: 11, color: K.textFaint, fontStyle: 'italic' }}>
            {dir.status === 'planned' ? 'Нет данных' : 'Ожидается подключение'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: number | string; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <Box sx={{ bgcolor: K.surfaceUp, borderRadius: 1.5, p: '14px 16px', border: `1px solid ${K.border}` }}>
    <Typography sx={{ fontSize: 11, color: K.textDim, mb: 0.5 }}>{label}</Typography>
    <Typography sx={{ fontSize: 22, fontWeight: 700, color: color || K.text, lineHeight: 1.2 }}>{value}</Typography>
    {sub && <Typography sx={{ fontSize: 11, color: K.textFaint, mt: 0.5 }}>{sub}</Typography>}
  </Box>
);

// ─── Hub ──────────────────────────────────────────────────────────────────────
function MethodistHub({ onEnterDirection }: { onEnterDirection: (id: string) => void }) {
  const [cases, setCases] = useState<KodexExternalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setCases(await methodistKodexApi.list()); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = cases.length;
  const active = cases.filter((c) => c.playable).length;
  const attention = cases.filter((c) => c.status === 'changes_requested').length;
  const inReview = cases.filter((c) => c.status === 'in_review').length;
  const drafts = cases.filter((c) => c.status === 'draft' || !c.status).length;

  const recentChanged = [...cases]
    .filter((c) => c.is_override)
    .slice(0, 5);

  const needAttention = cases
    .filter((c) => c.status === 'changes_requested' || c.status === 'in_review')
    .slice(0, 5);

  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: 'Черновик', color: K.textDim },
    in_review: { label: 'Ревью', color: K.cyan },
    approved: { label: 'Активно', color: K.neonDim },
    changes_requested: { label: 'Правки', color: K.danger },
  };

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: K.void }}>
      <Box sx={{ maxWidth: 900, mx: 'auto', px: 4, py: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>

        {/* Stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
          <StatCard label="Направлений" value={`1 / 5`} sub="подключено" />
          <StatCard label="Контент всего" value={loading ? '…' : total} sub="дел, задач, тем" />
          <StatCard label="На проверке" value={loading ? '…' : inReview} color={inReview > 0 ? K.cyan : undefined} sub="ждут ревью" />
          <StatCard label="Нужны правки" value={loading ? '…' : attention} color={attention > 0 ? K.danger : undefined} sub="по замечаниям" />
        </Box>

        {/* Pipeline */}
        {!loading && total > 0 && (
          <Box>
            <Typography sx={{ fontSize: 10, letterSpacing: '0.2em', color: K.textFaint, mb: 1.5, textTransform: 'uppercase' }}>
              Воронка по статусам — Кодэкс
            </Typography>
            <Box sx={{ display: 'flex', gap: '3px', height: 6, borderRadius: 1, overflow: 'hidden' }}>
              <Box sx={{ width: `${(active / total) * 100}%`, bgcolor: K.neonDim }} />
              <Box sx={{ width: `${(inReview / total) * 100}%`, bgcolor: K.cyan }} />
              <Box sx={{ width: `${(attention / total) * 100}%`, bgcolor: K.danger }} />
              <Box sx={{ flex: 1, bgcolor: K.surfaceUp }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2.5, mt: 1 }}>
              {[
                { label: `Активно — ${active}`, color: K.neonDim },
                { label: `На ревью — ${inReview}`, color: K.cyan },
                { label: `Правки — ${attention}`, color: K.danger },
                { label: `Черновик — ${drafts}`, color: K.textFaint },
              ].map((s) => (
                <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 11, color: K.textDim }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Directions grid */}
        <Box>
          <Typography sx={{ fontSize: 10, letterSpacing: '0.2em', color: K.textFaint, mb: 2, textTransform: 'uppercase' }}>
            Направления
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
            {DIRECTIONS.map((dir) => (
              <DirectionCard
                key={dir.id}
                dir={dir}
                stats={dir.id === 'kodex' && !loading ? { total, active, attention } : undefined}
                onClick={() => onEnterDirection(dir.id)}
              />
            ))}
          </Box>
        </Box>

        {/* Bottom two columns */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

          {/* Recent */}
          <Box>
            <Typography sx={{ fontSize: 10, letterSpacing: '0.2em', color: K.textFaint, mb: 1.5, textTransform: 'uppercase' }}>
              Последние изменения
            </Typography>
            <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, overflow: 'hidden', bgcolor: K.surface }}>
              {loading ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={18} sx={{ color: K.neon }} />
                </Box>
              ) : recentChanged.length === 0 ? (
                <Box sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Нет изменённых дел</Typography>
                </Box>
              ) : (
                recentChanged.map((c, i) => (
                  <React.Fragment key={c.slug}>
                    {i > 0 && <Divider sx={{ borderColor: K.border }} />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: K.neonDim, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 12, color: K.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: K.textFaint, flexShrink: 0 }}>Кодэкс</Typography>
                      {c.status && (
                        <Chip
                          label={statusLabel[c.status]?.label || c.status}
                          size="small"
                          sx={{ fontSize: 10, height: 18, color: statusLabel[c.status]?.color || K.textDim, bgcolor: 'rgba(0,0,0,0.3)', ml: 0.5 }}
                        />
                      )}
                    </Box>
                  </React.Fragment>
                ))
              )}
            </Box>
          </Box>

          {/* Attention */}
          <Box>
            <Typography sx={{ fontSize: 10, letterSpacing: '0.2em', color: K.textFaint, mb: 1.5, textTransform: 'uppercase' }}>
              Требуют внимания
            </Typography>
            <Box sx={{ border: `1px solid ${K.border}`, borderRadius: 1.5, overflow: 'hidden', bgcolor: K.surface }}>
              {loading ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={18} sx={{ color: K.neon }} />
                </Box>
              ) : needAttention.length === 0 ? (
                <Box sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: 12, color: K.textFaint, fontStyle: 'italic' }}>Всё в порядке</Typography>
                </Box>
              ) : (
                needAttention.map((c, i) => (
                  <React.Fragment key={c.slug}>
                    {i > 0 && <Divider sx={{ borderColor: K.border }} />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
                      <Box sx={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        bgcolor: c.status === 'changes_requested' ? K.danger : K.cyan,
                      }} />
                      <Typography sx={{ fontSize: 12, color: K.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </Typography>
                      <Chip
                        label={statusLabel[c.status || '']?.label || c.status}
                        size="small"
                        sx={{
                          fontSize: 10, height: 18,
                          color: statusLabel[c.status || '']?.color || K.textDim,
                          bgcolor: 'rgba(0,0,0,0.3)',
                        }}
                      />
                    </Box>
                  </React.Fragment>
                ))
              )}
            </Box>
          </Box>

        </Box>
      </Box>
    </Box>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MethodistStudioPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'hub' | 'kodex'>('hub');

  useEffect(() => {
    const token = localStorage.getItem(METHODIST_STUDIO_TOKEN_KEY);
    if (!token) {
      navigate('/methodist-studio/login', { replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem(METHODIST_STUDIO_TOKEN_KEY);
    navigate('/methodist-studio/login', { replace: true });
  };

  if (!ready) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: K.void, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: K.neon }} />
      </Box>
    );
  }

  if (view === 'kodex') {
    return (
      <ThemeProvider theme={hubTheme}>
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: K.void, overflow: 'hidden' }}>
          <KodexStudioPage api={methodistKodexApi} />
          {/* Back button injected via floating overlay */}
          <Box sx={{ position: 'fixed', bottom: 20, left: 20, zIndex: 9999 }}>
            <Tooltip title="Вернуться в хаб">
              <Button
                onClick={() => setView('hub')}
                startIcon={<BackIcon sx={{ fontSize: 15 }} />}
                sx={{
                  bgcolor: K.surfaceUp, color: K.textDim, fontSize: 11,
                  border: `1px solid ${K.border}`, height: 32, px: 1.5,
                  '&:hover': { bgcolor: K.surface, color: K.text, borderColor: 'rgba(0,201,138,0.4)' },
                }}
              >
                Студия методиста
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={hubTheme}>
      <Box sx={{ height: '100vh', bgcolor: K.void, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <Box sx={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', px: 3, gap: 2, borderBottom: `1px solid ${K.border}`, bgcolor: K.surface }}>
          <AiIcon sx={{ color: K.neon, fontSize: 18 }} />
          <Box>
            <Typography sx={{ fontFamily: K.mono, fontWeight: 700, letterSpacing: '0.18em', color: K.text, fontSize: 13, lineHeight: 1.1 }}>
              СТУДИЯ МЕТОДИСТА
            </Typography>
            <Typography sx={{ fontSize: 9, color: K.textFaint, letterSpacing: '0.3em' }}>КОНТЕНТ ХАБ</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Выйти из студии">
            <IconButton onClick={handleLogout} size="small" sx={{ color: K.textFaint, '&:hover': { color: K.danger } }}>
              <LogoutIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Hub content */}
        <MethodistHub onEnterDirection={(id) => { if (id === 'kodex') setView('kodex'); }} />

      </Box>
    </ThemeProvider>
  );
}
