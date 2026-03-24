import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Badge,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  TablePagination,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { ownerWorkspaceApi, settingsApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceDigest,
  OwnerWorkspaceNotificationsEnvelope,
  OwnerWorkspaceMessage,
  OwnerWorkspaceProject,
  OwnerWorkspaceSearchResult,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskComment,
  OwnerWorkspaceTaskConfig,
  OwnerWorkspaceTaskStatusCounts,
  OwnerWorkspaceTasksAnalyticsOverview,
  User,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

/** РњР°РєСЃ. Р·Р°РґР°С‡ Р·Р° РѕРґРёРЅ Р·Р°РїСЂРѕСЃ РґР»СЏ РєР°РЅР±Р°РЅР°/РєР°Р»РµРЅРґР°СЂСЏ Рё РІСЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹С… СЃРїРёСЃРєРѕРІ (Р»РёРјРёС‚ API). */
const OWNER_WS_TASKS_FETCH_CAP = 500;

function isTaskOverdue(t: OwnerWorkspaceTask): boolean {
  if (!t.deadline_at || t.status === 'completed' || t.status === 'cancelled') return false;
  return new Date(t.deadline_at).getTime() < Date.now();
}

function deadlineToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  new: 'РќРѕРІР°СЏ',
  in_progress: 'Р’ СЂР°Р±РѕС‚Рµ',
  waiting: 'РћР¶РёРґР°РЅРёРµ',
  completed: 'Р—Р°РІРµСЂС€РµРЅР°',
  cancelled: 'РћС‚РјРµРЅРµРЅР°',
};

const DEFAULT_PRIORITY_LABELS: Record<string, string> = {
  low: 'РќРёР·РєРёР№',
  medium: 'РЎСЂРµРґРЅРёР№',
  high: 'Р’С‹СЃРѕРєРёР№',
  critical: 'РљСЂРёС‚РёС‡РµСЃРєРёР№',
};

type OwnerWorkspaceSubprojectTreeNode = {
  project: OwnerWorkspaceProject;
  children: OwnerWorkspaceSubprojectTreeNode[];
};

function buildOwnerWsProjectChildrenByParent(catalog: OwnerWorkspaceProject[]) {
  const m = new Map<number | null, OwnerWorkspaceProject[]>();
  for (const p of catalog) {
    const k = p.parent_project_id ?? null;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  return m;
}

function buildOwnerWsSubprojectTreeAt(
  rootId: number,
  m: Map<number | null, OwnerWorkspaceProject[]>
): OwnerWorkspaceSubprojectTreeNode[] {
  const direct = m.get(rootId) || [];
  return direct.map((project) => ({
    project,
    children: buildOwnerWsSubprojectTreeAt(project.id, m),
  }));
}

/** Р’СЃРµ id СЃС‚СЂРѕРіРѕ РЅРёР¶Рµ rootId (Р±РµР· СЃР°РјРѕРіРѕ rootId). */
function collectOwnerWsDescendantProjectIds(catalog: OwnerWorkspaceProject[], rootId: number): Set<number> {
  const byParent = new Map<number, number[]>();
  for (const p of catalog) {
    if (p.parent_project_id == null) continue;
    if (!byParent.has(p.parent_project_id)) byParent.set(p.parent_project_id, []);
    byParent.get(p.parent_project_id)!.push(p.id);
  }
  const out = new Set<number>();
  const stack = [...(byParent.get(rootId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of byParent.get(id) || []) stack.push(c);
  }
  return out;
}

/** Р”РѕРїСѓСЃС‚РёРјС‹Рµ СЂРѕРґРёС‚РµР»Рё РїСЂРё РїРµСЂРµРЅРѕСЃРµ movingId (Р±РµР· С†РёРєР»РѕРІ). contextRootId вЂ” РѕС‚РєСЂС‹С‚С‹Р№ РІ РґРёР°Р»РѕРіРµ РїСЂРѕРµРєС‚ (РїРѕРґРїРёСЃСЊ РІ СЃРїРёСЃРєРµ). */
function ownerWsValidParentProjectOptions(
  catalog: OwnerWorkspaceProject[],
  movingId: number,
  contextRootId: number
): { id: number | null; label: string }[] {
  const banned = collectOwnerWsDescendantProjectIds(catalog, movingId);
  banned.add(movingId);
  const opts: { id: number | null; label: string }[] = [{ id: null, label: '(РєРѕСЂРµРЅСЊ)' }];
  for (const p of catalog) {
    if (banned.has(p.id)) continue;
    const tag = p.id === contextRootId ? ' (С‚РµРєСѓС‰РёР№ РїСЂРѕРµРєС‚)' : '';
    opts.push({ id: p.id, label: `${p.name}${tag}` });
  }
  opts.sort((a, b) => {
    if (a.id === null) return -1;
    if (b.id === null) return 1;
    return a.label.localeCompare(b.label, 'ru');
  });
  return opts;
}

const OwnerWorkspaceSubprojectTreeRow: React.FC<{
  node: OwnerWorkspaceSubprojectTreeNode;
  depth: number;
  catalog: OwnerWorkspaceProject[];
  contextRootId: number;
  isWorkspaceFullAccess: boolean;
  currentUserId: number | undefined;
  onApplied: () => Promise<void>;
  setError: (msg: string | null) => void;
}> = ({
  node,
  depth,
  catalog,
  contextRootId,
  isWorkspaceFullAccess,
  currentUserId,
  onApplied,
  setError,
}) => {
  const p = node.project;
  const canReparent = isWorkspaceFullAccess || (currentUserId != null && p.owner_id === currentUserId);
  const parentOptions = useMemo(
    () => ownerWsValidParentProjectOptions(catalog, p.id, contextRootId),
    [catalog, p.id, contextRootId]
  );
  const currentParent = p.parent_project_id ?? null;
  const [draftParent, setDraftParent] = useState<number | null>(currentParent);
  useEffect(() => {
    setDraftParent(currentParent);
  }, [p.id, currentParent]);

  const applyMove = async () => {
    if (draftParent === currentParent) return;
    try {
      await ownerWorkspaceApi.updateProject(p.id, { parent_project_id: draftParent });
      setError(null);
      await onApplied();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРЅРµСЃС‚Рё РїРѕРґРїСЂРѕРµРєС‚'));
    }
  };

  return (
    <Box sx={{ pl: depth * 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
        sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ minWidth: 0, flex: '1 1 140px' }}>
          {p.name}
        </Typography>
        <Chip size="small" label={p.status} sx={{ alignSelf: 'flex-start' }} />
        {canReparent ? (
          <>
            <TextField
              select
              size="small"
              label="Р РѕРґРёС‚РµР»СЊ"
              sx={{ minWidth: 200, flex: '2 1 200px' }}
              value={draftParent === null ? '' : String(draftParent)}
              onChange={(e) => {
                const v = e.target.value;
                setDraftParent(v === '' ? null : Number(v));
              }}
              SelectProps={{
                MenuProps: { PaperProps: { sx: { maxHeight: 320 } } },
              }}
            >
              {parentOptions.map((o) => (
                <MenuItem key={o.id === null ? 'root' : String(o.id)} value={o.id === null ? '' : String(o.id)}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              disabled={draftParent === currentParent}
              onClick={() => void applyMove()}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              РџРµСЂРµРЅРµСЃС‚Рё
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            РџРµСЂРµРЅРѕСЃ: С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»РµС† РїРѕРґРїСЂРѕРµРєС‚Р° РёР»Рё РїРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї
          </Typography>
        )}
      </Stack>
      {node.children.map((ch) => (
        <OwnerWorkspaceSubprojectTreeRow
          key={ch.project.id}
          node={ch}
          depth={depth + 1}
          catalog={catalog}
          contextRootId={contextRootId}
          isWorkspaceFullAccess={isWorkspaceFullAccess}
          currentUserId={currentUserId}
          onApplied={onApplied}
          setError={setError}
        />
      ))}
    </Box>
  );
};

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
type OwnerWorkspaceTaskPriority = 'low' | 'medium' | 'high' | 'critical';
type OwnerWorkspaceProjectParticipantRole = 'member' | 'manager' | 'observer';

const OWNER_WS_STATUSES: OwnerWorkspaceTaskStatus[] = ['new', 'in_progress', 'waiting', 'completed', 'cancelled'];
const OWNER_WS_PRIORITIES: OwnerWorkspaceTaskPriority[] = ['low', 'medium', 'high', 'critical'];
const OWNER_WS_PROJECT_PARTICIPANT_ROLE_LABELS: Record<OwnerWorkspaceProjectParticipantRole, string> = {
  member: 'СѓС‡Р°СЃС‚РЅРёРє',
  manager: 'РјРµРЅРµРґР¶РµСЂ',
  observer: 'РЅР°Р±Р»СЋРґР°С‚РµР»СЊ',
};

const OWNER_WS_ACCESS_MATRIX: Array<{
  role: string;
  scope: string;
  capabilities: string[];
}> = [
  {
    role: 'admin / owner',
    scope: 'Р’РµСЃСЊ РјРѕРґСѓР»СЊ owner workspace',
    capabilities: [
      'РџРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї РєРѕ РІСЃРµРј РїСЂРѕРµРєС‚Р°Рј, РєРѕРЅС‚Р°РєС‚Р°Рј, Р·Р°РґР°С‡Р°Рј Рё СЃРѕРѕР±С‰РµРЅРёСЏРј',
      'РЎРјРµРЅР° РІР»Р°РґРµР»СЊС†Р° РїСЂРѕРµРєС‚Р° Рё Р°СЂС…РёРІРёСЂРѕРІР°РЅРёРµ',
      'РќР°Р·РЅР°С‡РµРЅРёРµ manager Рё observer',
      'РЎРёСЃС‚РµРјРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё СЃС‚Р°С‚СѓСЃРѕРІ Рё РїСЂРёРѕСЂРёС‚РµС‚РѕРІ',
    ],
  },
  {
    role: 'project owner',
    scope: 'РЎРІРѕР№ РїСЂРѕРµРєС‚ Рё СЃРІСЏР·Р°РЅРЅС‹Рµ СЃСѓС‰РЅРѕСЃС‚Рё',
    capabilities: [
      'Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РїСЂРѕРµРєС‚Р°, Р·Р°РґР°С‡, РєРѕРЅС‚Р°РєС‚РѕРІ Рё СЃРѕРѕР±С‰РµРЅРёР№ РІ РїСЂРѕРµРєС‚Рµ',
      'РЈРїСЂР°РІР»РµРЅРёРµ СЃРѕСЃС‚Р°РІРѕРј РїСЂРѕРµРєС‚Р°',
      'РќР°Р·РЅР°С‡РµРЅРёРµ manager Рё observer РІРЅСѓС‚СЂРё РїСЂРѕРµРєС‚Р°',
      'РђСЂС…РёРІРёСЂРѕРІР°РЅРёРµ СЃРІРѕРµРіРѕ РїСЂРѕРµРєС‚Р°',
    ],
  },
  {
    role: 'manager',
    scope: 'РџСЂРѕРµРєС‚, РіРґРµ РЅР°Р·РЅР°С‡РµРЅ manager',
    capabilities: [
      'Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Р·Р°РґР°С‡, РєРѕРЅС‚Р°РєС‚РѕРІ Рё СЃРѕРѕР±С‰РµРЅРёР№ РїСЂРѕРµРєС‚Р°',
      'Р”РѕР±Р°РІР»РµРЅРёРµ Рё СѓРґР°Р»РµРЅРёРµ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїСЂРѕРµРєС‚Р°',
      'РќРµ РјРѕР¶РµС‚ РЅР°Р·РЅР°С‡Р°С‚СЊ РґСЂСѓРіРёС… manager РёР»Рё observer',
      'РќРµ РјРµРЅСЏРµС‚ РІР»Р°РґРµР»СЊС†Р° Рё РЅРµ Р°СЂС…РёРІРёСЂСѓРµС‚ РїСЂРѕРµРєС‚',
    ],
  },
  {
    role: 'member',
    scope: 'РџСЂРѕРµРєС‚, РіРґРµ РґРѕР±Р°РІР»РµРЅ СѓС‡Р°СЃС‚РЅРёРєРѕРј',
    capabilities: [
      'Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Р·Р°РґР°С‡, РєРѕРЅС‚Р°РєС‚РѕРІ Рё СЃРѕРѕР±С‰РµРЅРёР№ РїСЂРѕРµРєС‚Р°',
      'РќРµС‚ СѓРїСЂР°РІР»РµРЅРёСЏ СЃРѕСЃС‚Р°РІРѕРј РїСЂРѕРµРєС‚Р°',
      'РќРµС‚ СЃРјРµРЅС‹ РІР»Р°РґРµР»СЊС†Р° Рё Р°СЂС…РёРІРёСЂРѕРІР°РЅРёСЏ',
    ],
  },
  {
    role: 'observer',
    scope: 'РџСЂРѕРµРєС‚, РіРґРµ РґРѕР±Р°РІР»РµРЅ РЅР°Р±Р»СЋРґР°С‚РµР»РµРј',
    capabilities: [
      'РўРѕР»СЊРєРѕ РїСЂРѕСЃРјРѕС‚СЂ РїСЂРѕРµРєС‚Р°, Р·Р°РґР°С‡, РєРѕРЅС‚Р°РєС‚РѕРІ Рё СЃРѕРѕР±С‰РµРЅРёР№',
      'РќРµ СЂРµРґР°РєС‚РёСЂСѓРµС‚ РєР°СЂС‚РѕС‡РєРё, РєРѕРјРјРµРЅС‚Р°СЂРёРё, СЃРѕРѕР±С‰РµРЅРёСЏ Рё РїСЂРёРІСЏР·РєРё',
      'РќРµ Р·Р°РІРµСЂС€Р°РµС‚ Р·Р°РґР°С‡Рё Рё РЅРµ СѓРїСЂР°РІР»СЏРµС‚ СЃРѕСЃС‚Р°РІРѕРј РїСЂРѕРµРєС‚Р°',
    ],
  },
  {
    role: 'sales / trainer',
    scope: 'РўРѕР»СЊРєРѕ СЃРІРѕСЏ Р·РѕРЅР° РІРёРґРёРјРѕСЃС‚Рё',
    capabilities: [
      'Р’РёРґРёС‚ СЃРІРѕРё РїСЂРѕРµРєС‚С‹, СЃРІСЏР·Р°РЅРЅС‹Рµ РєРѕРЅС‚Р°РєС‚С‹ Рё СЃРІРѕРё Р·Р°РґР°С‡Рё',
      'РњРѕР¶РµС‚ СЂР°Р±РѕС‚Р°С‚СЊ С‚РѕР»СЊРєРѕ РІРЅСѓС‚СЂРё РґРѕСЃС‚СѓРїРЅРѕР№ Р·РѕРЅС‹',
      'РџСЂР°РІР° РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ РѕРіСЂР°РЅРёС‡РёРІР°СЋС‚СЃСЏ СЂРѕР»СЊСЋ РІ РїСЂРѕРµРєС‚Рµ',
    ],
  },
];

const OWNER_WS_GLOBAL_ROLE_LABELS: Record<string, string> = {
  admin: 'admin',
  owner: 'owner',
  sales: 'sales',
  trainer: 'trainer',
};

type OwnerWorkspaceAssigneeAnalyticsRow = {
  assigneeId: number | null;
  assigneeName: string;
  activeCount: number;
  overdueCount: number;
  completedCount: number;
  avgDaysToComplete: number | null;
};

const OW_TAB_PROJECTS = 0;
const OW_TAB_CONTACTS = 1;
const OW_TAB_TASKS = 2;
const OW_TAB_COMMS = 3;
const OW_TAB_NOTIFICATIONS = 4;
const OW_TAB_SETTINGS = 5;
const OW_TAB_HISTORY = 6;

/** РЎР»Р°РіРё РґР»СЏ deep-link: `/owner-workspace?tab=<slug>&task=<id>` (СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ) Рё РїСѓС‚Рё `/owner-workspace/<slug>`. */
const OW_TAB_SLUGS = ['projects', 'contacts', 'tasks', 'comms', 'notifications', 'settings', 'history'] as const;

/** РџСѓС‚СЊ РІРєР»Р°РґРєРё (В§16): РѕС‚РґРµР»СЊРЅС‹Рµ URL РєР°Рє Сѓ `/notifications` Рё `/settings`. */
function ownerWorkspaceTabPathname(tabIndex: number): string {
  switch (tabIndex) {
    case OW_TAB_NOTIFICATIONS:
      return '/owner-workspace/notifications';
    case OW_TAB_SETTINGS:
      return '/owner-workspace/settings';
    case OW_TAB_PROJECTS:
      return '/owner-workspace/projects';
    case OW_TAB_CONTACTS:
      return '/owner-workspace/contacts';
    case OW_TAB_TASKS:
      return '/owner-workspace/tasks';
    case OW_TAB_COMMS:
      return '/owner-workspace/comms';
    case OW_TAB_HISTORY:
      return '/owner-workspace/history';
    default:
      return '/owner-workspace/projects';
  }
}

function ownerWorkspacePathToTab(pathname: string): number | null {
  const p = pathname.replace(/\/$/, '') || pathname;
  if (p === '/owner-workspace/notifications') return OW_TAB_NOTIFICATIONS;
  if (p === '/owner-workspace/settings') return OW_TAB_SETTINGS;
  if (p.startsWith('/owner-workspace/projects')) return OW_TAB_PROJECTS;
  if (p.startsWith('/owner-workspace/contacts')) return OW_TAB_CONTACTS;
  if (p.startsWith('/owner-workspace/tasks')) return OW_TAB_TASKS;
  if (p === '/owner-workspace/comms') return OW_TAB_COMMS;
  if (p === '/owner-workspace/history') return OW_TAB_HISTORY;
  return null;
}

function ownerWorkspaceEntityFromPath(
  pathname: string
): { kind: 'project' | 'contact' | 'task' | null; id: number | null } {
  const p = pathname.replace(/\/$/, '') || pathname;
  const projectMatch = p.match(/^\/owner-workspace\/projects\/(\d+)$/);
  if (projectMatch) return { kind: 'project', id: parseInt(projectMatch[1], 10) };
  const contactMatch = p.match(/^\/owner-workspace\/contacts\/(\d+)$/);
  if (contactMatch) return { kind: 'contact', id: parseInt(contactMatch[1], 10) };
  const taskMatch = p.match(/^\/owner-workspace\/tasks\/(\d+)$/);
  if (taskMatch) return { kind: 'task', id: parseInt(taskMatch[1], 10) };
  return { kind: null, id: null };
}

function tabIndexFromSlug(slug: string | null): number | null {
  if (!slug) return null;
  const i = OW_TAB_SLUGS.indexOf(slug as (typeof OW_TAB_SLUGS)[number]);
  return i >= 0 ? i : null;
}

/** Р’РєР»Р°РґРєР° РёР· URL: РїСѓС‚СЊ `/owner-workspace/<СЂР°Р·РґРµР»>`, Р»РёР±Рѕ `/owner-workspace?tab=вЂ¦`, Р»РёР±Рѕ С‚РѕР»СЊРєРѕ `task` в†’ В«Р—Р°РґР°С‡РёВ». */
function resolveOwnerWorkspaceTab(pathname: string, search: URLSearchParams): number | null {
  const fromPath = ownerWorkspacePathToTab(pathname);
  if (fromPath !== null) return fromPath;
  const idx = tabIndexFromSlug(search.get('tab'));
  if (idx !== null) return idx;
  const tr = search.get('task');
  const tid = tr ? parseInt(tr, 10) : NaN;
  if (Number.isFinite(tid) && tid >= 1) return OW_TAB_TASKS;
  return null;
}

const OWNER_WS_NOTIF_KIND_LABELS: Record<string, string> = {
  task_overdue: 'РџСЂРѕСЃСЂРѕС‡РєР°',
  task_due_soon: 'РЎРєРѕСЂРѕ РґРµРґР»Р°Р№РЅ',
  task_assigned: 'РќР°Р·РЅР°С‡РµРЅРёРµ',
  task_comment: 'РљРѕРјРјРµРЅС‚Р°СЂРёР№',
  task_updated: 'РћР±РЅРѕРІР»РµРЅРёРµ Р·Р°РґР°С‡Рё',
  contact_incoming_message: 'РЎРѕРѕР±С‰РµРЅРёРµ',
  task_mention: 'РЈРїРѕРјРёРЅР°РЅРёРµ',
};

function coerceTaskStatus(v: string): OwnerWorkspaceTaskStatus {
  return OWNER_WS_STATUSES.includes(v as OwnerWorkspaceTaskStatus) ? (v as OwnerWorkspaceTaskStatus) : 'new';
}

function coerceTaskPriority(v: string): OwnerWorkspaceTaskPriority {
  return OWNER_WS_PRIORITIES.includes(v as OwnerWorkspaceTaskPriority) ? (v as OwnerWorkspaceTaskPriority) : 'medium';
}

function ensureTaskOption<T extends string>(options: T[], current: T): T[] {
  return options.includes(current) ? options : [...options, current];
}

type ChecklistRow = { id: string; text: string; done: boolean };

function parseChecklistFromTask(raw: OwnerWorkspaceTask['checklist']): ChecklistRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? o.title ?? o.label ?? `РЁР°Рі ${i + 1}`);
      const done = Boolean(o.done ?? o.completed ?? o.checked);
      return { id: `chk-${i}-${text.slice(0, 12)}`, text, done };
    }
    return { id: `chk-${i}`, text: String(item), done: false };
  });
}

const KANBAN_COLUMNS: {
  label: string;
  statuses: OwnerWorkspaceTaskStatus[];
  dropStatus: OwnerWorkspaceTaskStatus;
}[] = [
  { label: 'РќРѕРІС‹Рµ', statuses: ['new'], dropStatus: 'new' },
  { label: 'Р’ СЂР°Р±РѕС‚Рµ', statuses: ['in_progress'], dropStatus: 'in_progress' },
  { label: 'РћР¶РёРґР°РЅРёРµ', statuses: ['waiting'], dropStatus: 'waiting' },
  { label: 'Р’С‹РїРѕР»РЅРµРЅРѕ', statuses: ['completed'], dropStatus: 'completed' },
  { label: 'РћС‚РјРµРЅРµРЅРѕ', statuses: ['cancelled'], dropStatus: 'cancelled' },
];

const OwnerWorkspacePage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const entityRoute = useMemo(() => ownerWorkspaceEntityFromPath(location.pathname), [location.pathname]);
  const skipNextProjectFromUrlEffectRef = useRef(false);
  const skipNextContactFromUrlEffectRef = useRef(false);
  const skipNextTaskFromUrlEffectRef = useRef(false);
  const openProjectDialogRef = useRef<
    (project: OwnerWorkspaceProject, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const openContactDialogRef = useRef<
    (contact: OwnerWorkspaceContact, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const openTaskDialogRef = useRef<
    (task: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const loadTasksFilteredRef = useRef<() => Promise<void>>(async () => {});
  const isWorkspaceFullAccess = user?.role === 'admin' || user?.role === 'owner';
  const isLimitedWorkspaceUser = user?.role === 'sales' || user?.role === 'trainer';
  const currentWorkspaceRoleLabel = OWNER_WS_GLOBAL_ROLE_LABELS[user?.role || ''] || (user?.role ?? 'unknown');
  const currentWorkspaceAccessSummary = useMemo(() => {
    if (isWorkspaceFullAccess) {
      return [
        'Полный доступ ко всем проектам, контактам, задачам и сообщениям.',
        'Управление владельцем проекта, архивом и системными настройками.',
        'Назначение project manager и observer внутри проектов.',
      ];
    }
    return [
      'Доступ только к собственной зоне видимости: свои проекты, связанные контакты и свои задачи.',
      'Создание контакта требует явной привязки к доступному проекту.',
      'Фактический уровень редактирования внутри проекта дополнительно зависит от роли member / manager / observer.',
    ];
  }, [isWorkspaceFullAccess]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectsCatalog, setProjectsCatalog] = useState<OwnerWorkspaceProject[]>([]);
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactsCatalog, setContactsCatalog] = useState<OwnerWorkspaceContact[]>([]);
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [conversations, setConversations] = useState<OwnerWorkspaceConversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [historyLogs, setHistoryLogs] = useState<OwnerWorkspaceAuditLog[]>([]);

  const [projectName, setProjectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [newContactProjectId, setNewContactProjectId] = useState<number | ''>('');

  const [projectListSearchInput, setProjectListSearchInput] = useState('');
  const [projectListSearch, setProjectListSearch] = useState('');
  const [projectListStatus, setProjectListStatus] = useState('');
  const [projectListOwnerId, setProjectListOwnerId] = useState<number | ''>('');
  const [projectListOverdueOnly, setProjectListOverdueOnly] = useState(false);

  const [contactListSearchInput, setContactListSearchInput] = useState('');
  const [contactListSearch, setContactListSearch] = useState('');
  const [contactListProjectId, setContactListProjectId] = useState<number | ''>('');
  const [contactListActiveTasksOnly, setContactListActiveTasksOnly] = useState(false);
  const [contactListTag, setContactListTag] = useState<string>('');

  const [archiveProjectConfirm, setArchiveProjectConfirm] = useState<OwnerWorkspaceProject | null>(null);
  const [unlinkContactConfirm, setUnlinkContactConfirm] = useState<{
    projectId: number;
    projectName: string;
    contactId: number;
    contactName: string;
    activeTaskCount: number;
  } | null>(null);
  const [removeParticipantConfirm, setRemoveParticipantConfirm] = useState<{
    projectId: number;
    projectName: string;
    userId: number;
    userName: string;
    role: OwnerWorkspaceProjectParticipantRole;
  } | null>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');
  const [newTaskContactId, setNewTaskContactId] = useState<number | ''>('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<number | ''>('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<number | ''>('');
  const [taskContactFilter, setTaskContactFilter] = useState<number | ''>('');
  const [taskOverdueOnly, setTaskOverdueOnly] = useState(false);
  const [taskActiveOnly, setTaskActiveOnly] = useState(false);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<number | ''>('');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkAssigneeMode, setBulkAssigneeMode] = useState<'skip' | 'set' | 'clear'>('skip');
  const [bulkAssigneeUserId, setBulkAssigneeUserId] = useState<number | ''>('');
  const [bulkPriority, setBulkPriority] = useState<string>('');
  const [taskSortBy, setTaskSortBy] = useState<'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority'>(
    'created_at'
  );
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('desc');
  const [taskListTotal, setTaskListTotal] = useState(0);
  const [taskListPage, setTaskListPage] = useState(0);
  const [taskListRowsPerPage, setTaskListRowsPerPage] = useState(25);
  const [taskStatusCounts, setTaskStatusCounts] = useState<OwnerWorkspaceTaskStatusCounts | null>(null);
  const [tasksAnalytics, setTasksAnalytics] = useState<OwnerWorkspaceTasksAnalyticsOverview | null>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifEnvelope, setNotifEnvelope] = useState<OwnerWorkspaceNotificationsEnvelope | null>(null);
  const [maxSyncResult, setMaxSyncResult] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [taskConfig, setTaskConfig] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigDraft, setTaskConfigDraft] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigSaving, setTaskConfigSaving] = useState(false);
  const [digest, setDigest] = useState<OwnerWorkspaceDigest | null>(null);
  const [digestScope, setDigestScope] = useState<'all' | 'mine'>('all');
  const [digestProjectFilter, setDigestProjectFilter] = useState<number | ''>('');
  const [digestDueHours, setDigestDueHours] = useState(48);
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(false);
  const [notifyTaskOverdue, setNotifyTaskOverdue] = useState(true);
  const [notifyTaskDueSoon, setNotifyTaskDueSoon] = useState(true);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(true);
  const [notifyTaskComment, setNotifyTaskComment] = useState(true);
  const [notifyTaskUpdated, setNotifyTaskUpdated] = useState(true);
  const [notifyContactIncomingMessage, setNotifyContactIncomingMessage] = useState(true);
  const [notifyTaskMention, setNotifyTaskMention] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OwnerWorkspaceSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [projectDialog, setProjectDialog] = useState<OwnerWorkspaceProject | null>(null);
  const [projectEditName, setProjectEditName] = useState('');
  const [projectEditDescription, setProjectEditDescription] = useState('');
  const [projectEditStatus, setProjectEditStatus] = useState<string>('active');
  const [subprojectName, setSubprojectName] = useState('');
  const [linkContactId, setLinkContactId] = useState<OwnerWorkspaceContact | null>(null);

  const [contactDialog, setContactDialog] = useState<OwnerWorkspaceContact | null>(null);
  const [contactEditFullName, setContactEditFullName] = useState('');
  const [contactEditPhone, setContactEditPhone] = useState('');
  const [contactEditEmail, setContactEditEmail] = useState('');
  const [contactEditCompany, setContactEditCompany] = useState('');
  const [contactEditPosition, setContactEditPosition] = useState('');
  const [contactEditTags, setContactEditTags] = useState('');
  const [contactEditComment, setContactEditComment] = useState('');
  const [contactEditSource, setContactEditSource] = useState('');
  const [contactLinkProjectId, setContactLinkProjectId] = useState<OwnerWorkspaceProject | null>(null);
  const [contactMessages, setContactMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [newContactMessage, setNewContactMessage] = useState('');

  const [taskDialog, setTaskDialog] = useState<OwnerWorkspaceTask | null>(null);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<OwnerWorkspaceTask | null>(null);

  const closeProjectDialog = useCallback(() => {
    setProjectDialog(null);
    if (entityRoute.kind === 'project') {
      navigate('/owner-workspace/projects', { replace: true });
    }
  }, [entityRoute.kind, navigate]);

  const closeContactDialog = useCallback(() => {
    setContactDialog(null);
    if (entityRoute.kind === 'contact') {
      navigate('/owner-workspace/contacts', { replace: true });
    }
  }, [entityRoute.kind, navigate]);

  const closeTaskDialog = useCallback(() => {
    setTaskDialog(null);
    if (entityRoute.kind === 'task') {
      navigate('/owner-workspace/tasks', { replace: true });
      return;
    }
    setSearchParams((prev) => {
      if (!prev.get('task')) return prev;
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    }, { replace: true });
  }, [entityRoute.kind, navigate, setSearchParams]);

  const [taskEditTitle, setTaskEditTitle] = useState('');
  const [taskEditDescription, setTaskEditDescription] = useState('');
  const [taskEditStatus, setTaskEditStatus] = useState<OwnerWorkspaceTaskStatus>('new');
  const [taskEditPriority, setTaskEditPriority] = useState<OwnerWorkspaceTaskPriority>('medium');
  const [taskEditDeadline, setTaskEditDeadline] = useState('');
  const [taskEditStartAt, setTaskEditStartAt] = useState('');
  const [taskEditAttachmentsText, setTaskEditAttachmentsText] = useState('[]');
  const [taskDialogHistory, setTaskDialogHistory] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [taskEditProjectId, setTaskEditProjectId] = useState<number | ''>('');
  const [taskEditContactId, setTaskEditContactId] = useState<number | ''>('');
  const [taskEditAssigneeId, setTaskEditAssigneeId] = useState<number | ''>('');
  const [taskEditTags, setTaskEditTags] = useState<string[]>([]);
  const [taskEditChecklist, setTaskEditChecklist] = useState<ChecklistRow[]>([]);
  const [taskComments, setTaskComments] = useState<OwnerWorkspaceTaskComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  const [completeDialogTask, setCompleteDialogTask] = useState<OwnerWorkspaceTask | null>(null);
  const [completeMode, setCompleteMode] = useState<'close' | 'close_and_create_next'>('close');
  const [nextTaskTitle, setNextTaskTitle] = useState('');

  const [commsContactId, setCommsContactId] = useState<number | null>(null);
  const [commsMessages, setCommsMessages] = useState<OwnerWorkspaceMessage[]>([]);
  /** РџРѕРёСЃРє РїРѕ СЃРїРёСЃРєСѓ РґРёР°Р»РѕРіРѕРІ (РёРјСЏ / РїРѕСЃР»РµРґРЅРµРµ СЃРѕРѕР±С‰РµРЅРёРµ) */
  const [commsDialogSearch, setCommsDialogSearch] = useState('');
  /** РџРѕРёСЃРє РїРѕ С‚РµРєСЃС‚Сѓ РІ РѕС‚РєСЂС‹С‚РѕР№ РїРµСЂРµРїРёСЃРєРµ */
  const [commsThreadSearch, setCommsThreadSearch] = useState('');
  /** РџРѕРёСЃРє РїРѕ СЃРѕРѕР±С‰РµРЅРёСЏРј РІ РєР°СЂС‚РѕС‡РєРµ РєРѕРЅС‚Р°РєС‚Р° */
  const [contactMessageSearch, setContactMessageSearch] = useState('');
  const [messageTaskDialog, setMessageTaskDialog] = useState<{ message: OwnerWorkspaceMessage } | null>(null);
  const [messageTaskTitle, setMessageTaskTitle] = useState('');
  const [linkTaskDialog, setLinkTaskDialog] = useState<{ message: OwnerWorkspaceMessage } | null>(null);
  const [linkTaskOptions, setLinkTaskOptions] = useState<OwnerWorkspaceTask[]>([]);
  const [linkTaskSelected, setLinkTaskSelected] = useState<OwnerWorkspaceTask | null>(null);
  const [participantToAdd, setParticipantToAdd] = useState<User | null>(null);
  const [newParticipantRole, setNewParticipantRole] = useState<OwnerWorkspaceProjectParticipantRole>('member');
  const [contactDialogTasks, setContactDialogTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [projectDialogTasks, setProjectDialogTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [projectDialogTaskStatus, setProjectDialogTaskStatus] = useState<string>('');
  const [projectDialogTaskSearch, setProjectDialogTaskSearch] = useState('');

  const statusLabels = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_STATUS_LABELS };
    for (const item of taskConfig?.statuses ?? []) {
      merged[item.key] = item.label;
    }
    return merged;
  }, [taskConfig]);

  const priorityLabels = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_PRIORITY_LABELS };
    for (const item of taskConfig?.priorities ?? []) {
      merged[item.key] = item.label;
    }
    return merged;
  }, [taskConfig]);

  const enabledStatuses = useMemo(() => {
    const configured = (taskConfig?.statuses ?? [])
      .filter((item) => item.enabled !== false)
      .map((item) => coerceTaskStatus(item.key));
    return configured.length > 0 ? Array.from(new Set(configured)) : OWNER_WS_STATUSES;
  }, [taskConfig]);

  const enabledPriorities = useMemo(() => {
    const configured = (taskConfig?.priorities ?? [])
      .filter((item) => item.enabled !== false)
      .map((item) => coerceTaskPriority(item.key));
    return configured.length > 0 ? Array.from(new Set(configured)) : OWNER_WS_PRIORITIES;
  }, [taskConfig]);

  const editStatusOptions = useMemo(
    () => ensureTaskOption(enabledStatuses, taskEditStatus),
    [enabledStatuses, taskEditStatus]
  );

  const editPriorityOptions = useMemo(
    () => ensureTaskOption(enabledPriorities, taskEditPriority),
    [enabledPriorities, taskEditPriority]
  );

  const createPriorityOptions = useMemo(
    () => ensureTaskOption(enabledPriorities, taskPriority),
    [enabledPriorities, taskPriority]
  );

  useEffect(() => {
    const id = window.setTimeout(() => setProjectListSearch(projectListSearchInput), 400);
    return () => clearTimeout(id);
  }, [projectListSearchInput]);

  useEffect(() => {
    const id = window.setTimeout(() => setContactListSearch(contactListSearchInput), 400);
    return () => clearTimeout(id);
  }, [contactListSearchInput]);

  const loadProjectsAndContacts = useCallback(async () => {
    try {
      const projectParams = {
        status_filter: projectListStatus || undefined,
        search: projectListSearch.trim() || undefined,
        owner_id: projectListOwnerId === '' ? undefined : projectListOwnerId,
        has_overdue_tasks: projectListOverdueOnly || undefined,
      };
      const contactParams = {
        search: contactListSearch.trim() || undefined,
        project_id: contactListProjectId === '' ? undefined : contactListProjectId,
        active_tasks_only: contactListActiveTasksOnly || undefined,
        tag: contactListTag.trim() || undefined,
      };
      const hasProjectFilters = Boolean(
        projectListStatus ||
          projectListSearch.trim() ||
          projectListOwnerId !== '' ||
          projectListOverdueOnly
      );
      const hasContactFilters = Boolean(
        contactListSearch.trim() ||
          contactListProjectId !== '' ||
          contactListActiveTasksOnly ||
          contactListTag.trim()
      );

      const tasks: Promise<unknown>[] = [];
      if (hasProjectFilters) {
        tasks.push(ownerWorkspaceApi.listProjects(projectParams));
        tasks.push(ownerWorkspaceApi.listProjects({}));
      } else {
        tasks.push(ownerWorkspaceApi.listProjects({}));
      }
      if (hasContactFilters) {
        tasks.push(ownerWorkspaceApi.listContacts(contactParams));
        tasks.push(ownerWorkspaceApi.listContacts({}));
      } else {
        tasks.push(ownerWorkspaceApi.listContacts({}));
      }

      const results = await Promise.all(tasks);
      let idx = 0;
      let pFiltered: OwnerWorkspaceProject[];
      let pAll: OwnerWorkspaceProject[];
      if (hasProjectFilters) {
        pFiltered = results[idx++] as OwnerWorkspaceProject[];
        pAll = results[idx++] as OwnerWorkspaceProject[];
      } else {
        pAll = results[idx++] as OwnerWorkspaceProject[];
        pFiltered = pAll;
      }
      let cFiltered: OwnerWorkspaceContact[];
      let cAll: OwnerWorkspaceContact[];
      if (hasContactFilters) {
        cFiltered = results[idx++] as OwnerWorkspaceContact[];
        cAll = results[idx++] as OwnerWorkspaceContact[];
      } else {
        cAll = results[idx++] as OwnerWorkspaceContact[];
        cFiltered = cAll;
      }

      setProjects(pFiltered);
      setProjectsCatalog(pAll);
      setContacts(cFiltered);
      setContactsCatalog(cAll);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїСЂРѕРµРєС‚С‹/РєРѕРЅС‚Р°РєС‚С‹'));
    }
  }, [
    projectListStatus,
    projectListSearch,
    projectListOwnerId,
    projectListOverdueOnly,
    contactListSearch,
    contactListProjectId,
    contactListActiveTasksOnly,
    contactListTag,
  ]);

  const loadTasksFiltered = useCallback(async (opts?: { statusFilter?: string }) => {
    try {
      const usePaging = taskViewMode === 'list';
      const effStatus = opts?.statusFilter !== undefined ? opts.statusFilter : taskStatusFilter;
      const filterKey = JSON.stringify({
        taskSearch,
        taskStatusFilter: effStatus,
        taskPriorityFilter,
        taskProjectFilter,
        taskContactFilter,
        taskOverdueOnly,
        taskActiveOnly,
        taskAssigneeFilter,
        taskSortBy,
        taskSortDir,
        taskViewMode,
        taskListRowsPerPage,
      });
      let effectivePage = taskListPage;
      if (taskFilterKeyRef.current !== filterKey) {
        taskFilterKeyRef.current = filterKey;
        effectivePage = 0;
        if (taskListPage !== 0) {
          setTaskListPage(0);
        }
      }
      const limit = usePaging ? taskListRowsPerPage : OWNER_WS_TASKS_FETCH_CAP;
      const offset = usePaging ? effectivePage * taskListRowsPerPage : 0;
      const countParams = {
        search: taskSearch.trim() || undefined,
        priority: taskPriorityFilter || undefined,
        project_id: taskProjectFilter === '' ? undefined : taskProjectFilter,
        contact_id: taskContactFilter === '' ? undefined : taskContactFilter,
        assignee_id: taskAssigneeFilter === '' ? undefined : taskAssigneeFilter,
        overdue_only: taskOverdueOnly || undefined,
        active_only: taskActiveOnly || undefined,
      };
      const [taskPage, counts] = await Promise.all([
        ownerWorkspaceApi.listTasks({
          ...countParams,
          status_filter: effStatus || undefined,
          sort_by: taskSortBy,
          sort_dir: taskSortDir,
          limit,
          offset,
        }),
        ownerWorkspaceApi.getTaskStatusCounts(countParams),
      ]);
      setTasks(taskPage.items);
      setTaskListTotal(taskPage.total);
      setTaskStatusCounts(counts);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р·Р°РґР°С‡Рё'));
    }
  }, [
    taskSearch,
    taskStatusFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskContactFilter,
    taskOverdueOnly,
    taskActiveOnly,
    taskAssigneeFilter,
    taskSortBy,
    taskSortDir,
    taskViewMode,
    taskListPage,
    taskListRowsPerPage,
  ]);

  const loadNotifications = useCallback(async (limit = 80) => {
    try {
      const env = await ownerWorkspaceApi.listNotifications({ limit });
      setNotifEnvelope(env);
    } catch {
      setNotifEnvelope(null);
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [conv, u, cfg] = await Promise.all([
        ownerWorkspaceApi.listConversations(),
        usersApi.getAll(),
        settingsApi.getOwnerWorkspaceTaskConfig(),
      ]);
      setConversations(conv);
      setUsers(Array.isArray(u) ? u : []);
      setTaskConfig(cfg);
      setTaskConfigDraft(cfg);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РІСЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ'));
    }
  }, []);

  const loadDigest = useCallback(async () => {
    try {
      const params: {
        due_within_hours: number;
        assignee_id?: number;
        project_id?: number;
      } = { due_within_hours: digestDueHours };
      if (digestScope === 'mine' && user?.id != null) {
        params.assignee_id = user.id;
      }
      if (digestProjectFilter !== '') {
        params.project_id = digestProjectFilter;
      }
      const d = await ownerWorkspaceApi.getDigest(params);
      setDigest(d);
    } catch {
      setDigest(null);
    }
  }, [digestDueHours, digestScope, digestProjectFilter, user?.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProjectsAndContacts(), loadTasksFiltered(), loadMeta()]);
    } finally {
      setLoading(false);
    }
  }, [loadProjectsAndContacts, loadTasksFiltered, loadMeta]);

  const skipProjectsContactsFilterReload = useRef(false);
  const taskFilterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    skipProjectsContactsFilterReload.current = true;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- РїРµСЂРІРёС‡РЅР°СЏ Р·Р°РіСЂСѓР·РєР° СЃС‚СЂР°РЅРёС†С‹
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await ownerWorkspaceApi.getMyPreferences();
        if (cancelled) return;
        setTaskViewMode(p.default_task_view);
        setTaskListRowsPerPage(p.task_list_rows_per_page);
        setDigestDueHours(p.digest_due_within_hours);
        setDigestScope(p.digest_scope);
        setNotifyEmailEnabled(p.notify_email_enabled);
        setNotifyTaskOverdue(p.notify_task_overdue);
        setNotifyTaskDueSoon(p.notify_task_due_soon);
        setNotifyTaskAssigned(p.notify_task_assigned);
        setNotifyTaskComment(p.notify_task_comment);
        setNotifyTaskUpdated(p.notify_task_updated);
        setNotifyContactIncomingMessage(p.notify_contact_incoming_message);
        setNotifyTaskMention(p.notify_task_mention);
      } catch {
        /* РѕСЃС‚Р°СЋС‚СЃСЏ РґРµС„РѕР»С‚С‹ РІ state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipProjectsContactsFilterReload.current) {
      skipProjectsContactsFilterReload.current = false;
      return;
    }
    void loadProjectsAndContacts();
  }, [loadProjectsAndContacts]);

  useEffect(() => {
    if (!projectDialog) return;
    setProjectEditName(projectDialog.name);
    setProjectEditDescription(projectDialog.description ?? '');
    setProjectEditStatus(projectDialog.status || 'active');
  }, [projectDialog]);

  useEffect(() => {
    if (!contactDialog) return;
    setContactEditFullName(contactDialog.full_name);
    setContactEditPhone(contactDialog.phone);
    setContactEditEmail(contactDialog.email ?? '');
    setContactEditCompany(contactDialog.company ?? '');
    setContactEditPosition(contactDialog.position ?? '');
    setContactEditComment(contactDialog.comment ?? '');
    setContactEditSource(contactDialog.source ?? '');
    setContactEditTags(Array.isArray(contactDialog.tags) ? contactDialog.tags.join(', ') : '');
  }, [contactDialog]);

  useEffect(() => {
    void loadDigest();
  }, [loadDigest]);

  useEffect(() => {
    void loadNotifications(80);
  }, [loadNotifications]);

  /** РљР°РЅРѕРЅРёС‡РµСЃРєРёР№ РІС…РѕРґ: `/owner-workspace` Р±РµР· query в†’ `/owner-workspace/projects` (СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ: `?tab=` / `?task=` РѕСЃС‚Р°СЋС‚СЃСЏ). */
  useEffect(() => {
    const p = location.pathname.replace(/\/$/, '') || location.pathname;
    if (p !== '/owner-workspace') return;
    if (searchParams.get('tab') || searchParams.get('task')) return;
    navigate('/owner-workspace/projects', { replace: true });
  }, [location.pathname, searchParams, navigate]);

  useEffect(() => {
    const next = resolveOwnerWorkspaceTab(location.pathname, searchParams);
    if (next !== null) setTab(next);
  }, [location.pathname, searchParams]);

  useEffect(() => {
    if (tab === OW_TAB_NOTIFICATIONS) {
      void loadNotifications(200);
    }
  }, [tab, loadNotifications]);

  useEffect(() => {
    if (tab !== OW_TAB_TASKS) return;
    let cancelled = false;
    void (async () => {
      try {
        const a = await ownerWorkspaceApi.getTasksAnalyticsOverview();
        if (!cancelled) setTasksAnalytics(a);
      } catch {
        if (!cancelled) setTasksAnalytics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const t = searchQuery.trim();
    if (t.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await ownerWorkspaceApi.unifiedSearch(t, 20);
          setSearchResults({ ...r, messages: r.messages ?? [] });
        } catch {
          setSearchResults({ projects: [], contacts: [], tasks: [], messages: [] });
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (tab === OW_TAB_TASKS) {
      loadTasksFiltered();
    }
  }, [tab, loadTasksFiltered]);

  useEffect(() => {
    if (taskViewMode !== 'list') {
      setSelectedTaskIds([]);
    }
  }, [taskViewMode]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await ownerWorkspaceApi.listHistory();
        if (!cancelled) setHistoryLogs(rows);
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёСЃС‚РѕСЂРёСЋ'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const createProject = async () => {
    if (!isWorkspaceFullAccess) {
      setError('Создание проекта доступно только admin / owner.');
      return;
    }
    if (!projectName.trim()) return;
    try {
      await ownerWorkspaceApi.createProject({ name: projectName.trim() });
      setProjectName('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїСЂРѕРµРєС‚'));
    }
  };

  const createContact = async () => {
    if (!isWorkspaceFullAccess && newContactProjectId === '') {
      setError('Для создания контакта выберите проект, к которому он будет привязан.');
      return;
    }
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      await ownerWorkspaceApi.createContact({
        full_name: contactName.trim(),
        phone: contactPhone.trim(),
        project_ids: newContactProjectId === '' ? undefined : [newContactProjectId],
      });
      setContactName('');
      setContactPhone('');
      setNewContactProjectId('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєРѕРЅС‚Р°РєС‚'));
    }
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTask({
        title: taskTitle.trim(),
        priority: taskPriority,
        project_id: newTaskProjectId === '' ? null : newTaskProjectId,
        contact_id: newTaskContactId === '' ? null : newTaskContactId,
        assignee_id: newTaskAssigneeId === '' ? null : newTaskAssigneeId,
        deadline_at: localInputToIso(newTaskDeadline),
      });
      setTaskTitle('');
      setTaskPriority('medium');
      setNewTaskProjectId('');
      setNewTaskContactId('');
      setNewTaskAssigneeId('');
      setNewTaskDeadline('');
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ'));
    }
  };

  const openTaskDialog = async (t: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextTaskFromUrlEffectRef.current = true;
      const params = new URLSearchParams(searchParams);
      params.delete('tab');
      params.delete('task');
      navigate(
        {
          pathname: `/owner-workspace/tasks/${t.id}`,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true }
      );
    }
    setTaskDialog(t);
    setTaskEditTitle(t.title);
    setTaskEditDescription(t.description || '');
    setTaskEditStatus(coerceTaskStatus(String(t.status)));
    setTaskEditPriority(coerceTaskPriority(String(t.priority)));
    setTaskEditDeadline(deadlineToLocalInput(t.deadline_at));
    setTaskEditStartAt(deadlineToLocalInput(t.start_at));
    setTaskEditAttachmentsText(
      Array.isArray(t.attachments) && t.attachments.length > 0 ? JSON.stringify(t.attachments, null, 2) : '[]'
    );
    setTaskEditProjectId(t.project_id ?? '');
    setTaskEditContactId(t.contact_id ?? '');
    setTaskEditAssigneeId(t.assignee_id ?? '');
    setTaskEditTags(Array.isArray(t.tags) ? [...t.tags] : []);
    setTaskEditChecklist(parseChecklistFromTask(t.checklist));
    setNewCommentText('');
    try {
      const cm = await ownerWorkspaceApi.getTaskComments(t.id);
      setTaskComments(cm);
    } catch {
      setTaskComments([]);
    }
    try {
      const h = await ownerWorkspaceApi.listHistory({ entity_type: 'task', entity_id: t.id });
      setTaskDialogHistory(h);
    } catch {
      setTaskDialogHistory([]);
    }
  };

  const openPreviousWorkspaceTask = async () => {
    if (!taskDialog?.previous_task_id) return;
    try {
      const full = await ownerWorkspaceApi.getTask(taskDialog.previous_task_id);
      await openTaskDialog(full);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїСЂРµРґС‹РґСѓС‰СѓСЋ Р·Р°РґР°С‡Сѓ'));
    }
  };

  const taskFormLocked = useMemo(() => {
    if (!taskDialog) return false;
    const terminal = ['completed', 'cancelled'].includes(String(taskDialog.status));
    const reopening = terminal && !['completed', 'cancelled'].includes(taskEditStatus);
    return terminal && !reopening;
  }, [taskDialog, taskEditStatus]);

  const deleteTaskSummary = useMemo(() => {
    if (!deleteTaskConfirm) return [];
    const summary: string[] = [];
    if (deleteTaskConfirm.project_id != null) summary.push('Задача отвязана от проекта только через полное удаление записи.');
    if (deleteTaskConfirm.contact_id != null) summary.push('Связь с контактом исчезнет вместе с задачей.');
    if ((deleteTaskConfirm.linked_message_ids?.length ?? 0) > 0) {
      summary.push(`Будут удалены связи с сообщениями: ${deleteTaskConfirm.linked_message_ids!.length}.`);
    }
    if (deleteTaskConfirm.previous_task_id != null) {
      summary.push('Цепочка повторных/следующих задач потеряет ссылку на предыдущую задачу.');
    }
    if (taskDialog?.id === deleteTaskConfirm.id && taskComments.length > 0) {
      summary.push(`Будут удалены комментарии к задаче: ${taskComments.length}.`);
    }
    if (summary.length === 0) {
      summary.push('Запись будет удалена без возможности восстановления из интерфейса.');
    }
    return summary;
  }, [deleteTaskConfirm, taskComments, taskDialog?.id]);

  const submitDeleteTask = async () => {
    if (!deleteTaskConfirm || !isWorkspaceFullAccess) return;
    try {
      await ownerWorkspaceApi.deleteTask(deleteTaskConfirm.id);
      setDeleteTaskConfirm(null);
      closeTaskDialog();
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р·Р°РґР°С‡Сѓ'));
    }
  };

  const saveTaskDialog = async () => {
    if (!taskDialog) return;
    try {
      if (taskFormLocked) {
        const updated = await ownerWorkspaceApi.updateTask(taskDialog.id, { status: taskEditStatus });
        await loadTasksFiltered();
        void loadDigest();
        void loadNotifications(80);
        await openTaskDialog(updated);
        return;
      }
      let attachmentsPayload: Array<Record<string, unknown>>;
      try {
        const raw = JSON.parse(taskEditAttachmentsText.trim() || '[]');
        attachmentsPayload = Array.isArray(raw) ? raw : [];
      } catch {
        setError('Р’Р»РѕР¶РµРЅРёСЏ: СѓРєР°Р¶РёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ JSON-РјР°СЃСЃРёРІ, РЅР°РїСЂРёРјРµСЂ [{"url":"https://вЂ¦","name":"Р¤Р°Р№Р»"}]');
        return;
      }
      const checklistPayload = taskEditChecklist
        .map((row) => ({ text: row.text.trim(), done: row.done }))
        .filter((row) => row.text.length > 0);
      await ownerWorkspaceApi.updateTask(taskDialog.id, {
        title: taskEditTitle.trim(),
        description: taskEditDescription.trim() || null,
        status: taskEditStatus,
        priority: taskEditPriority,
        deadline_at: localInputToIso(taskEditDeadline),
        start_at: localInputToIso(taskEditStartAt),
        project_id: taskEditProjectId === '' ? null : taskEditProjectId,
        contact_id: taskEditContactId === '' ? null : taskEditContactId,
        assignee_id: taskEditAssigneeId === '' ? null : taskEditAssigneeId,
        tags: taskEditTags.map((x) => x.trim()).filter(Boolean),
        checklist: checklistPayload,
        attachments: attachmentsPayload,
      });
      closeTaskDialog();
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р·Р°РґР°С‡Сѓ'));
    }
  };

  const addComment = async () => {
    if (!taskDialog || !newCommentText.trim()) return;
    try {
      await ownerWorkspaceApi.addTaskComment(taskDialog.id, newCommentText.trim());
      setNewCommentText('');
      const cm = await ownerWorkspaceApi.getTaskComments(taskDialog.id);
      setTaskComments(cm);
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РєРѕРјРјРµРЅС‚Р°СЂРёР№'));
    }
  };

  const submitComplete = async () => {
    if (!completeDialogTask) return;
    try {
      if (completeMode === 'close') {
        await ownerWorkspaceApi.completeTask(completeDialogTask.id, { action: 'close' });
      } else {
        const res = await ownerWorkspaceApi.completeTask(completeDialogTask.id, {
          action: 'close_and_create_next',
          next_task: {
            title: nextTaskTitle.trim() || `РЎР»РµРґСѓСЋС‰РёР№ С€Р°Рі: ${completeDialogTask.title}`,
            description: null,
            project_id: completeDialogTask.project_id,
            contact_id: completeDialogTask.contact_id,
            assignee_id: completeDialogTask.assignee_id,
            priority: completeDialogTask.priority as 'low' | 'medium' | 'high' | 'critical',
          },
        });
        if (res.next_task) {
          await openTaskDialog(res.next_task);
        }
      }
      setCompleteDialogTask(null);
      setNextTaskTitle('');
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РІРµСЂС€РёС‚СЊ Р·Р°РґР°С‡Сѓ'));
    }
  };

  const openProjectDialog = async (p: OwnerWorkspaceProject, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextProjectFromUrlEffectRef.current = true;
      navigate(`/owner-workspace/projects/${p.id}`, { replace: true });
    }
    setProjectDialog(p);
    setSubprojectName('');
    setLinkContactId(null);
    setParticipantToAdd(null);
    setProjectDialogTaskStatus('');
    setProjectDialogTaskSearch('');
    try {
      const taskPage = await ownerWorkspaceApi.listTasks({
        project_id: p.id,
        limit: OWNER_WS_TASKS_FETCH_CAP,
      });
      setProjectDialogTasks(taskPage.items);
    } catch {
      setProjectDialogTasks([]);
    }
  };

  const saveProjectOwner = async (u: User | null) => {
    if (!projectDialog) return;
    try {
      const updated = await ownerWorkspaceApi.updateProject(projectDialog.id, {
        owner_id: u ? u.id : null,
      });
      setProjectDialog(updated);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРјРµРЅРёС‚СЊ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕРіРѕ'));
    }
  };

  const saveProjectDetails = async () => {
    if (!projectDialog) return;
    const name = projectEditName.trim();
    if (!name) {
      setError('РЈРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ РїСЂРѕРµРєС‚Р°');
      return;
    }
    try {
      const updated = await ownerWorkspaceApi.updateProject(projectDialog.id, {
        name,
        description: projectEditDescription.trim() || null,
        status: projectEditStatus as 'active' | 'completed' | 'archived',
      });
      setProjectDialog(updated);
      setError(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕРµРєС‚'));
    }
  };

  const submitUnlinkContactFromProject = async () => {
    if (!unlinkContactConfirm) return;
    try {
      await ownerWorkspaceApi.removeProjectContact(unlinkContactConfirm.projectId, unlinkContactConfirm.contactId);
      if (linkContactId?.id === unlinkContactConfirm.contactId) setLinkContactId(null);
      if (projectDialog?.id === unlinkContactConfirm.projectId) {
        const updated = await ownerWorkspaceApi.getProject(unlinkContactConfirm.projectId);
        setProjectDialog(updated);
      }
      if (contactDialog?.id === unlinkContactConfirm.contactId) {
        const updatedContact = await ownerWorkspaceApi.getContact(unlinkContactConfirm.contactId);
        setContactDialog(updatedContact);
      }
      setUnlinkContactConfirm(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓР±СЂР°С‚СЊ РєРѕРЅС‚Р°РєС‚ РёР· РїСЂРѕРµРєС‚Р°'));
    }
  };

  const requestRemoveContactFromProject = (contactId: number) => {
    if (!projectDialog) return;
    const contact = contacts.find((row) => row.id === contactId);
    const activeTaskCount = projectDialogTasks.filter(
      (task) =>
        task.contact_id === contactId &&
        ['new', 'in_progress', 'waiting'].includes(String(task.status))
    ).length;
    setUnlinkContactConfirm({
      projectId: projectDialog.id,
      projectName: projectDialog.name,
      contactId,
      contactName: contact?.full_name || `#${contactId}`,
      activeTaskCount,
    });
  };

  const submitArchiveProject = async () => {
    if (!archiveProjectConfirm) return;
    try {
      await ownerWorkspaceApi.archiveProject(archiveProjectConfirm.id);
      setArchiveProjectConfirm(null);
      closeProjectDialog();
      await loadTasksFiltered();
      void loadDigest();
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ Р°СЂС…РёРІРёСЂРѕРІР°С‚СЊ РїСЂРѕРµРєС‚'));
    }
  };

  const addProjectParticipantUser = async () => {
    if (!projectDialog || !participantToAdd) return;
    try {
      await ownerWorkspaceApi.addProjectParticipant(
        projectDialog.id,
        participantToAdd.id,
        canChangeParticipantRoles ? newParticipantRole : 'member'
      );
      setParticipantToAdd(null);
      setNewParticipantRole('member');
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°'));
    }
  };

  const patchProjectParticipantRole = async (userId: number, role: OwnerWorkspaceProjectParticipantRole) => {
    if (!projectDialog) return;
    try {
      await ownerWorkspaceApi.patchProjectParticipantRole(projectDialog.id, userId, role);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ СЂРѕР»СЊ СѓС‡Р°СЃС‚РЅРёРєР°'));
    }
  };

  const removeProjectParticipantUser = async (userId: number) => {
    if (!projectDialog) return;
    try {
      await ownerWorkspaceApi.removeProjectParticipant(projectDialog.id, userId);
      setRemoveParticipantConfirm(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°'));
    }
  };

  const requestRemoveProjectParticipantUser = (
    userId: number,
    role: OwnerWorkspaceProjectParticipantRole
  ) => {
    if (!projectDialog) return;
    setRemoveParticipantConfirm({
      projectId: projectDialog.id,
      projectName: projectDialog.name,
      userId,
      userName: userName(userId),
      role,
    });
  };

  const openLinkToTaskDialog = async (m: OwnerWorkspaceMessage) => {
    setLinkTaskDialog({ message: m });
    setLinkTaskSelected(null);
    try {
      const taskPage = await ownerWorkspaceApi.listTasks({
        active_only: true,
        limit: OWNER_WS_TASKS_FETCH_CAP,
        offset: 0,
      });
      setLinkTaskOptions(taskPage.items);
    } catch {
      setLinkTaskOptions([]);
    }
  };

  const submitLinkToTask = async () => {
    if (!linkTaskDialog || !linkTaskSelected) return;
    try {
      await ownerWorkspaceApi.linkMessageToTask(linkTaskDialog.message.id, linkTaskSelected.id);
      setLinkTaskDialog(null);
      setLinkTaskSelected(null);
      if (commsContactId) {
        const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
        setCommsMessages(msgs.slice().reverse());
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРёРІСЏР·Р°С‚СЊ Рє Р·Р°РґР°С‡Рµ'));
    }
  };

  const createSubproject = async () => {
    if (!projectDialog || !subprojectName.trim()) return;
    try {
      await ownerWorkspaceApi.createProject({
        name: subprojectName.trim(),
        parent_project_id: projectDialog.id,
      });
      setSubprojectName('');
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїРѕРґРїСЂРѕРµРєС‚'));
    }
  };

  const refreshProjectDialogAfterHierarchyChange = useCallback(async () => {
    await loadProjectsAndContacts();
    const id = projectDialog?.id;
    if (id == null) return;
    try {
      const updated = await ownerWorkspaceApi.getProject(id);
      setProjectDialog(updated);
    } catch {
      /* РґРёР°Р»РѕРі РјРѕРі Р±С‹С‚СЊ Р·Р°РєСЂС‹С‚ */
    }
  }, [loadProjectsAndContacts, projectDialog?.id]);

  const linkContactToProject = async () => {
    if (!projectDialog || !linkContactId) return;
    try {
      await ownerWorkspaceApi.addProjectContact(projectDialog.id, linkContactId.id);
      setLinkContactId(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
      try {
        const taskPage = await ownerWorkspaceApi.listTasks({
          project_id: projectDialog.id,
          limit: OWNER_WS_TASKS_FETCH_CAP,
          offset: 0,
        });
        setProjectDialogTasks(taskPage.items);
      } catch {
        setProjectDialogTasks([]);
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРёРІСЏР·Р°С‚СЊ РєРѕРЅС‚Р°РєС‚'));
    }
  };

  const openContactDialog = async (c: OwnerWorkspaceContact, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextContactFromUrlEffectRef.current = true;
      navigate(`/owner-workspace/contacts/${c.id}`, { replace: true });
    }
    setContactDialog(c);
    setContactLinkProjectId(null);
    setNewContactMessage('');
    setContactMessageSearch('');
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(c.id);
      setContactMessages(msgs.slice().reverse());
    } catch {
      setContactMessages([]);
    }
    try {
      const trows = await ownerWorkspaceApi.getContactTasks(c.id);
      setContactDialogTasks(trows);
    } catch {
      setContactDialogTasks([]);
    }
  };

  const linkContactToSelectedProject = async () => {
    if (!contactDialog || !contactLinkProjectId) return;
    try {
      await ownerWorkspaceApi.addProjectContact(contactLinkProjectId.id, contactDialog.id);
      setContactLinkProjectId(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getContact(contactDialog.id);
      setContactDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РІ РїСЂРѕРµРєС‚'));
    }
  };

  const requestRemoveContactFromLinkedProject = (projectId: number) => {
    if (!contactDialog) return;
    const project = projects.find((row) => row.id === projectId);
    const activeTaskCount = contactDialogTasks.filter(
      (task) =>
        task.project_id === projectId &&
        ['new', 'in_progress', 'waiting'].includes(String(task.status))
    ).length;
    setUnlinkContactConfirm({
      projectId,
      projectName: project?.name || `#${projectId}`,
      contactId: contactDialog.id,
      contactName: contactDialog.full_name,
      activeTaskCount,
    });
  };

  const sendContactMessage = async () => {
    if (!contactDialog || !newContactMessage.trim()) return;
    try {
      await ownerWorkspaceApi.createMessage({
        contact_id: contactDialog.id,
        text: newContactMessage.trim(),
        direction: 'outgoing',
      });
      setNewContactMessage('');
      const msgs = await ownerWorkspaceApi.getContactMessages(contactDialog.id);
      setContactMessages(msgs.slice().reverse());
      await loadMeta();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ'));
    }
  };

  const saveContactDetails = async () => {
    if (!contactDialog) return;
    const fn = contactEditFullName.trim();
    const ph = contactEditPhone.trim();
    if (!fn || !ph) {
      setError('РЈРєР°Р¶РёС‚Рµ Р¤РРћ Рё С‚РµР»РµС„РѕРЅ');
      return;
    }
    try {
      const tagParts = contactEditTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await ownerWorkspaceApi.updateContact(contactDialog.id, {
        full_name: fn,
        phone: ph,
        email: contactEditEmail.trim() || null,
        company: contactEditCompany.trim() || null,
        position: contactEditPosition.trim() || null,
        comment: contactEditComment.trim() || null,
        source: contactEditSource.trim() || null,
        tags: tagParts,
      });
      setContactDialog(updated);
      setError(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєРѕРЅС‚Р°РєС‚'));
    }
  };

  const selectCommsContact = async (contactId: number) => {
    setCommsContactId(contactId);
    setCommsThreadSearch('');
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(contactId);
      setCommsMessages(msgs.slice().reverse());
    } catch {
      setCommsMessages([]);
    }
    try {
      const conv = await ownerWorkspaceApi.listConversations();
      setConversations(conv);
    } catch {
      /* СЃРїРёСЃРѕРє РґРёР°Р»РѕРіРѕРІ вЂ” РІС‚РѕСЂРѕСЃС‚РµРїРµРЅРЅРѕ */
    }
  };

  const openCommsContactCard = async () => {
    if (commsContactId == null) return;
    const fromCat =
      contactsCatalogSorted.find((c) => c.id === commsContactId) || contacts.find((c) => c.id === commsContactId);
    if (fromCat) {
      await openContactDialog(fromCat);
      return;
    }
    try {
      const c = await ownerWorkspaceApi.getContact(commsContactId);
      await openContactDialog(c);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РєР°СЂС‚РѕС‡РєСѓ РєРѕРЅС‚Р°РєС‚Р°'));
    }
  };

  const submitMessageTask = async () => {
    if (!messageTaskDialog || !messageTaskTitle.trim()) return;
    const msgContactId = messageTaskDialog.message.contact_id;
    try {
      await ownerWorkspaceApi.createTaskFromMessage(messageTaskDialog.message.id, {
        title: messageTaskTitle.trim(),
        description: messageTaskDialog.message.text,
      });
      setMessageTaskDialog(null);
      setMessageTaskTitle('');
      await loadTasksFiltered();
      void loadDigest();
      if (commsContactId != null && msgContactId === commsContactId) {
        try {
          const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
          setCommsMessages(msgs.slice().reverse());
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ РёР· СЃРѕРѕР±С‰РµРЅРёСЏ'));
    }
  };

  const handleKanbanDrop = async (taskId: number, newStatus: OwnerWorkspaceTaskStatus) => {
    try {
      await ownerWorkspaceApi.updateTask(taskId, { status: newStatus });
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ'));
    }
  };

  const applyBulkTaskUpdate = async () => {
    if (selectedTaskIds.length === 0) return;
    const hasStatus = Boolean(bulkStatus);
    const hasAssigneeClear = bulkAssigneeMode === 'clear';
    const hasAssigneeSet = bulkAssigneeMode === 'set' && bulkAssigneeUserId !== '';
    const hasPriority = Boolean(bulkPriority);
    if (!hasStatus && !hasAssigneeClear && !hasAssigneeSet && !hasPriority) {
      setError('Р’С‹Р±РµСЂРёС‚Рµ СЃС‚Р°С‚СѓСЃ, РёСЃРїРѕР»РЅРёС‚РµР»СЏ Рё/РёР»Рё РїСЂРёРѕСЂРёС‚РµС‚');
      return;
    }
    const payload: {
      task_ids: number[];
      status?: OwnerWorkspaceTaskStatus;
      assignee_id?: number | null;
      priority?: OwnerWorkspaceTaskPriority;
    } = { task_ids: selectedTaskIds };
    if (hasStatus) payload.status = bulkStatus as OwnerWorkspaceTaskStatus;
    if (hasAssigneeClear) payload.assignee_id = null;
    if (hasAssigneeSet) payload.assignee_id = bulkAssigneeUserId as number;
    if (hasPriority) payload.priority = bulkPriority as OwnerWorkspaceTaskPriority;
    try {
      const res = await ownerWorkspaceApi.bulkUpdateTasks(payload);
      setSelectedTaskIds([]);
      setBulkStatus('');
      setBulkPriority('');
      setBulkAssigneeMode('skip');
      setBulkAssigneeUserId('');
      await loadTasksFiltered();
      void loadDigest();
      setError(null);
      setMaxSyncResult(`РњР°СЃСЃРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ: РёР·РјРµРЅРµРЅРѕ Р·Р°РґР°С‡ вЂ” ${res.updated}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РњР°СЃСЃРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РЅРµ СѓРґР°Р»РѕСЃСЊ'));
    }
  };

  const syncMaxIntoWorkspace = async () => {
    try {
      const r = await ownerWorkspaceApi.syncMessagesFromMax(800);
      setMaxSyncResult(`РРјРїРѕСЂС‚ MAX: РґРѕР±Р°РІР»РµРЅРѕ ${r.imported}, РїСЂРѕРїСѓС‰РµРЅРѕ ${r.skipped} (РЅРµС‚ С‚РµР»РµС„РѕРЅР° / РєРѕРЅС‚Р°РєС‚Р° / РґСѓР±Р»РёРєР°С‚).`);
      await loadMeta();
      if (commsContactId) {
        const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
        setCommsMessages(msgs.slice().reverse());
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'РРјРїРѕСЂС‚ РёР· MAX РЅРµ СѓРґР°Р»СЃСЏ'));
    }
  };

  const saveWorkspaceSettings = async () => {
    setSettingsSaving(true);
    try {
      await ownerWorkspaceApi.patchMyPreferences({
        default_task_view: taskViewMode,
        task_list_rows_per_page: taskListRowsPerPage,
        digest_due_within_hours: digestDueHours,
        digest_scope: digestScope,
        notify_email_enabled: notifyEmailEnabled,
        notify_task_overdue: notifyTaskOverdue,
        notify_task_due_soon: notifyTaskDueSoon,
        notify_task_assigned: notifyTaskAssigned,
        notify_task_comment: notifyTaskComment,
        notify_task_updated: notifyTaskUpdated,
        notify_contact_incoming_message: notifyContactIncomingMessage,
        notify_task_mention: notifyTaskMention,
      });
      setError(null);
      setMaxSyncResult('РќР°СЃС‚СЂРѕР№РєРё Р·Р°РґР°С‡РЅРёРєР° СЃРѕС…СЂР°РЅРµРЅС‹ РІ РІР°С€РµРј РїСЂРѕС„РёР»Рµ.');
      void loadDigest();
      if (tab === OW_TAB_TASKS) void loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveWorkspaceTaskConfig = async () => {
    if (!taskConfigDraft) return;
    if (!taskConfigDraft.statuses.some((item) => item.enabled !== false)) {
      setError('РќСѓР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РІРёРґРёРјС‹Р№ СЃС‚Р°С‚СѓСЃ Р·Р°РґР°С‡.');
      return;
    }
    if (!taskConfigDraft.priorities.some((item) => item.enabled !== false)) {
      setError('РќСѓР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РІРёРґРёРјС‹Р№ РїСЂРёРѕСЂРёС‚РµС‚ Р·Р°РґР°С‡.');
      return;
    }
    setTaskConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceTaskConfig(taskConfigDraft);
      setTaskConfig(saved);
      setTaskConfigDraft(saved);
      setError(null);
      setMaxSyncResult('РЎРёСЃС‚РµРјРЅС‹Рµ РЅР°Р·РІР°РЅРёСЏ СЃС‚Р°С‚СѓСЃРѕРІ Рё РїСЂРёРѕСЂРёС‚РµС‚РѕРІ СЃРѕС…СЂР°РЅРµРЅС‹.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЃРёСЃС‚РµРјРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё Р·Р°РґР°С‡'));
    } finally {
      setTaskConfigSaving(false);
    }
  };

  const handleWorkspaceTabChange = (_: React.SyntheticEvent, v: number) => {
    if (v !== OW_TAB_TASKS) {
      setTaskDialog(null);
    }
    setTab(v);
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (v !== OW_TAB_TASKS) {
      params.delete('task');
    }
    const pathname = ownerWorkspaceTabPathname(v);
    navigate(
      { pathname, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true }
    );
  };

  const drillDownToAssigneeTasks = (
    assigneeId: number | null,
    opts?: { overdueOnly?: boolean; projectId?: number | null }
  ) => {
    setTaskAssigneeFilter(assigneeId == null ? '' : assigneeId);
    setTaskActiveOnly(true);
    setTaskOverdueOnly(Boolean(opts?.overdueOnly));
    setTaskProjectFilter(opts?.projectId == null ? '' : opts.projectId);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const drillDownToProjectTasks = (projectId: number, opts?: { overdueOnly?: boolean }) => {
    setTaskProjectFilter(projectId);
    setTaskAssigneeFilter('');
    setTaskActiveOnly(true);
    setTaskOverdueOnly(Boolean(opts?.overdueOnly));
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const openContactQuickComms = async (contactId: number) => {
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await loadMeta();
    await selectCommsContact(contactId);
  };

  const reviewArchiveProjectTasks = (projectId: number, overdueOnly = false) => {
    setArchiveProjectConfirm(null);
    closeProjectDialog();
    drillDownToProjectTasks(projectId, { overdueOnly });
  };

  /** РџРµСЂРµС…РѕРґ РЅР° РІРєР»Р°РґРєСѓ В«Р—Р°РґР°С‡РёВ» СЃ С„РёР»СЊС‚СЂРѕРј РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ (state + URL СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ СЃ С‚Р°Р±РѕРј). */
  const openContactQuickTasks = (contactId: number) => {
    setTaskContactFilter(contactId);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const openSearchHitProject = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_PROJECTS);
    await loadProjectsAndContacts();
    try {
      const p = await ownerWorkspaceApi.getProject(id);
      openProjectDialog(p);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РџСЂРѕРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ'));
    }
  };

  const openSearchHitContact = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_CONTACTS);
    await loadProjectsAndContacts();
    try {
      const c = await ownerWorkspaceApi.getContact(id);
      await openContactDialog(c);
    } catch (e: unknown) {
      setError(extractApiError(e, 'РљРѕРЅС‚Р°РєС‚ РЅРµ РЅР°Р№РґРµРЅ'));
    }
  };

  const openSearchHitTask = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    skipNextTaskFromUrlEffectRef.current = true;
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    params.delete('task');
    navigate(
      { pathname: `/owner-workspace/tasks/${id}`, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true }
    );
    await loadTasksFiltered();
    try {
      const full = await ownerWorkspaceApi.getTask(id);
      await openTaskDialog(full, { syncUrl: false });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Р—Р°РґР°С‡Р° РЅРµ РЅР°Р№РґРµРЅР°'));
    }
  };

  const openSearchHitMessage = async (contactId: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await selectCommsContact(contactId);
  };

  const openNotificationComms = async (contactId: number) => {
    setNotifAnchor(null);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await loadMeta();
    await selectCommsContact(contactId);
  };

  openProjectDialogRef.current = openProjectDialog;
  openContactDialogRef.current = openContactDialog;
  openTaskDialogRef.current = openTaskDialog;
  loadTasksFilteredRef.current = loadTasksFiltered;

  useEffect(() => {
    if (entityRoute.kind !== 'project' || !entityRoute.id) return undefined;
    if (skipNextProjectFromUrlEffectRef.current) {
      skipNextProjectFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const full = await ownerWorkspaceApi.getProject(entityRoute.id!);
        if (cancelled) return;
        await openProjectDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Проект не найден'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.kind, entityRoute.id]);

  useEffect(() => {
    if (entityRoute.kind !== 'contact' || !entityRoute.id) return undefined;
    if (skipNextContactFromUrlEffectRef.current) {
      skipNextContactFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const full = await ownerWorkspaceApi.getContact(entityRoute.id!);
        if (cancelled) return;
        await openContactDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Контакт не найден'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.kind, entityRoute.id]);

  useEffect(() => {
    const tidRaw = entityRoute.kind === 'task' && entityRoute.id ? String(entityRoute.id) : searchParams.get('task');
    const tid = tidRaw ? parseInt(tidRaw, 10) : NaN;
    if (!Number.isFinite(tid) || tid < 1) return undefined;
    if (skipNextTaskFromUrlEffectRef.current) {
      skipNextTaskFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const nextTab = resolveOwnerWorkspaceTab(location.pathname, searchParams);
        if (nextTab === OW_TAB_TASKS) {
          await loadTasksFilteredRef.current();
        }
        const full = await ownerWorkspaceApi.getTask(tid);
        if (cancelled) return;
        await openTaskDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Р—Р°РґР°С‡Р° РЅРµ РЅР°Р№РґРµРЅР°'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.id, entityRoute.kind, location.pathname, searchParams]);

  const userOptions = useMemo(
    () => users.filter((u) => ['admin', 'owner', 'sales', 'trainer'].includes(u.role)),
    [users]
  );

  const userName = useCallback(
    (userId: number | null | undefined) => {
      if (userId == null) return 'вЂ”';
      const u = users.find((x) => x.id === userId);
      return u?.full_name || `#${userId}`;
    },
    [users]
  );

  const canManageProjectTeam = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    if (projectDialog.owner_id === user.id) return true;
    return projectDialog.participant_roles?.[String(user.id)] === 'manager';
  }, [projectDialog, user?.id, isWorkspaceFullAccess]);

  const canChangeParticipantRoles = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    return projectDialog.owner_id === user.id;
  }, [projectDialog, user?.id, isWorkspaceFullAccess]);

  const canEditProjectContentUi = useCallback(
    (projectId: number | null | undefined) => {
      if (projectId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const project =
        (projectDialog?.id === projectId ? projectDialog : null) ??
        projectsCatalog.find((item) => item.id === projectId) ??
        null;
      if (!project) return false;
      if (project.owner_id === user.id) return true;
      const rawRole = project.participant_roles?.[String(user.id)];
      return rawRole === 'member' || rawRole === 'manager';
    },
    [isWorkspaceFullAccess, projectDialog, projectsCatalog, user?.id]
  );

  const canEditProjectDialogContent = useMemo(
    () => (projectDialog ? canEditProjectContentUi(projectDialog.id) : false),
    [canEditProjectContentUi, projectDialog]
  );

  const canEditContactContentUi = useCallback(
    (contactId: number | null | undefined) => {
      if (contactId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const contact =
        (contactDialog?.id === contactId ? contactDialog : null) ??
        contactsCatalog.find((item) => item.id === contactId) ??
        contacts.find((item) => item.id === contactId) ??
        null;
      if (!contact) return true;
      const linkedProjectIds = Array.isArray(contact.linked_project_ids) ? contact.linked_project_ids : [];
      if (linkedProjectIds.length === 0) return true;
      if (linkedProjectIds.some((projectId) => canEditProjectContentUi(projectId))) {
        return true;
      }
      if (contactDialog?.id === contactId) {
        return contactDialogTasks.some((task) => task.creator_id === user.id || task.assignee_id === user.id);
      }
      return false;
    },
    [canEditProjectContentUi, contactDialog, contactDialogTasks, contacts, contactsCatalog, isWorkspaceFullAccess, user?.id]
  );

  const canEditContactDialogContent = useMemo(() => {
    if (!contactDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    return canEditContactContentUi(contactDialog.id);
  }, [canEditContactContentUi, contactDialog, isWorkspaceFullAccess, user?.id]);

  const canEditTaskDialogContent = useMemo(() => {
    if (!taskDialog) return false;
    if (isWorkspaceFullAccess) return true;
    if (taskDialog.project_id != null) {
      return canEditProjectContentUi(taskDialog.project_id);
    }
    return true;
  }, [canEditProjectContentUi, isWorkspaceFullAccess, taskDialog]);

  const taskDialogReadOnly = taskFormLocked || !canEditTaskDialogContent;

  const canCreateNewTaskInSelectedContext = useMemo(() => {
    const selectedProjectOk =
      newTaskProjectId === '' ? true : canEditProjectContentUi(Number(newTaskProjectId));
    const selectedContactOk =
      newTaskContactId === '' ? true : canEditContactContentUi(Number(newTaskContactId));
    return selectedProjectOk && selectedContactOk;
  }, [canEditContactContentUi, canEditProjectContentUi, newTaskContactId, newTaskProjectId]);

  const canCreateTaskFromMessageUi = useMemo(() => {
    if (!messageTaskDialog) return false;
    return canEditContactContentUi(messageTaskDialog.message.contact_id);
  }, [canEditContactContentUi, messageTaskDialog]);

  const canMutateTaskUi = useCallback(
    (task: OwnerWorkspaceTask | null | undefined) => {
      if (!task) return false;
      if (isWorkspaceFullAccess) return true;
      if (task.project_id != null) {
        return canEditProjectContentUi(task.project_id);
      }
      return true;
    },
    [canEditProjectContentUi, isWorkspaceFullAccess]
  );

  const editableLinkTaskOptions = useMemo(
    () => linkTaskOptions.filter((task) => canMutateTaskUi(task)),
    [canMutateTaskUi, linkTaskOptions]
  );

  const assigneeAnalyticsRows = useMemo<OwnerWorkspaceAssigneeAnalyticsRow[]>(() => {
    const now = Date.now();
    const buckets = new Map<
      string,
      {
        assigneeId: number | null;
        assigneeName: string;
        activeCount: number;
        overdueCount: number;
        completedCount: number;
        completionDays: number[];
      }
    >();

    for (const task of tasks) {
      const assigneeId = task.assignee_id ?? null;
      const key = assigneeId == null ? 'unassigned' : String(assigneeId);
      if (!buckets.has(key)) {
        buckets.set(key, {
          assigneeId,
          assigneeName: assigneeId == null ? 'Без исполнителя' : userName(assigneeId),
          activeCount: 0,
          overdueCount: 0,
          completedCount: 0,
          completionDays: [],
        });
      }
      const bucket = buckets.get(key)!;
      const status = String(task.status);
      const isDone = status === 'completed';
      const isCancelled = status === 'cancelled';
      if (!isDone && !isCancelled) {
        bucket.activeCount += 1;
        if (task.deadline_at && new Date(task.deadline_at).getTime() < now) {
          bucket.overdueCount += 1;
        }
      }
      if (isDone) {
        bucket.completedCount += 1;
        if (task.created_at && task.completed_at) {
          const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            bucket.completionDays.push(ms / 86400000);
          }
        }
      }
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        assigneeId: bucket.assigneeId,
        assigneeName: bucket.assigneeName,
        activeCount: bucket.activeCount,
        overdueCount: bucket.overdueCount,
        completedCount: bucket.completedCount,
        avgDaysToComplete:
          bucket.completionDays.length > 0
            ? Math.round((bucket.completionDays.reduce((sum, value) => sum + value, 0) / bucket.completionDays.length) * 10) / 10
            : null,
      }))
      .filter((row) => row.activeCount > 0 || row.overdueCount > 0 || row.completedCount > 0)
      .sort((a, b) => {
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return a.assigneeName.localeCompare(b.assigneeName, 'ru');
      });
  }, [tasks, userName]);

  const assigneeAnalyticsSummary = useMemo(
    () => ({
      assigneesWithActiveTasks: assigneeAnalyticsRows.filter((row) => row.activeCount > 0).length,
      assigneesWithOverdueTasks: assigneeAnalyticsRows.filter((row) => row.overdueCount > 0).length,
      overloadedAssignees: assigneeAnalyticsRows.filter((row) => row.activeCount >= 5).length,
    }),
    [assigneeAnalyticsRows]
  );

  const assigneeAttentionRows = useMemo(
    () =>
      assigneeAnalyticsRows
        .filter((row) => row.overdueCount > 0 || row.activeCount >= 5)
        .sort((a, b) => {
          if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
          if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
          return a.assigneeName.localeCompare(b.assigneeName, 'ru');
        })
        .slice(0, 5),
    [assigneeAnalyticsRows]
  );

  const projectParticipantAnalyticsRows = useMemo<OwnerWorkspaceAssigneeAnalyticsRow[]>(() => {
    if (!projectDialog) return [];
    const now = Date.now();
    const relevantIds = new Set<number>();
    if (projectDialog.owner_id != null) relevantIds.add(projectDialog.owner_id);
    for (const pid of projectDialog.participants || []) relevantIds.add(pid);

    const buckets = new Map<
      string,
      {
        assigneeId: number | null;
        assigneeName: string;
        activeCount: number;
        overdueCount: number;
        completedCount: number;
        completionDays: number[];
      }
    >();

    const ensureBucket = (assigneeId: number | null) => {
      const key = assigneeId == null ? 'unassigned' : String(assigneeId);
      if (!buckets.has(key)) {
        buckets.set(key, {
          assigneeId,
          assigneeName: assigneeId == null ? 'Без исполнителя' : userName(assigneeId),
          activeCount: 0,
          overdueCount: 0,
          completedCount: 0,
          completionDays: [],
        });
      }
      return buckets.get(key)!;
    };

    for (const assigneeId of relevantIds) ensureBucket(assigneeId);

    for (const task of projectDialogTasks) {
      const assigneeId = task.assignee_id ?? null;
      const bucket = ensureBucket(assigneeId);
      const status = String(task.status);
      const isDone = status === 'completed';
      const isCancelled = status === 'cancelled';
      if (!isDone && !isCancelled) {
        bucket.activeCount += 1;
        if (task.deadline_at && new Date(task.deadline_at).getTime() < now) {
          bucket.overdueCount += 1;
        }
      }
      if (isDone) {
        bucket.completedCount += 1;
        if (task.created_at && task.completed_at) {
          const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            bucket.completionDays.push(ms / 86400000);
          }
        }
      }
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        assigneeId: bucket.assigneeId,
        assigneeName: bucket.assigneeName,
        activeCount: bucket.activeCount,
        overdueCount: bucket.overdueCount,
        completedCount: bucket.completedCount,
        avgDaysToComplete:
          bucket.completionDays.length > 0
            ? Math.round((bucket.completionDays.reduce((sum, value) => sum + value, 0) / bucket.completionDays.length) * 10) / 10
            : null,
      }))
      .filter((row) => row.activeCount > 0 || row.overdueCount > 0 || row.completedCount > 0)
      .sort((a, b) => {
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return a.assigneeName.localeCompare(b.assigneeName, 'ru');
      });
  }, [projectDialog, projectDialogTasks, userName]);

  const topOverdueProjects = useMemo(
    () =>
      [...projects]
        .filter((project) => (project.overdue_tasks_count ?? 0) > 0)
        .sort((a, b) => {
          const overdueDiff = (b.overdue_tasks_count ?? 0) - (a.overdue_tasks_count ?? 0);
          if (overdueDiff !== 0) return overdueDiff;
          return (b.active_tasks_count ?? 0) - (a.active_tasks_count ?? 0);
        })
        .slice(0, 6),
    [projects]
  );

  const projectsCatalogSorted = useMemo(
    () => [...projectsCatalog].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [projectsCatalog]
  );

  const contactsCatalogSorted = useMemo(
    () => [...contactsCatalog].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    [contactsCatalog]
  );

  const contactListTagOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of contactsCatalog) {
      for (const t of c.tags || []) {
        const x = String(t).trim();
        if (x) s.add(x);
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [contactsCatalog]);

  const projectDialogLinkedContacts = useMemo(() => {
    if (!projectDialog) return [];
    return contactsCatalogSorted.filter((c) => c.linked_project_ids.includes(projectDialog.id));
  }, [contactsCatalogSorted, projectDialog]);

  const subprojectTreeRooted = useMemo(() => {
    if (!projectDialog) return [];
    const m = buildOwnerWsProjectChildrenByParent(projectsCatalog);
    return buildOwnerWsSubprojectTreeAt(projectDialog.id, m);
  }, [projectDialog, projectsCatalog]);

  const contactDialogLinkedProjects = useMemo(() => {
    if (!contactDialog?.linked_project_ids?.length) return [];
    const ids = new Set(contactDialog.linked_project_ids);
    return projectsCatalogSorted.filter((p) => ids.has(p.id));
  }, [contactDialog, projectsCatalogSorted]);

  const contactDialogTasksDone = useMemo(
    () => contactDialogTasks.filter((t) => ['completed', 'cancelled'].includes(String(t.status))),
    [contactDialogTasks]
  );
  const contactDialogTasksActive = useMemo(
    () => contactDialogTasks.filter((t) => !['completed', 'cancelled'].includes(String(t.status))),
    [contactDialogTasks]
  );

  const projectDialogTasksFiltered = useMemo(() => {
    let rows = projectDialogTasks;
    if (projectDialogTaskStatus) {
      rows = rows.filter((t) => String(t.status) === projectDialogTaskStatus);
    }
    const q = projectDialogTaskSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q)
      );
    }
    return rows;
  }, [projectDialogTasks, projectDialogTaskStatus, projectDialogTaskSearch]);

  const contactMessagesFiltered = useMemo(() => {
    const q = contactMessageSearch.trim().toLowerCase();
    if (!q) return contactMessages;
    return contactMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
  }, [contactMessages, contactMessageSearch]);

  const conversationsFiltered = useMemo(() => {
    const q = commsDialogSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.last_message_text || '').toLowerCase().includes(q)
    );
  }, [conversations, commsDialogSearch]);

  const commsUnreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + Math.max(0, c.unread_count || 0), 0),
    [conversations]
  );

  const commsMessagesFiltered = useMemo(() => {
    const q = commsThreadSearch.trim().toLowerCase();
    if (!q) return commsMessages;
    return commsMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
  }, [commsMessages, commsThreadSearch]);

  const commsSelectedContact = useMemo(() => {
    if (commsContactId == null) return null;
    return (
      contactsCatalogSorted.find((c) => c.id === commsContactId) || contacts.find((c) => c.id === commsContactId) || null
    );
  }, [commsContactId, contactsCatalogSorted, contacts]);

  const tasksByDeadlineDay = useMemo(() => {
    const map = new Map<string, OwnerWorkspaceTask[]>();
    for (const t of tasks) {
      if (!t.deadline_at) continue;
      const key = format(new Date(t.deadline_at), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  type TaskCardOpts = {
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
    draggable?: boolean;
  };

  const renderTaskCard = (t: OwnerWorkspaceTask, opts?: TaskCardOpts) => {
    const compact = taskViewMode === 'kanban' || taskViewMode === 'calendar';
    return (
      <Card
        key={t.id}
        draggable={Boolean(opts?.draggable)}
        onDragStart={(e) => {
          if (!opts?.draggable) return;
          e.dataTransfer.setData('text/plain', String(t.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        sx={{
          borderLeft: isTaskOverdue(t) ? '4px solid' : undefined,
          borderColor: isTaskOverdue(t) ? 'error.main' : undefined,
          mb: taskViewMode === 'kanban' ? 1 : 0,
          cursor: opts?.draggable ? 'grab' : undefined,
        }}
      >
        <CardContent sx={{ py: compact ? 1.5 : 2, '&:last-child': { pb: compact ? 1.5 : 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', gap: 1, minWidth: 0, flex: 1 }}>
              {opts?.selectable && (
                <Checkbox
                  size="small"
                  checked={Boolean(opts.selected)}
                  onChange={() => opts.onToggleSelect?.()}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ py: 0, alignSelf: 'flex-start' }}
                />
              )}
              <Box sx={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openTaskDialog(t)}>
                <Typography variant={compact ? 'body2' : 'subtitle1'}>{t.title}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={statusLabels[t.status] || t.status} />
                  <Chip
                    size="small"
                    label={priorityLabels[t.priority] || t.priority}
                    color={t.priority === 'critical' ? 'error' : t.priority === 'high' ? 'warning' : 'default'}
                  />
                  {t.assignee_id != null && (
                    <Chip size="small" variant="outlined" label={userName(t.assignee_id)} />
                  )}
                  {t.deadline_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={new Date(t.deadline_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      color={isTaskOverdue(t) ? 'error' : 'default'}
                    />
                  )}
                  {t.project_id && <Chip size="small" label={`РџСЂРѕРµРєС‚ #${t.project_id}`} variant="outlined" />}
                  {t.contact_id && <Chip size="small" label={`РљРѕРЅС‚Р°РєС‚ #${t.contact_id}`} variant="outlined" />}
                  {(t.tags || []).slice(0, 4).map((tag, ti) => (
                    <Chip key={`${t.id}-tag-${ti}`} size="small" variant="outlined" color="primary" label={tag} />
                  ))}
                  {!compact && t.updated_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`РћР±РЅ. ${new Date(t.updated_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`}
                    />
                  )}
                </Stack>
              </Box>
            </Box>
            {t.status !== 'completed' && t.status !== 'cancelled' && (
              <Button
                size="small"
                variant="outlined"
                disabled={!canMutateTaskUi(t)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCompleteDialogTask(t)}
              >
                Р—Р°РІРµСЂС€РёС‚СЊвЂ¦
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  const WEEKDAYS_SHORT = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'];

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h4" sx={{ flex: '1 1 auto' }}>
          Owner: Р·Р°РґР°С‡РЅРёРє
        </Typography>
        <IconButton
          color="default"
          aria-label="РЈРІРµРґРѕРјР»РµРЅРёСЏ РїРѕ РґРµРґР»Р°Р№РЅР°Рј"
          onClick={(e) => {
            setNotifAnchor(e.currentTarget);
            void loadNotifications(80);
          }}
        >
          <Badge
            color="error"
            badgeContent={notifEnvelope?.unread_count || 0}
            max={99}
            invisible={!notifEnvelope || notifEnvelope.unread_count < 1}
          >
            <NotificationsIcon />
          </Badge>
        </IconButton>
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => {
            setSearchOpen(true);
            setSearchQuery('');
            setSearchResults(null);
          }}
        >
          РџРѕРёСЃРє
        </Button>
      </Box>
      <Menu
        anchorEl={notifAnchor}
        open={Boolean(notifAnchor)}
        onClose={() => setNotifAnchor(null)}
        PaperProps={{ sx: { maxWidth: 420, maxHeight: 480 } }}
      >
        {(notifEnvelope?.items || []).length === 0 ? (
          <MenuItem disabled>РќРµС‚ СѓРІРµРґРѕРјР»РµРЅРёР№</MenuItem>
        ) : (
          (notifEnvelope?.items || []).map((n) => (
            <MenuItem
              key={n.id}
              dense
              onClick={() => {
                void (async () => {
                  try {
                    if (!n.read_at) {
                      await ownerWorkspaceApi.markNotificationRead(n.id);
                    }
                    setNotifAnchor(null);
                    void loadNotifications(80);
                    if (n.task_id != null) {
                      await openSearchHitTask(n.task_id);
                    } else if (n.contact_id != null) {
                      await openNotificationComms(n.contact_id);
                    }
                  } catch (err: unknown) {
                    setError(extractApiError(err, 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ'));
                  }
                })();
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      label={OWNER_WS_NOTIF_KIND_LABELS[n.kind] || n.kind}
                      sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
                    />
                    <Typography component="span" variant="body2" fontWeight={n.read_at ? 400 : 600}>
                      {n.title}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <>
                    {n.body}
                    {n.read_at ? '' : ' В· РЅРµРїСЂРѕС‡РёС‚Р°РЅРѕ'}
                  </>
                }
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        РџСЂРѕРµРєС‚С‹ (СѓС‡Р°СЃС‚РЅРёРєРё), РєРѕРЅС‚Р°РєС‚С‹, Р·Р°РґР°С‡Рё вЂ” СЃРїРёСЃРѕРє, РєР°РЅР±Р°РЅ (РІ С‚.С‡. РѕС‚РґРµР»СЊРЅРѕ В«Р’С‹РїРѕР»РЅРµРЅРѕВ» / В«РћС‚РјРµРЅРµРЅРѕВ»), РєР°Р»РµРЅРґР°СЂСЊ,
        РјР°СЃСЃРѕРІС‹Рµ РґРµР№СЃС‚РІРёСЏ; РµРґРёРЅС‹Р№ РїРѕРёСЃРє; СЃРІРѕРґРєР° РїРѕ РґРµРґР»Р°Р№РЅР°Рј; РєРѕРјРјСѓРЅРёРєР°С†РёРё Рё MAX (СЂСѓС‡РЅРѕР№ РёРјРїРѕСЂС‚ + РѕРїС†РёРѕРЅР°Р»СЊРЅС‹Р№
        Р°РІС‚РѕСЃРёРЅРє РЅР° СЃРµСЂРІРµСЂРµ: OWNER_WORKSPACE_AUTO_SYNC_MAX=1).
      </Typography>
      {isLimitedWorkspaceUser && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Режим ограниченного доступа: вам доступны только ваши проекты, связанные контакты и собственные задачи. Создание новых
          контактов требует явной привязки к доступному проекту.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {maxSyncResult && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMaxSyncResult(null)}>
          {maxSyncResult}
        </Alert>
      )}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1.25}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Typography variant="subtitle2">Ваш доступ</Typography>
              <Chip
                size="small"
                color={isWorkspaceFullAccess ? 'primary' : 'default'}
                label={`Глобальная роль: ${currentWorkspaceRoleLabel}`}
              />
              <Chip
                size="small"
                variant={isWorkspaceFullAccess ? 'filled' : 'outlined'}
                color={isWorkspaceFullAccess ? 'success' : 'warning'}
                label={isWorkspaceFullAccess ? 'Полный доступ' : 'Ограниченный доступ'}
              />
            </Stack>
            <Stack spacing={0.5}>
              {currentWorkspaceAccessSummary.map((item) => (
                <Typography key={item} variant="body2" color="text.secondary">
                  • {item}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} flexWrap="wrap">
            <Typography variant="subtitle2">РЎРІРѕРґРєР° РїРѕ РґРµРґР»Р°Р№РЅР°Рј</Typography>
            <ToggleButtonGroup
              size="small"
              value={digestScope}
              exclusive
              onChange={(_, v) => {
                if (v != null) setDigestScope(v);
              }}
            >
              <ToggleButton value="all">Р’СЃРµ Р·Р°РґР°С‡Рё</ToggleButton>
              <ToggleButton value="mine">РўРѕР»СЊРєРѕ РјРѕРё</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              select
              size="small"
              label="РџСЂРѕРµРєС‚"
              sx={{ minWidth: 200 }}
              value={digestProjectFilter === '' ? '' : String(digestProjectFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setDigestProjectFilter(v === '' ? '' : Number(v));
              }}
            >
              <MenuItem value="">Р’СЃРµ РїСЂРѕРµРєС‚С‹</MenuItem>
              {projectsCatalogSorted.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Р“РѕСЂРёР·РѕРЅС‚"
              sx={{ minWidth: 140 }}
              value={String(digestDueHours)}
              onChange={(e) => setDigestDueHours(Number(e.target.value))}
            >
              <MenuItem value="24">24 С‡</MenuItem>
              <MenuItem value="48">48 С‡</MenuItem>
              <MenuItem value="72">72 С‡</MenuItem>
              <MenuItem value="168">7 РґРЅРµР№</MenuItem>
            </TextField>
            {digestScope === 'mine' && user?.id == null && (
              <Typography variant="caption" color="text.secondary">
                Р’РѕР№РґРёС‚Рµ, С‡С‚РѕР±С‹ С„РёР»СЊС‚СЂ В«РўРѕР»СЊРєРѕ РјРѕРёВ» СѓС‡РёС‚С‹РІР°Р» РІР°С€РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
      {digest && digest.overdue_count > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            РџСЂРѕСЃСЂРѕС‡РµРЅРЅС‹С… Р°РєС‚РёРІРЅС‹С… Р·Р°РґР°С‡: {digest.overdue_count}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {digest.overdue_tasks.slice(0, 8).map((t) => (
              <Chip
                key={t.id}
                size="small"
                label={`#${t.id} ${t.title.slice(0, 28)}${t.title.length > 28 ? 'вЂ¦' : ''}`}
                onClick={() => void openSearchHitTask(t.id)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Alert>
      )}
      {digest && digest.due_soon_tasks.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Р”РµРґР»Р°Р№РЅ РІ Р±Р»РёР¶Р°Р№С€РёРµ {digestDueHours === 168 ? '7 РґРЅРµР№' : `${digestDueHours} С‡`}:{' '}
            {digest.due_soon_tasks.length}
            {digest.due_soon_tasks.length >= 25 ? '+' : ''}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {digest.due_soon_tasks.slice(0, 8).map((t) => (
              <Chip
                key={t.id}
                size="small"
                label={`#${t.id} ${t.title.length > 24 ? `${t.title.slice(0, 24)}вЂ¦` : t.title}`}
                onClick={() => void openSearchHitTask(t.id)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Alert>
      )}

      <Tabs value={tab} onChange={handleWorkspaceTabChange} sx={{ mb: 2 }}>
        <Tab label={`РџСЂРѕРµРєС‚С‹ (${projects.length})`} />
        <Tab label={`РљРѕРЅС‚Р°РєС‚С‹ (${contacts.length})`} />
        <Tab label={`Р—Р°РґР°С‡Рё (${taskListTotal})`} />
        <Tab label={commsUnreadTotal > 0 ? `РљРѕРјРјСѓРЅРёРєР°С†РёРё (${commsUnreadTotal})` : 'РљРѕРјРјСѓРЅРёРєР°С†РёРё'} />
        <Tab label={`РЈРІРµРґРѕРјР»РµРЅРёСЏ${notifEnvelope && notifEnvelope.unread_count > 0 ? ` (${notifEnvelope.unread_count})` : ''}`} />
        <Tab label="РќР°СЃС‚СЂРѕР№РєРё" />
        <Tab label="РСЃС‚РѕСЂРёСЏ" />
      </Tabs>

      {tab === OW_TAB_PROJECTS && (
        <Stack spacing={2}>
          {topOverdueProjects.length > 0 && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Проекты с самой большой просрочкой</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Блок строится по текущей видимой выборке проектов и помогает быстро перейти к проблемным задачам.
                  </Typography>
                  <Grid container spacing={1.5}>
                    {topOverdueProjects.map((project) => (
                      <Grid key={project.id} item xs={12} md={6} xl={4}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">{project.name}</Typography>
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Chip size="small" color="warning" label={`Просрочено: ${project.overdue_tasks_count ?? 0}`} />
                                <Chip size="small" label={`Активных: ${project.active_tasks_count ?? 0}`} />
                                <Chip size="small" variant="outlined" label={`Всего: ${project.total_tasks_count ?? 0}`} />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Ответственный: <strong>{userName(project.owner_id)}</strong>
                              </Typography>
                              <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Button size="small" variant="outlined" onClick={() => openProjectDialog(project)}>
                                  Открыть проект
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  onClick={() => drillDownToProjectTasks(project.id, { overdueOnly: true })}
                                >
                                  Просроченные задачи
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
                  onChange={(e) => setProjectListStatus(e.target.value)}
                >
                  <MenuItem value="">Р’СЃРµ</MenuItem>
                  <MenuItem value="active">РђРєС‚РёРІРЅС‹Р№</MenuItem>
                  <MenuItem value="completed">Р—Р°РІРµСЂС€С‘РЅ</MenuItem>
                  <MenuItem value="archived">РђСЂС…РёРІ</MenuItem>
                </TextField>
                <TextField
                  label="РџРѕРёСЃРє РїРѕ РЅР°Р·РІР°РЅРёСЋ/РѕРїРёСЃР°РЅРёСЋ"
                  size="small"
                  sx={{ minWidth: 220, flex: 1 }}
                  value={projectListSearchInput}
                  onChange={(e) => setProjectListSearchInput(e.target.value)}
                />
                <TextField
                  select
                  label="РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№"
                  size="small"
                  sx={{ minWidth: 200 }}
                  value={projectListOwnerId === '' ? '' : String(projectListOwnerId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProjectListOwnerId(v === '' ? '' : Number(v));
                  }}
                >
                  <MenuItem value="">Р’СЃРµ</MenuItem>
                  {userOptions.map((u) => (
                    <MenuItem key={u.id} value={String(u.id)}>
                      {u.full_name}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={projectListOverdueOnly}
                      onChange={(_, c) => setProjectListOverdueOnly(c)}
                    />
                  }
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
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={!isWorkspaceFullAccess}
                />
                <Button variant="contained" onClick={createProject} disabled={!isWorkspaceFullAccess}>
                  РЎРѕР·РґР°С‚СЊ
                </Button>
              </Stack>
              {!isWorkspaceFullAccess && (
                <Alert severity="info" sx={{ mt: 1.5 }}>
                  Создание новых проектов доступно только admin / owner.
                </Alert>
              )}
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {projects.map((p) => (
              <Grid item xs={12} md={6} key={p.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h6">{p.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№: {userName(p.owner_id)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={() => openProjectDialog(p)} aria-label="РћС‚РєСЂС‹С‚СЊ">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={p.status} />
                      <Chip size="small" label={`Р—Р°РґР°С‡ РІСЃРµРіРѕ: ${p.total_tasks_count ?? 0}`} />
                      <Chip size="small" label={`РђРєС‚РёРІРЅ.: ${p.active_tasks_count}`} />
                      {(p.overdue_tasks_count ?? 0) > 0 && (
                        <Chip size="small" color="warning" label={`РџСЂРѕСЃСЂРѕС‡.: ${p.overdue_tasks_count}`} />
                      )}
                      <Chip size="small" label={`РљРѕРЅС‚Р°РєС‚РѕРІ: ${p.contacts_count}`} />
                      {p.subprojects_count > 0 && <Chip size="small" label={`РџРѕРґРїСЂРѕРµРєС‚РѕРІ: ${p.subprojects_count}`} />}
                    </Stack>
                    {p.updated_at ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                        РћР±РЅРѕРІР»С‘РЅ:{' '}
                        {new Date(p.updated_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
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
      )}

      {tab === OW_TAB_CONTACTS && (
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>
                Р¤РёР»СЊС‚СЂС‹ СЃРїРёСЃРєР° РєРѕРЅС‚Р°РєС‚РѕРІ
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
                <TextField
                  label="РџРѕРёСЃРє (Р¤РРћ, С‚РµР»РµС„РѕРЅ, РєРѕРјРїР°РЅРёСЏ)"
                  size="small"
                  sx={{ minWidth: 240, flex: 1 }}
                  value={contactListSearchInput}
                  onChange={(e) => setContactListSearchInput(e.target.value)}
                />
                <TextField
                  select
                  label="Р’ РїСЂРѕРµРєС‚Рµ"
                  size="small"
                  sx={{ minWidth: 220 }}
                  value={contactListProjectId === '' ? '' : String(contactListProjectId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setContactListProjectId(v === '' ? '' : Number(v));
                  }}
                >
                  <MenuItem value="">Р›СЋР±РѕР№</MenuItem>
                  {projectsCatalogSorted.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="РўРµРі"
                  size="small"
                  sx={{ minWidth: 180 }}
                  value={contactListTag}
                  onChange={(e) => setContactListTag(e.target.value)}
                  helperText={contactListTagOptions.length === 0 ? 'РќРµС‚ С‚РµРіРѕРІ РІ РєР°С‚Р°Р»РѕРіРµ' : undefined}
                >
                  <MenuItem value="">Р›СЋР±РѕР№</MenuItem>
                  {contactListTagOptions.map((tg) => (
                    <MenuItem key={tg} value={tg}>
                      {tg}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={contactListActiveTasksOnly}
                      onChange={(_, c) => setContactListActiveTasksOnly(c)}
                    />
                  }
                  label="РўРѕР»СЊРєРѕ СЃ Р°РєС‚РёРІРЅС‹РјРё Р·Р°РґР°С‡Р°РјРё"
                />
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
                <TextField fullWidth label="Р¤РРћ" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                <TextField fullWidth label="РўРµР»РµС„РѕРЅ" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                {!isWorkspaceFullAccess && (
                  <Autocomplete
                    sx={{ minWidth: 260, flex: 1 }}
                    options={projectsCatalogSorted}
                    getOptionLabel={(o) => o.name}
                    value={projectsCatalogSorted.find((p) => p.id === newContactProjectId) || null}
                    onChange={(_, v) => setNewContactProjectId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Проект для привязки" />}
                  />
                )}
                <Button
                  variant="contained"
                  onClick={createContact}
                  disabled={!isWorkspaceFullAccess && newContactProjectId === ''}
                >
                  РЎРѕР·РґР°С‚СЊ
                </Button>
              </Stack>
              {!isWorkspaceFullAccess && (
                <Alert severity="info" sx={{ mt: 1.5 }}>
                  Для sales / trainer новый контакт создаётся только вместе с привязкой к доступному проекту.
                </Alert>
              )}
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {contacts.map((c) => (
              <Grid item xs={12} md={6} key={c.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="h6">{c.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {c.phone}
                        </Typography>
                        {c.company?.trim() ? (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {c.company}
                          </Typography>
                        ) : null}
                        {(c.tags?.length ?? 0) > 0 ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1, gap: 0.5 }}>
                            {(c.tags ?? []).slice(0, 5).map((t, i) => (
                              <Chip key={`${t}-${i}`} size="small" variant="outlined" label={t} />
                            ))}
                            {(c.tags ?? []).length > 5 ? (
                              <Chip size="small" variant="outlined" label={`+${(c.tags ?? []).length - 5}`} />
                            ) : null}
                          </Stack>
                        ) : null}
                        {c.last_interaction_at ? (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                            РџРѕСЃР»РµРґРЅРµРµ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРёРµ:{' '}
                            {new Date(c.last_interaction_at).toLocaleString('ru-RU', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </Typography>
                        ) : null}
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Chip size="small" label={`РђРєС‚РёРІРЅ. Р·Р°РґР°С‡: ${c.active_tasks_count}`} />
                          {c.linked_project_ids.length > 0 && (
                            <Chip size="small" label={`РџСЂРѕРµРєС‚РѕРІ: ${c.linked_project_ids.length}`} />
                          )}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.25} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                        <Tooltip title="РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р°">
                          <IconButton size="small" onClick={() => void openContactDialog(c)} aria-label="РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р°">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="РџРµСЂРµРїРёСЃРєР°">
                          <IconButton
                            size="small"
                            onClick={() => void openContactQuickComms(c.id)}
                            aria-label="РћС‚РєСЂС‹С‚СЊ РїРµСЂРµРїРёСЃРєСѓ"
                          >
                            <ChatBubbleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Р—Р°РґР°С‡Рё РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ">
                          <IconButton
                            size="small"
                            onClick={() => openContactQuickTasks(c.id)}
                            aria-label="Р—Р°РґР°С‡Рё РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ"
                          >
                            <AssignmentIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {c.phone?.trim() ? (
                          <Tooltip title="РџРѕР·РІРѕРЅРёС‚СЊ">
                            <IconButton
                              size="small"
                              component="a"
                              href={`tel:${c.phone.replace(/\s/g, '')}`}
                              aria-label="РџРѕР·РІРѕРЅРёС‚СЊ"
                              rel="noopener noreferrer"
                            >
                              <PhoneIphoneIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {contacts.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  РќРµС‚ РєРѕРЅС‚Р°РєС‚РѕРІ РїРѕ С‚РµРєСѓС‰РёРј С„РёР»СЊС‚СЂР°Рј.
                </Typography>
              </Grid>
            )}
          </Grid>
        </Stack>
      )}

      {tab === OW_TAB_TASKS && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                РќРѕРІР°СЏ Р·Р°РґР°С‡Р°
              </Typography>
              <Stack spacing={1}>
                {!canCreateNewTaskInSelectedContext && (
                  <Alert severity="info">
                    Р’С‹Р±СЂР°РЅРЅС‹Р№ РїСЂРѕРµРєС‚ РёР»Рё РєРѕРЅС‚Р°РєС‚ РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. РЎРѕР·РґР°РЅРёРµ Р·Р°РґР°С‡Рё РІ СЌС‚РѕРј РєРѕРЅС‚РµРєСЃС‚Рµ РѕС‚РєР»СЋС‡РµРЅРѕ.
                  </Alert>
                )}
                <TextField fullWidth label="РќР°Р·РІР°РЅРёРµ" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    label="РџСЂРёРѕСЂРёС‚РµС‚"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)}
                    sx={{ minWidth: 160 }}
                  >
                    {createPriorityOptions.map((p) => (
                      <MenuItem key={p} value={p}>
                        {priorityLabels[p] ?? p}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Autocomplete
                    options={projectsCatalogSorted}
                    getOptionLabel={(o) => o.name}
                    value={projectsCatalogSorted.find((p) => p.id === newTaskProjectId) || null}
                    onChange={(_, v) => setNewTaskProjectId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РџСЂРѕРµРєС‚ (РЅРµРѕР±СЏР·.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={contactsCatalogSorted}
                    getOptionLabel={(o) => `${o.full_name} В· ${o.phone}`}
                    value={contactsCatalogSorted.find((c) => c.id === newTaskContactId) || null}
                    onChange={(_, v) => setNewTaskContactId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РљРѕРЅС‚Р°РєС‚ (РЅРµРѕР±СЏР·.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={userOptions}
                    getOptionLabel={(o) => o.full_name}
                    value={userOptions.find((u) => u.id === newTaskAssigneeId) || null}
                    onChange={(_, v) => setNewTaskAssigneeId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РСЃРїРѕР»РЅРёС‚РµР»СЊ" />}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <TextField
                  label="Р”РµРґР»Р°Р№РЅ"
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ maxWidth: 280 }}
                />
                <Button
                  variant="contained"
                  onClick={createTask}
                  sx={{ alignSelf: 'flex-start' }}
                  disabled={!canCreateNewTaskInSelectedContext}
                >
                  РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Р¤РёР»СЊС‚СЂС‹
              </Typography>
              {taskStatusCounts != null && (
                <Stack direction="row" flexWrap="wrap" spacing={0.75} sx={{ mb: 1.5 }} useFlexGap>
                  <Chip
                    size="small"
                    color={taskStatusFilter === '' ? 'primary' : 'default'}
                    variant={taskStatusFilter === '' ? 'filled' : 'outlined'}
                    label={`Р’СЃРµ В· ${taskStatusCounts.total}`}
                    onClick={() => {
                      setTaskStatusFilter('');
                      void loadTasksFiltered({ statusFilter: '' });
                    }}
                  />
                  {enabledStatuses.map((s) => {
                    const n = taskStatusCounts.by_status[s] ?? 0;
                    return (
                      <Chip
                        key={s}
                        size="small"
                        color={taskStatusFilter === s ? 'primary' : 'default'}
                        variant={taskStatusFilter === s ? 'filled' : 'outlined'}
                        label={`${statusLabels[s] ?? s} В· ${n}`}
                        onClick={() => {
                          const next = taskStatusFilter === s ? '' : s;
                          setTaskStatusFilter(next);
                          void loadTasksFiltered({ statusFilter: next });
                        }}
                      />
                    );
                  })}
                </Stack>
              )}
              <Grid container spacing={1}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="РџРѕРёСЃРє"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    onBlur={() => loadTasksFiltered()}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="РЎС‚Р°С‚СѓСЃ"
                    value={taskStatusFilter}
                    onChange={(e) => setTaskStatusFilter(e.target.value)}
                  >
                    <MenuItem value="">Р’СЃРµ</MenuItem>
                    {enabledStatuses.map((k) => (
                      <MenuItem key={k} value={k}>
                        {statusLabels[k] ?? k}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="РџСЂРёРѕСЂРёС‚РµС‚"
                    value={taskPriorityFilter}
                    onChange={(e) => setTaskPriorityFilter(e.target.value)}
                  >
                    <MenuItem value="">Р’СЃРµ</MenuItem>
                    {enabledPriorities.map((k) => (
                      <MenuItem key={k} value={k}>
                        {priorityLabels[k] ?? k}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={projectsCatalogSorted}
                    getOptionLabel={(o) => o.name}
                    value={projectsCatalogSorted.find((p) => p.id === taskProjectFilter) || null}
                    onChange={(_, v) => setTaskProjectFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РџСЂРѕРµРєС‚" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={contactsCatalogSorted}
                    getOptionLabel={(o) => `${o.full_name}`}
                    value={contactsCatalogSorted.find((c) => c.id === taskContactFilter) || null}
                    onChange={(_, v) => setTaskContactFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РљРѕРЅС‚Р°РєС‚" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={userOptions}
                    getOptionLabel={(o) => o.full_name}
                    value={userOptions.find((u) => u.id === taskAssigneeFilter) || null}
                    onChange={(_, v) => setTaskAssigneeFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="РСЃРїРѕР»РЅРёС‚РµР»СЊ" />}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="РЎРѕСЂС‚РёСЂРѕРІРєР°"
                    value={taskSortBy}
                    onChange={(e) =>
                      setTaskSortBy(e.target.value as 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority')
                    }
                  >
                    <MenuItem value="created_at">РџРѕ РґР°С‚Рµ СЃРѕР·РґР°РЅРёСЏ</MenuItem>
                    <MenuItem value="updated_at">РџРѕ РѕР±РЅРѕРІР»РµРЅРёСЋ</MenuItem>
                    <MenuItem value="deadline_at">РџРѕ РґРµРґР»Р°Р№РЅСѓ</MenuItem>
                    <MenuItem value="priority">РџРѕ РїСЂРёРѕСЂРёС‚РµС‚Сѓ</MenuItem>
                    <MenuItem value="title">РџРѕ РЅР°Р·РІР°РЅРёСЋ</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="РџРѕСЂСЏРґРѕРє"
                    value={taskSortDir}
                    onChange={(e) => setTaskSortDir(e.target.value as 'asc' | 'desc')}
                  >
                    <MenuItem value="desc">РџРѕ СѓР±С‹РІР°РЅРёСЋ</MenuItem>
                    <MenuItem value="asc">РџРѕ РІРѕР·СЂР°СЃС‚Р°РЅРёСЋ</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControlLabel
                      control={<Checkbox checked={taskOverdueOnly} onChange={(e) => setTaskOverdueOnly(e.target.checked)} />}
                      label="РўРѕР»СЊРєРѕ РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Рµ"
                    />
                    <FormControlLabel
                      control={<Checkbox checked={taskActiveOnly} onChange={(e) => setTaskActiveOnly(e.target.checked)} />}
                      label="РўРѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ"
                    />
                    <Button size="small" variant="outlined" onClick={() => loadTasksFiltered()}>
                      РџСЂРёРјРµРЅРёС‚СЊ
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

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
                              <Button size="small" variant="outlined" onClick={() => drillDownToAssigneeTasks(row.assigneeId)}>
                                Все активные
                              </Button>
                              {row.overdueCount > 0 && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  onClick={() => drillDownToAssigneeTasks(row.assigneeId, { overdueOnly: true })}
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
                                onClick={() => drillDownToAssigneeTasks(row.assigneeId)}
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

          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <ToggleButtonGroup
              size="small"
              value={taskViewMode}
              exclusive
              onChange={(_, v) => v && setTaskViewMode(v)}
            >
              <ToggleButton value="list">РЎРїРёСЃРѕРє</ToggleButton>
              <ToggleButton value="kanban">РљР°РЅР±Р°РЅ</ToggleButton>
              <ToggleButton value="calendar">РљР°Р»РµРЅРґР°СЂСЊ</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              Р’ РєР°РЅР±Р°РЅРµ РїРµСЂРµС‚Р°С‰РёС‚Рµ РєР°СЂС‚РѕС‡РєСѓ РЅР° РґСЂСѓРіСѓСЋ РєРѕР»РѕРЅРєСѓ, С‡С‚РѕР±С‹ СЃРјРµРЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ.
            </Typography>
          </Stack>

          {taskViewMode !== 'list' && taskListTotal > OWNER_WS_TASKS_FETCH_CAP && (
            <Alert severity="warning">
              Р—Р°РіСЂСѓР¶РµРЅРѕ РЅРµ Р±РѕР»РµРµ {OWNER_WS_TASKS_FETCH_CAP} Р·Р°РґР°С‡ РїСЂРё С‚РµРєСѓС‰РёС… С„РёР»СЊС‚СЂР°С… (РІСЃРµРіРѕ РїРѕ С„РёР»СЊС‚СЂСѓ: {taskListTotal}
              ). РЈС‚РѕС‡РЅРёС‚Рµ С„РёР»СЊС‚СЂС‹ РёР»Рё РїРµСЂРµРєР»СЋС‡РёС‚РµСЃСЊ РІ СЂРµР¶РёРј В«РЎРїРёСЃРѕРєВ» СЃ РїР°РіРёРЅР°С†РёРµР№.
            </Alert>
          )}

          {taskViewMode === 'list' && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                    indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < tasks.length}
                    onChange={() => {
                      if (selectedTaskIds.length === tasks.length) setSelectedTaskIds([]);
                      else setSelectedTaskIds(tasks.map((x) => x.id));
                    }}
                  />
                }
                label="Р’СЃРµ РЅР° СЃС‚СЂР°РЅРёС†Рµ"
              />
              <Typography variant="body2">{selectedTaskIds.length} РІС‹Р±СЂР°РЅРѕ</Typography>
              <TextField
                select
                size="small"
                label="РЎС‚Р°С‚СѓСЃ"
                sx={{ minWidth: 160 }}
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                <MenuItem value="">РќРµ РјРµРЅСЏС‚СЊ</MenuItem>
                {enabledStatuses.map((s) => (
                  <MenuItem key={s} value={s}>
                    {statusLabels[s]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="РСЃРїРѕР»РЅРёС‚РµР»СЊ"
                sx={{ minWidth: 200 }}
                value={bulkAssigneeMode}
                onChange={(e) => setBulkAssigneeMode(e.target.value as 'skip' | 'set' | 'clear')}
              >
                <MenuItem value="skip">РќРµ РјРµРЅСЏС‚СЊ</MenuItem>
                <MenuItem value="set">РќР°Р·РЅР°С‡РёС‚СЊвЂ¦</MenuItem>
                <MenuItem value="clear">РЎРЅСЏС‚СЊ РёСЃРїРѕР»РЅРёС‚РµР»СЏ</MenuItem>
              </TextField>
              {bulkAssigneeMode === 'set' && (
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 220 }}
                  options={userOptions}
                  getOptionLabel={(o) => o.full_name}
                  value={userOptions.find((u) => u.id === bulkAssigneeUserId) || null}
                  onChange={(_, v) => setBulkAssigneeUserId(v ? v.id : '')}
                  renderInput={(params) => <TextField {...params} label="РљРѕРјСѓ" />}
                />
              )}
              <TextField
                select
                size="small"
                label="РџСЂРёРѕСЂРёС‚РµС‚"
                sx={{ minWidth: 160 }}
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value)}
              >
                <MenuItem value="">РќРµ РјРµРЅСЏС‚СЊ</MenuItem>
                {enabledPriorities.map((p) => (
                  <MenuItem key={p} value={p}>
                    {priorityLabels[p]}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" disabled={selectedTaskIds.length === 0} onClick={applyBulkTaskUpdate}>
                РџСЂРёРјРµРЅРёС‚СЊ Рє РІС‹Р±СЂР°РЅРЅС‹Рј
              </Button>
            </Stack>
          )}

          {taskViewMode === 'list' ? (
            <Stack spacing={1}>
              {tasks.map((t) =>
                renderTaskCard(t, {
                  selectable: true,
                  selected: selectedTaskIds.includes(t.id),
                  onToggleSelect: () => {
                    setSelectedTaskIds((prev) =>
                      prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                    );
                  },
                })
              )}
              {tasks.length === 0 && !loading && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      РџРѕРєР° РЅРµС‚ Р·Р°РґР°С‡
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ Р·Р°РґР°С‡Сѓ С„РѕСЂРјРѕР№ РІС‹С€Рµ РёР»Рё РёР·РјРµРЅРёС‚Рµ С„РёР»СЊС‚СЂС‹ Рё РЅР°Р¶РјРёС‚Рµ В«РџСЂРёРјРµРЅРёС‚СЊВ».
                    </Typography>
                  </CardContent>
                </Card>
              )}
              <TablePagination
                component="div"
                count={taskListTotal}
                page={taskListPage}
                onPageChange={(_, newPage) => setTaskListPage(newPage)}
                rowsPerPage={taskListRowsPerPage}
                onRowsPerPageChange={(e) => {
                  setTaskListRowsPerPage(parseInt(e.target.value, 10));
                  setTaskListPage(0);
                }}
                rowsPerPageOptions={[10, 25, 50, 100]}
                labelRowsPerPage="РќР° СЃС‚СЂР°РЅРёС†Рµ:"
                labelDisplayedRows={({ from, to, count }) => `${from}вЂ“${to} РёР· ${count !== -1 ? count : `Р±РѕР»РµРµ ${to}`}`}
              />
            </Stack>
          ) : taskViewMode === 'kanban' ? (
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
              {KANBAN_COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) =>
                  col.statuses.includes(coerceTaskStatus(String(t.status)))
                );
                return (
                  <Box
                    key={col.label}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('text/plain');
                      const taskId = Number(raw);
                      if (!taskId) return;
                      void handleKanbanDrop(taskId, col.dropStatus);
                    }}
                    sx={{
                      minWidth: 200,
                      maxWidth: 280,
                      flex: '0 0 auto',
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      p: 1,
                      minHeight: 200,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ mb: 1, px: 0.5 }}>
                      {col.label} ({colTasks.length})
                    </Typography>
                    <Stack spacing={0}>{colTasks.map((t) => renderTaskCard(t, { draggable: true }))}</Stack>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <IconButton aria-label="РџСЂРµРґС‹РґСѓС‰РёР№ РјРµСЃСЏС†" onClick={() => setCalendarMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)))}>
                    <ChevronLeftIcon />
                  </IconButton>
                  <Typography variant="h6">
                    {format(calendarMonth, 'LLLL yyyy', { locale: ru })}
                  </Typography>
                  <IconButton aria-label="РЎР»РµРґСѓСЋС‰РёР№ РјРµСЃСЏС†" onClick={() => setCalendarMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1)))}>
                    <ChevronRightIcon />
                  </IconButton>
                </Stack>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 0.5,
                  }}
                >
                  {WEEKDAYS_SHORT.map((wd) => (
                    <Typography key={wd} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600 }}>
                      {wd}
                    </Typography>
                  ))}
                  {eachDayOfInterval({
                    start: startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
                    end: endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
                  }).map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const dayTasks = tasksByDeadlineDay.get(key) || [];
                    const inMonth = isSameMonth(day, calendarMonth);
                    return (
                      <Box
                        key={key}
                        sx={{
                          minHeight: 100,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          p: 0.5,
                          bgcolor: inMonth ? 'background.paper' : 'action.hover',
                          opacity: inMonth ? 1 : 0.65,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: isToday(day) ? 700 : 500, color: isToday(day) ? 'primary.main' : 'text.primary' }}
                        >
                          {format(day, 'd')}
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {dayTasks.slice(0, 4).map((t) => (
                            <Chip
                              key={t.id}
                              size="small"
                              label={t.title.length > 22 ? `${t.title.slice(0, 22)}вЂ¦` : t.title}
                              onClick={() => openTaskDialog(t)}
                              sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
                            />
                          ))}
                          {dayTasks.length > 4 && (
                            <Typography variant="caption" color="text.secondary">
                              +{dayTasks.length - 4}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}

      {tab === OW_TAB_COMMS && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Button variant="outlined" onClick={() => void syncMaxIntoWorkspace()}>
              РРјРїРѕСЂС‚ MAX РІ РїРµСЂРµРїРёСЃРєРё
            </Button>
            <Typography variant="caption" color="text.secondary">
              РСЃС…РѕРґСЏС‰РёРµ РёР· max_messages в†’ СЃРѕРѕР±С‰РµРЅРёСЏ РєРѕРЅС‚Р°РєС‚Р° РїРѕ СЃРѕРІРїР°РґРµРЅРёСЋ РЅРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅРѕРіРѕ С‚РµР»РµС„РѕРЅР° (РґСѓР±Р»РёРєР°С‚С‹ РїРѕ id
              РїСЂРѕРїСѓСЃРєР°СЋС‚СЃСЏ).
            </Typography>
          </Stack>
          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={3}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
                  <Typography variant="h6" gutterBottom>
                    Р”РёР°Р»РѕРіРё
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="РџРѕРёСЃРє РїРѕ РёРјРµРЅРё РёР»Рё С‚РµРєСЃС‚СѓвЂ¦"
                    value={commsDialogSearch}
                    onChange={(e) => setCommsDialogSearch(e.target.value)}
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
                      ? `${conversations.length} РґРёР°Р»РѕРіРѕРІ`
                      : `РќР°Р№РґРµРЅРѕ ${conversationsFiltered.length} РёР· ${conversations.length}`}
                  </Typography>
                  <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {conversationsFiltered.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {conversations.length === 0 ? 'РќРµС‚ РїРµСЂРµРїРёСЃРѕРє СЃ СЃРѕРѕР±С‰РµРЅРёСЏРјРё.' : 'РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ.'}
                      </Typography>
                    )}
                    {conversationsFiltered.map((c) => (
                      <Box
                        key={c.contact_id}
                        onClick={() => void selectCommsContact(c.contact_id)}
                        sx={{
                          p: 1,
                          border: '1px solid',
                          borderColor: commsContactId === c.contact_id ? 'primary.main' : 'divider',
                          borderRadius: 1,
                          cursor: 'pointer',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2">{c.contact_name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {c.last_message_text || 'вЂ”'}
                            </Typography>
                            {c.last_message_at ? (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                {new Date(c.last_message_at).toLocaleString('ru-RU', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </Typography>
                            ) : null}
                          </Box>
                          {c.unread_count > 0 ? (
                            <Chip
                              size="small"
                              color="error"
                              label={c.unread_count > 99 ? '99+' : c.unread_count}
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
                      ? `РџРµСЂРµРїРёСЃРєР° В· ${commsSelectedContact?.full_name ?? `РєРѕРЅС‚Р°РєС‚ #${commsContactId}`}`
                      : 'Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі СЃР»РµРІР°'}
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="РџРѕРёСЃРє РїРѕ СЃРѕРѕР±С‰РµРЅРёСЏРјвЂ¦"
                    value={commsThreadSearch}
                    onChange={(e) => setCommsThreadSearch(e.target.value)}
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
                      РџРѕРєР°Р·Р°РЅРѕ {commsMessagesFiltered.length} РёР· {commsMessages.length}
                    </Typography>
                  )}
                  <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {!commsContactId && (
                      <Typography variant="body2" color="text.secondary">
                        Р›РµРЅС‚Р° СЃРѕРѕР±С‰РµРЅРёР№ РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РІС‹Р±РѕСЂР° РєРѕРЅС‚Р°РєС‚Р°.
                      </Typography>
                    )}
                    {commsContactId &&
                      commsMessagesFiltered.map((m) => (
                        <Box
                          key={m.id}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: m.direction === 'outgoing' ? 'action.hover' : 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {m.direction} В· {m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : ''}
                          </Typography>
                          <Typography variant="body2">{m.text}</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                            <Button
                              size="small"
                              disabled={!canEditContactContentUi(m.contact_id)}
                              onClick={() => {
                                setMessageTaskTitle(m.text.slice(0, 80) + (m.text.length > 80 ? 'вЂ¦' : ''));
                                setMessageTaskDialog({ message: m });
                              }}
                            >
                              Р—Р°РґР°С‡Р° РёР· СЃРѕРѕР±С‰РµРЅРёСЏ
                            </Button>
                            <Button size="small" color="secondary" onClick={() => openLinkToTaskDialog(m)}>
                              Рљ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµР№ Р·Р°РґР°С‡Рµ
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
                    РљРѕРЅС‚РµРєСЃС‚
                  </Typography>
                  {!commsContactId && (
                    <Typography variant="body2" color="text.secondary">
                      Р’С‹Р±РµСЂРёС‚Рµ РґРёР°Р»РѕРі, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РєР°СЂС‚РѕС‡РєСѓ РєРѕРЅС‚Р°РєС‚Р° Рё Р±С‹СЃС‚СЂС‹Рµ РґРµР№СЃС‚РІРёСЏ.
                    </Typography>
                  )}
                  {commsContactId && (
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle1">{commsSelectedContact?.full_name ?? `РљРѕРЅС‚Р°РєС‚ #${commsContactId}`}</Typography>
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
                      <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void openCommsContactCard()}>
                        РћС‚РєСЂС‹С‚СЊ РєР°СЂС‚РѕС‡РєСѓ РєРѕРЅС‚Р°РєС‚Р°
                      </Button>
                      <Divider />
                      <Typography variant="caption" color="text.secondary">
                        РќРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РІ API РїРѕРєР° РЅРµ СѓС‡РёС‚С‹РІР°СЋС‚СЃСЏ (РїРѕР»Рµ Р·Р°СЂРµР·РµСЂРІРёСЂРѕРІР°РЅРѕ РїРѕРґ Р±СѓРґСѓС‰СѓСЋ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЋ).
                      </Typography>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      )}

      {tab === OW_TAB_NOTIFICATIONS && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
              <Typography variant="subtitle1">Р’СЃРµ СѓРІРµРґРѕРјР»РµРЅРёСЏ</Typography>
              <Button size="small" variant="outlined" onClick={() => void loadNotifications(200)}>
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
              {(notifEnvelope?.items || []).map((n) => (
                <Card key={n.id} variant="outlined" sx={{ bgcolor: n.read_at ? 'transparent' : 'action.hover' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <Chip size="small" label={OWNER_WS_NOTIF_KIND_LABELS[n.kind] || n.kind} />
                      {!n.read_at && <Chip size="small" color="warning" label="РќРѕРІРѕРµ" />}
                      <Typography variant="caption" color="text.secondary">
                        {n.created_at ? new Date(n.created_at).toLocaleString('ru-RU') : ''}
                      </Typography>
                    </Stack>
                    <Typography variant="subtitle2">{n.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {n.body}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {n.task_id != null && (
                        <Button size="small" variant="contained" onClick={() => void openSearchHitTask(n.task_id!)}>
                          РћС‚РєСЂС‹С‚СЊ Р·Р°РґР°С‡Сѓ
                        </Button>
                      )}
                      {n.contact_id != null && (
                        <Button size="small" variant="outlined" onClick={() => void openNotificationComms(n.contact_id!)}>
                          РџРµСЂРµРїРёСЃРєР°
                        </Button>
                      )}
                      {!n.read_at && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            void (async () => {
                              try {
                                await ownerWorkspaceApi.markNotificationRead(n.id);
                                await loadNotifications(200);
                              } catch (err: unknown) {
                                setError(extractApiError(err, 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РјРµС‚РёС‚СЊ РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рј'));
                              }
                            })();
                          }}
                        >
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
      )}

      {tab === OW_TAB_SETTINGS && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              РќР°СЃС‚СЂРѕР№РєРё Р·Р°РґР°С‡РЅРёРєР°
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              РџР°СЂР°РјРµС‚СЂС‹ РЅРёР¶Рµ СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ РІ РІР°С€РµРј РїСЂРѕС„РёР»Рµ Рё РїРѕРґСЃС‚Р°РІР»СЏСЋС‚СЃСЏ РїСЂРё СЃР»РµРґСѓСЋС‰РµРј РѕС‚РєСЂС‹С‚РёРё Owner workspace. РР·РјРµРЅРµРЅРёСЏ
              РЅР° РґСЂСѓРіРёС… РІРєР»Р°РґРєР°С… (РІРёРґ Р·Р°РґР°С‡, СЃРІРѕРґРєР°) СЃСЂР°Р·Сѓ РІРёРґРЅС‹ РІ РёРЅС‚РµСЂС„РµР№СЃРµ; РЅР°Р¶РјРёС‚Рµ В«РЎРѕС…СЂР°РЅРёС‚СЊВ», С‡С‚РѕР±С‹ Р·Р°С„РёРєСЃРёСЂРѕРІР°С‚СЊ РёС…
              РєР°Рє СѓРјРѕР»С‡Р°РЅРёСЏ.
            </Typography>
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">РњР°С‚СЂРёС†Р° СЂРѕР»РµР№ Рё РїСЂР°РІ</Typography>
                  <Typography variant="body2" color="text.secondary">
                    РќРёР¶Рµ Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅС‹ С‚РµРєСѓС‰РёРµ СЂРѕР»Рё owner workspace Рё РёС… РѕР¶РёРґР°РµРјС‹Р№ СѓСЂРѕРІРµРЅСЊ РґРѕСЃС‚СѓРїР°. Р­С‚Рѕ РѕРїРѕСЂРЅР°СЏ СЃС…РµРјР° РґР»СЏ РїСЂРѕРґСѓРєС‚Р° Рё
                    РґР»СЏ РґР°Р»СЊРЅРµР№С€РµР№ РґРѕСЂР°Р±РѕС‚РєРё permission matrix.
                  </Typography>
                  <Grid container spacing={2}>
                    {OWNER_WS_ACCESS_MATRIX.map((item) => (
                      <Grid key={item.role} item xs={12} md={6}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">{item.role}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.scope}
                              </Typography>
                              <Stack spacing={0.5}>
                                {item.capabilities.map((capability) => (
                                  <Typography key={capability} variant="body2" color="text.secondary">
                                    вЂў {capability}
                                  </Typography>
                                ))}
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
            <Stack spacing={2} sx={{ maxWidth: 480 }}>
              <TextField
                select
                fullWidth
                label="Р’РёРґ СЃРїРёСЃРєР° Р·Р°РґР°С‡ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ"
                value={taskViewMode}
                onChange={(e) => setTaskViewMode(e.target.value as 'list' | 'kanban' | 'calendar')}
              >
                <MenuItem value="list">РЎРїРёСЃРѕРє</MenuItem>
                <MenuItem value="kanban">РљР°РЅР±Р°РЅ</MenuItem>
                <MenuItem value="calendar">РљР°Р»РµРЅРґР°СЂСЊ</MenuItem>
              </TextField>
              <TextField
                fullWidth
                type="number"
                inputProps={{ min: 5, max: 100 }}
                label="РЎС‚СЂРѕРє РЅР° СЃС‚СЂР°РЅРёС†Рµ (СЂРµР¶РёРј В«РЎРїРёСЃРѕРєВ», 5вЂ“100)"
                value={taskListRowsPerPage}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n)) return;
                  setTaskListRowsPerPage(Math.min(100, Math.max(5, n)));
                }}
              />
              <TextField
                select
                fullWidth
                label="РЎРІРѕРґРєР° РїРѕ РґРµРґР»Р°Р№РЅР°Рј: РѕРєРЅРѕ (С‡Р°СЃС‹)"
                value={String(digestDueHours)}
                onChange={(e) => setDigestDueHours(Number(e.target.value))}
              >
                {[8, 24, 48, 72, 168, 336].map((n) => (
                  <MenuItem key={n} value={String(n)}>
                    {n === 168 ? '7 РґРЅРµР№ (168 С‡)' : `${n} С‡`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="РЎРІРѕРґРєР°: РѕР±Р»Р°СЃС‚СЊ"
                value={digestScope}
                onChange={(e) => setDigestScope(e.target.value as 'all' | 'mine')}
              >
                <MenuItem value="all">Р’СЃРµ РґРѕСЃС‚СѓРїРЅС‹Рµ Р·Р°РґР°С‡Рё</MenuItem>
                <MenuItem value="mine">РўРѕР»СЊРєРѕ РјРѕРё (РёСЃРїРѕР»РЅРёС‚РµР»СЊ вЂ” СЏ)</MenuItem>
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
                    control={<Checkbox checked={notifyEmailEnabled} onChange={(_, checked) => setNotifyEmailEnabled(checked)} />}
                    label="Дублировать включённые уведомления на email"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskOverdue} onChange={(_, checked) => setNotifyTaskOverdue(checked)} />}
                    label="Просроченные задачи"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskDueSoon} onChange={(_, checked) => setNotifyTaskDueSoon(checked)} />}
                    label="Скоро дедлайн"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskAssigned} onChange={(_, checked) => setNotifyTaskAssigned(checked)} />}
                    label="Назначение задачи"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskComment} onChange={(_, checked) => setNotifyTaskComment(checked)} />}
                    label="Комментарии к задаче"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskUpdated} onChange={(_, checked) => setNotifyTaskUpdated(checked)} />}
                    label="Обновления задачи"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={notifyContactIncomingMessage}
                        onChange={(_, checked) => setNotifyContactIncomingMessage(checked)}
                      />
                    }
                    label="Входящие сообщения по контакту"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={notifyTaskMention} onChange={(_, checked) => setNotifyTaskMention(checked)} />}
                    label="Упоминания в комментариях"
                  />
                </Stack>
              </Box>
              <Button variant="contained" disabled={settingsSaving} onClick={() => void saveWorkspaceSettings()}>
                {settingsSaving ? 'РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦' : 'РЎРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё'}
              </Button>
            </Stack>
            {isWorkspaceFullAccess && taskConfigDraft && (
              <>
                <Divider sx={{ my: 3 }} />
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      РЎРёСЃС‚РµРјРЅС‹Рµ РЅР°Р·РІР°РЅРёСЏ Р·Р°РґР°С‡
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Р­С‚Рё РїРѕРґРїРёСЃРё РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ РІ СЃРїРёСЃРєР°С… Р·Р°РґР°С‡, РєР°РЅР±Р°РЅРµ, РєР°СЂС‚РѕС‡РєР°С… Рё С„РёР»СЊС‚СЂР°С….
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>
                            РЎС‚Р°С‚СѓСЃС‹
                          </Typography>
                          <Stack spacing={1.5}>
                            {(taskConfigDraft?.statuses ?? []).map((item, index) => (
                              <Box key={item.key}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  label={item.key}
                                  value={item.label}
                                  onChange={(e) =>
                                    setTaskConfigDraft((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            statuses: prev.statuses.map((current, currentIndex) =>
                                              currentIndex === index ? { ...current, label: e.target.value } : current
                                            ),
                                          }
                                        : prev
                                    )
                                  }
                                />
                                <FormControlLabel
                                  sx={{ mt: 0.5 }}
                                  control={
                                    <Checkbox
                                      checked={item.enabled !== false}
                                      onChange={(e) =>
                                        setTaskConfigDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                statuses: prev.statuses.map((current, currentIndex) =>
                                                  currentIndex === index ? { ...current, enabled: e.target.checked } : current
                                                ),
                                              }
                                            : prev
                                        )
                                      }
                                    />
                                  }
                                  label="РџРѕРєР°Р·С‹РІР°С‚СЊ РІ РёРЅС‚РµСЂС„РµР№СЃРµ"
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
                            РџСЂРёРѕСЂРёС‚РµС‚С‹
                          </Typography>
                          <Stack spacing={1.5}>
                            {(taskConfigDraft?.priorities ?? []).map((item, index) => (
                              <Box key={item.key}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  label={item.key}
                                  value={item.label}
                                  onChange={(e) =>
                                    setTaskConfigDraft((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            priorities: prev.priorities.map((current, currentIndex) =>
                                              currentIndex === index ? { ...current, label: e.target.value } : current
                                            ),
                                          }
                                        : prev
                                    )
                                  }
                                />
                                <FormControlLabel
                                  sx={{ mt: 0.5 }}
                                  control={
                                    <Checkbox
                                      checked={item.enabled !== false}
                                      onChange={(e) =>
                                        setTaskConfigDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                priorities: prev.priorities.map((current, currentIndex) =>
                                                  currentIndex === index ? { ...current, enabled: e.target.checked } : current
                                                ),
                                              }
                                            : prev
                                        )
                                      }
                                    />
                                  }
                                  label="РџРѕРєР°Р·С‹РІР°С‚СЊ РІ РёРЅС‚РµСЂС„РµР№СЃРµ"
                                />
                              </Box>
                            ))}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <Button variant="contained" disabled={taskConfigSaving} onClick={() => void saveWorkspaceTaskConfig()}>
                      {taskConfigSaving ? 'РЎРѕС…СЂР°РЅРµРЅРёРµ...' : 'РЎРѕС…СЂР°РЅРёС‚СЊ РЅР°Р·РІР°РЅРёСЏ'}
                    </Button>
                    <Button variant="outlined" disabled={taskConfigSaving || !taskConfig} onClick={() => setTaskConfigDraft(taskConfig)}>
                      РЎР±СЂРѕСЃРёС‚СЊ
                    </Button>
                  </Stack>
                </Stack>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === OW_TAB_HISTORY && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              РСЃС‚РѕСЂРёСЏ РґРµР№СЃС‚РІРёР№ (Р°СѓРґРёС‚)
            </Typography>
            <Stack spacing={1} sx={{ maxHeight: 560, overflow: 'auto' }}>
              {historyLogs.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  РќРµС‚ Р·Р°РїРёСЃРµР№ РёР»Рё РµС‰С‘ РЅРµ Р·Р°РіСЂСѓР¶РµРЅРѕ.
                </Typography>
              )}
              {historyLogs.map((h) => (
                <Box key={h.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''} В· {userName(h.author_id)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{h.entity_type}</strong> #{h.entity_id} вЂ” {h.action_type}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {loading && <Typography sx={{ mt: 2 }}>Р—Р°РіСЂСѓР·РєР°вЂ¦</Typography>}

      <Dialog open={Boolean(projectDialog)} onClose={closeProjectDialog} maxWidth="md" fullWidth>
        <DialogTitle>РџСЂРѕРµРєС‚: {projectDialog?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Р’СЃРµРіРѕ Р·Р°РґР°С‡: {projectDialog?.total_tasks_count ?? 0} В· РђРєС‚РёРІРЅС‹С…: {projectDialog?.active_tasks_count ?? 0} В·
              Р—Р°РІРµСЂС€С‘РЅРЅС‹С…: {projectDialog?.completed_tasks_count ?? 0} В· РџСЂРѕСЃСЂРѕС‡РµРЅРѕ (Р°РєС‚РёРІРЅ.):{' '}
              {projectDialog?.overdue_tasks_count ?? 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              РљРѕРЅС‚Р°РєС‚С‹: {projectDialog?.contacts_count ?? 0} В· РџРѕРґРїСЂРѕРµРєС‚С‹: {projectDialog?.subprojects_count ?? 0}
              {projectDialog?.updated_at
                ? ` В· РћР±РЅРѕРІР»С‘РЅ: ${new Date(projectDialog.updated_at).toLocaleString('ru-RU')}`
                : ''}
            </Typography>
            {!canEditProjectDialogContent && (
              <Alert severity="info">
                Р”Р»СЏ РІР°С€РµР№ СЂРѕР»Рё РїСЂРѕРµРєС‚ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. РР·РјРµРЅРµРЅРёРµ Р·Р°РґР°С‡ Рё РїСЂРёРІСЏР·РѕРє РєРѕРЅС‚Р°РєС‚РѕРІ РѕС‚РєР»СЋС‡РµРЅРѕ.
              </Alert>
            )}
            <Divider />
            <Typography variant="subtitle2">РљР°СЂС‚РѕС‡РєР° РїСЂРѕРµРєС‚Р°</Typography>
            <TextField
              fullWidth
              label="РќР°Р·РІР°РЅРёРµ"
              value={projectEditName}
              onChange={(e) => setProjectEditName(e.target.value)}
              disabled={!canEditProjectDialogContent}
            />
            <TextField
              fullWidth
              label="РћРїРёСЃР°РЅРёРµ"
              multiline
              minRows={2}
              value={projectEditDescription}
              onChange={(e) => setProjectEditDescription(e.target.value)}
              disabled={!canEditProjectDialogContent}
            />
            <TextField
              select
              fullWidth
              label="РЎС‚Р°С‚СѓСЃ"
              value={projectEditStatus}
              onChange={(e) => setProjectEditStatus(e.target.value)}
              disabled={!canEditProjectDialogContent}
            >
              <MenuItem value="active">РђРєС‚РёРІРЅС‹Р№</MenuItem>
              <MenuItem value="completed">Р—Р°РІРµСЂС€С‘РЅ</MenuItem>
              <MenuItem value="archived">РђСЂС…РёРІ</MenuItem>
            </TextField>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => void saveProjectDetails()}
              disabled={!canEditProjectDialogContent}
            >
              РЎРѕС…СЂР°РЅРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ
            </Button>
            <Divider />
            <Typography variant="subtitle2">РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№ (РІР»Р°РґРµР»РµС† РїСЂРѕРµРєС‚Р°)</Typography>
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === projectDialog?.owner_id) || null}
              disabled={!canEditProjectDialogContent}
              onChange={(_, v) => void saveProjectOwner(v)}
              renderInput={(params) => <TextField {...params} label="РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ" size="small" />}
            />
            {projectParticipantAnalyticsRows.length > 0 && (
              <>
                <Typography variant="subtitle2">Нагрузка участников проекта</Typography>
                <Grid container spacing={1.5}>
                  {projectParticipantAnalyticsRows.map((row) => (
                    <Grid key={`project-analytics-${row.assigneeId == null ? 'unassigned' : row.assigneeId}`} item xs={12} md={6}>
                      <Card variant="outlined">
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
                              onClick={() => {
                                if (!projectDialog) return;
                                closeProjectDialog();
                                drillDownToAssigneeTasks(row.assigneeId, { projectId: projectDialog.id });
                              }}
                            >
                              Открыть задачи участника
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                <Divider />
              </>
            )}
            <Typography variant="subtitle2">Р—Р°РґР°С‡Рё РїСЂРѕРµРєС‚Р°</Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              disabled={!canEditProjectDialogContent}
              onClick={() => {
                if (!projectDialog) return;
                setNewTaskProjectId(projectDialog.id);
                handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
                closeProjectDialog();
              }}
            >
              РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ РІ СЌС‚РѕРј РїСЂРѕРµРєС‚Рµ
            </Button>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ sm: 'center' }}>
              <TextField
                select
                label="РЎС‚Р°С‚СѓСЃ"
                size="small"
                sx={{ minWidth: 160 }}
                value={projectDialogTaskStatus}
                onChange={(e) => setProjectDialogTaskStatus(e.target.value)}
              >
                <MenuItem value="">Р’СЃРµ</MenuItem>
                {enabledStatuses.map((st) => (
                  <MenuItem key={st} value={st}>
                    {statusLabels[st] || st}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="РџРѕРёСЃРє РїРѕ РЅР°Р·РІР°РЅРёСЋ РёР»Рё в„–"
                size="small"
                sx={{ minWidth: 200, flex: 1 }}
                value={projectDialogTaskSearch}
                onChange={(e) => setProjectDialogTaskSearch(e.target.value)}
              />
            </Stack>
            <Stack spacing={0.5} sx={{ maxHeight: 260, overflow: 'auto' }}>
              {projectDialogTasks.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  РќРµС‚ Р·Р°РґР°С‡ СЃ РїСЂРёРІСЏР·РєРѕР№ Рє СЌС‚РѕРјСѓ РїСЂРѕРµРєС‚Сѓ.
                </Typography>
              ) : projectDialogTasksFiltered.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  РќРµС‚ Р·Р°РґР°С‡ РїРѕ С‚РµРєСѓС‰РёРј С„РёР»СЊС‚СЂР°Рј (РІСЃРµРіРѕ Р·Р°РіСЂСѓР¶РµРЅРѕ: {projectDialogTasks.length}).
                </Typography>
              ) : (
                projectDialogTasksFiltered.slice(0, 80).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeProjectDialog();
                    }}
                  >
                    #{t.id} В· {t.title.length > 48 ? `${t.title.slice(0, 48)}вЂ¦` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                label="РќР°Р·РІР°РЅРёРµ РїРѕРґРїСЂРѕРµРєС‚Р°"
                value={subprojectName}
                onChange={(e) => setSubprojectName(e.target.value)}
                disabled={!canEditProjectDialogContent}
              />
              <Button variant="contained" onClick={createSubproject} disabled={!canEditProjectDialogContent}>
                РЎРѕР·РґР°С‚СЊ РїРѕРґРїСЂРѕРµРєС‚
              </Button>
            </Stack>
            <Divider />
            <Typography variant="subtitle2">Р”РµСЂРµРІРѕ РїРѕРґРїСЂРѕРµРєС‚РѕРІ</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              РџРµСЂРµРЅРѕСЃ: РІР»Р°РґРµР»РµС† РїРѕРґРїСЂРѕРµРєС‚Р° РёР»Рё СЂРѕР»СЊ СЃ РїРѕР»РЅС‹Рј РґРѕСЃС‚СѓРїРѕРј Рє РјРѕРґСѓР»СЋ. Р РѕРґРёС‚РµР»СЊ РјРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ СЃСЂРµРґРё РІРёРґРёРјС‹С…
              РїСЂРѕРµРєС‚РѕРІ; С†РёРєР»С‹ Р±Р»РѕРєРёСЂСѓСЋС‚СЃСЏ РЅР° СЃРµСЂРІРµСЂРµ.
            </Typography>
            {subprojectTreeRooted.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                РќРµС‚ РІР»РѕР¶РµРЅРЅС‹С… РїРѕРґРїСЂРѕРµРєС‚РѕРІ. РЎРѕР·РґР°Р№С‚Рµ РІС‹С€Рµ РёР»Рё РїРµСЂРµРЅРµСЃРёС‚Рµ СЃСЋРґР° РїРѕРґРїСЂРѕРµРєС‚ РёР· РґСЂСѓРіРѕРіРѕ РїСЂРѕРµРєС‚Р° (СЃРјРµРЅРёРІ
                СЂРѕРґРёС‚РµР»СЏ РЅР° В«{projectDialog?.name} (С‚РµРєСѓС‰РёР№ РїСЂРѕРµРєС‚)В»).
              </Typography>
            ) : (
              <Stack
                spacing={0}
                sx={{
                  maxHeight: 320,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                {subprojectTreeRooted.map((node) => (
                  <OwnerWorkspaceSubprojectTreeRow
                    key={node.project.id}
                    node={node}
                    depth={0}
                    catalog={projectsCatalog}
                    contextRootId={projectDialog!.id}
                    isWorkspaceFullAccess={isWorkspaceFullAccess}
                    currentUserId={user?.id}
                    onApplied={refreshProjectDialogAfterHierarchyChange}
                    setError={setError}
                  />
                ))}
              </Stack>
            )}
            <Divider />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => `${o.full_name} В· ${o.phone}`}
              value={linkContactId}
              onChange={(_, v) => setLinkContactId(v)}
              disabled={!canEditProjectDialogContent}
              renderInput={(params) => <TextField {...params} label="Р”РѕР±Р°РІРёС‚СЊ РєРѕРЅС‚Р°РєС‚ РІ РїСЂРѕРµРєС‚" />}
            />
            <Button variant="outlined" onClick={linkContactToProject} disabled={!linkContactId || !canEditProjectDialogContent}>
              РџСЂРёРІСЏР·Р°С‚СЊ РєРѕРЅС‚Р°РєС‚
            </Button>
            {projectDialogLinkedContacts.length > 0 && (
              <>
                <Typography variant="subtitle2">РљРѕРЅС‚Р°РєС‚С‹ РІ РїСЂРѕРµРєС‚Рµ</Typography>
                <Stack spacing={0.5} sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {projectDialogLinkedContacts.map((c) => (
                    <Box
                      key={c.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        py: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {c.full_name} В· {c.phone}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="РЈР±СЂР°С‚СЊ РєРѕРЅС‚Р°РєС‚ РёР· РїСЂРѕРµРєС‚Р°"
                        disabled={!canEditProjectDialogContent}
                        onClick={() => requestRemoveContactFromProject(c.id)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            <Typography variant="subtitle2">РЈС‡Р°СЃС‚РЅРёРєРё РїСЂРѕРµРєС‚Р°</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              <strong>РњРµРЅРµРґР¶РµСЂ</strong> РІРµРґС‘С‚ СЃРѕСЃС‚Р°РІ (РґРѕР±Р°РІР»СЏРµС‚/РёСЃРєР»СЋС‡Р°РµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ, РЅРѕ РЅРµ РґСЂСѓРіРёС… РјРµРЅРµРґР¶РµСЂРѕРІ).
              РќР°Р·РЅР°С‡Р°С‚СЊ РјРµРЅРµРґР¶РµСЂРѕРІ РјРѕР¶РµС‚ <strong>РІР»Р°РґРµР»РµС† РїСЂРѕРµРєС‚Р°</strong> РёР»Рё admin/owner РїРѕСЂС‚Р°Р»Р°.
            </Typography>
            <Stack spacing={0.75}>
              {(projectDialog?.participants || []).map((pid) => {
                const rawRole = projectDialog?.participant_roles?.[String(pid)];
                const role: OwnerWorkspaceProjectParticipantRole =
                  rawRole === 'manager' || rawRole === 'observer' ? rawRole : 'member';
                const canDel =
                  canManageProjectTeam &&
                  (isWorkspaceFullAccess || projectDialog?.owner_id === user?.id || role !== 'manager');
                return (
                  <Stack key={pid} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Chip
                      size="small"
                      label={`${userName(pid)} В· ${OWNER_WS_PROJECT_PARTICIPANT_ROLE_LABELS[role]}`}
                      onDelete={canDel ? () => requestRemoveProjectParticipantUser(pid, role) : undefined}
                    />
                    {canChangeParticipantRoles ? (
                      <TextField
                        select
                        size="small"
                        label="Роль"
                        sx={{ minWidth: 170 }}
                        value={role}
                        onChange={(e) =>
                          void patchProjectParticipantRole(pid, e.target.value as OwnerWorkspaceProjectParticipantRole)
                        }
                      >
                        <MenuItem value="member">Участник</MenuItem>
                        <MenuItem value="manager">Менеджер</MenuItem>
                        <MenuItem value="observer">Наблюдатель</MenuItem>
                      </TextField>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
            {canManageProjectTeam && !canChangeParticipantRoles ? (
              <Alert severity="info">
                Менеджер проекта может управлять составом команды, но не назначает роли manager и observer.
              </Alert>
            ) : null}
            {canManageProjectTeam ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Autocomplete
                  sx={{ flex: 1 }}
                  options={userOptions.filter((u) => !(projectDialog?.participants || []).includes(u.id))}
                  getOptionLabel={(o) => o.full_name}
                  value={participantToAdd}
                  onChange={(_, v) => setParticipantToAdd(v)}
                  renderInput={(params) => <TextField {...params} label="Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°" />}
                />
                {canChangeParticipantRoles ? (
                  <TextField
                    select
                    size="small"
                    label="Р РѕР»СЊ"
                    sx={{ minWidth: 160 }}
                    value={newParticipantRole}
                    onChange={(e) => setNewParticipantRole(e.target.value as OwnerWorkspaceProjectParticipantRole)}
                  >
                    <MenuItem value="member">РЈС‡Р°СЃС‚РЅРёРє</MenuItem>
                    <MenuItem value="manager">РњРµРЅРµРґР¶РµСЂ</MenuItem>
                    <MenuItem value="observer">РќР°Р±Р»СЋРґР°С‚РµР»СЊ</MenuItem>
                  </TextField>
                ) : null}
                <Button variant="outlined" onClick={addProjectParticipantUser} disabled={!participantToAdd}>
                  Р”РѕР±Р°РІРёС‚СЊ
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          {projectDialog?.status !== 'archived' && (
            <Button color="error" onClick={() => setArchiveProjectConfirm(projectDialog)} disabled={!canEditProjectDialogContent}>
              Р’ Р°СЂС…РёРІ
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeProjectDialog}>Р—Р°РєСЂС‹С‚СЊ</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(archiveProjectConfirm)} onClose={() => setArchiveProjectConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>РђСЂС…РёРІРёСЂРѕРІР°С‚СЊ РїСЂРѕРµРєС‚?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {(archiveProjectConfirm?.subprojects_count ?? 0) > 0 && (
              <Alert severity="warning">
                РЈ РїСЂРѕРµРєС‚Р° РµСЃС‚СЊ РїРѕРґРїСЂРѕРµРєС‚С‹ ({archiveProjectConfirm!.subprojects_count}). РћРЅРё РѕСЃС‚Р°РЅСѓС‚СЃСЏ СЃ РїСЂРёРІСЏР·РєРѕР№ Рє СЌС‚РѕРјСѓ
                РїСЂРѕРµРєС‚Сѓ РєР°Рє Рє СЂРѕРґРёС‚РµР»СЋ.
              </Alert>
            )}
            {(archiveProjectConfirm?.active_tasks_count ?? 0) > 0 && (
              <Alert severity="warning">
                Р•СЃС‚СЊ Р°РєС‚РёРІРЅС‹Рµ Р·Р°РґР°С‡Рё: {archiveProjectConfirm!.active_tasks_count}. РЎС‚Р°С‚СѓСЃС‹ Р·Р°РґР°С‡ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РЅРµ
                РјРµРЅСЏСЋС‚СЃСЏ вЂ” РїСЂРѕРІРµСЂСЊС‚Рµ РІСЂСѓС‡РЅСѓСЋ РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё.
              </Alert>
            )}
            {(archiveProjectConfirm?.overdue_tasks_count ?? 0) > 0 && (
              <Alert severity="warning">
                РЎСЂРµРґРё Р°РєС‚РёРІРЅС‹С… Р·Р°РґР°С‡ РµСЃС‚СЊ РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Рµ: {archiveProjectConfirm!.overdue_tasks_count}.
              </Alert>
            )}
            <Typography variant="body2">
              РџСЂРѕРµРєС‚ В«{archiveProjectConfirm?.name}В» Р±СѓРґРµС‚ РїРµСЂРµРІРµРґС‘РЅ РІ СЃС‚Р°С‚СѓСЃ В«archivedВ». РџСЂРѕРґРѕР»Р¶РёС‚СЊ?
            </Typography>
            {(archiveProjectConfirm?.active_tasks_count ?? 0) > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => reviewArchiveProjectTasks(archiveProjectConfirm!.id)}>
                  РћС‚РєСЂС‹С‚СЊ Р°РєС‚РёРІРЅС‹Рµ Р·Р°РґР°С‡Рё
                </Button>
                {(archiveProjectConfirm?.overdue_tasks_count ?? 0) > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    onClick={() => reviewArchiveProjectTasks(archiveProjectConfirm!.id, true)}
                  >
                    РћС‚РєСЂС‹С‚СЊ С‚РѕР»СЊРєРѕ РїСЂРѕСЃСЂРѕС‡РєСѓ
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveProjectConfirm(null)}>РћС‚РјРµРЅР°</Button>
          <Button color="error" variant="contained" onClick={() => void submitArchiveProject()} disabled={!canEditProjectDialogContent}>
            Р’ Р°СЂС…РёРІ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTaskConfirm)} onClose={() => setDeleteTaskConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>РЈРґР°Р»РёС‚СЊ Р·Р°РґР°С‡Сѓ?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Alert severity="error">
              Р—Р°РґР°С‡Р° Р±СѓРґРµС‚ СѓРґР°Р»РµРЅР° Р±РµР· РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РёР· РёРЅС‚РµСЂС„РµР№СЃР°.
            </Alert>
            <Typography variant="body2">
              Р—Р°РґР°С‡Р°: <strong>{deleteTaskConfirm?.title || '—'}</strong>
            </Typography>
            <Stack spacing={0.75}>
              {deleteTaskSummary.map((item) => (
                <Typography key={item} variant="body2" color="text.secondary">
                  • {item}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTaskConfirm(null)}>РћС‚РјРµРЅР°</Button>
          <Button color="error" variant="contained" onClick={() => void submitDeleteTask()} disabled={!isWorkspaceFullAccess}>
            РЈРґР°Р»РёС‚СЊ РЅР°РІСЃРµРіРґР°
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(unlinkContactConfirm)} onClose={() => setUnlinkContactConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>РЈР±СЂР°С‚СЊ РєРѕРЅС‚Р°РєС‚ РёР· РїСЂРѕРµРєС‚Р°?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              РљРѕРЅС‚Р°РєС‚ <strong>{unlinkContactConfirm?.contactName || '—'}</strong> Р±СѓРґРµС‚ РѕС‚РІСЏР·Р°РЅ РѕС‚ РїСЂРѕРµРєС‚Р°{' '}
              <strong>{unlinkContactConfirm?.projectName || '—'}</strong>.
            </Typography>
            <Alert severity="info">
              РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р° РІ СЃРёСЃС‚РµРјРµ СЃРѕС…СЂР°РЅРёС‚СЃСЏ. РЈР±РµСЂС‘С‚СЃСЏ С‚РѕР»СЊРєРѕ РїСЂРёРІСЏР·РєР° Рє СЌС‚РѕРјСѓ РїСЂРѕРµРєС‚Сѓ.
            </Alert>
            {(unlinkContactConfirm?.activeTaskCount ?? 0) > 0 && (
              <Alert severity="warning">
                РЈ СЌС‚РѕР№ СЃРІСЏР·РєРё РµСЃС‚СЊ Р°РєС‚РёРІРЅС‹Рµ Р·Р°РґР°С‡Рё: {unlinkContactConfirm!.activeTaskCount}. РџСЂРѕРІРµСЂСЊС‚Рµ, РЅСѓР¶РЅРѕ Р»Рё СЃРЅР°С‡Р°Р»Р° РїРµСЂРµРЅРµСЃС‚Рё РёС… РІ РґСЂСѓРіРѕР№ РїСЂРѕРµРєС‚.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkContactConfirm(null)}>РћС‚РјРµРЅР°</Button>
          <Button color="warning" variant="contained" onClick={() => void submitUnlinkContactFromProject()}>
            РЈР±СЂР°С‚СЊ РёР· РїСЂРѕРµРєС‚Р°
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(removeParticipantConfirm)} onClose={() => setRemoveParticipantConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>РЈРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° РёР· РїСЂРѕРµРєС‚Р°?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              РЈС‡Р°СЃС‚РЅРёРє <strong>{removeParticipantConfirm?.userName || '—'}</strong> Р±СѓРґРµС‚ СѓР±СЂР°РЅ РёР· РїСЂРѕРµРєС‚Р°{' '}
              <strong>{removeParticipantConfirm?.projectName || '—'}</strong>.
            </Typography>
            <Alert severity="info">
              РЈС‡Р°СЃС‚РЅРёРє РїРѕС‚РµСЂСЏРµС‚ РґРѕСЃС‚СѓРї Рє РїСЂРѕРµРєС‚Сѓ Рё РµРіРѕ РєРѕРЅС‚РµРЅС‚Сѓ С‡РµСЂРµР· owner-workspace.
            </Alert>
            {removeParticipantConfirm?.role === 'manager' && (
              <Alert severity="warning">
                РЈРґР°Р»СЏРµС‚СЃСЏ РјРµРЅРµРґР¶РµСЂ РїСЂРѕРµРєС‚Р°. РџРѕСЃР»Рµ СЌС‚РѕРіРѕ РѕРЅ Р±РѕР»СЊС€Рµ РЅРµ СЃРјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ СЃРѕСЃС‚Р°РІРѕРј РєРѕРјР°РЅРґС‹.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveParticipantConfirm(null)}>РћС‚РјРµРЅР°</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => removeParticipantConfirm && void removeProjectParticipantUser(removeParticipantConfirm.userId)}
          >
            РЈРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР°
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(contactDialog)} onClose={closeContactDialog} maxWidth="md" fullWidth>
        <DialogTitle>{contactDialog?.full_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!canEditContactDialogContent && (
              <Alert severity="info">
                Р­С‚РѕС‚ РєРѕРЅС‚Р°РєС‚ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. РР·РјРµРЅРµРЅРёРµ РєР°СЂС‚РѕС‡РєРё, РїСЂРёРІСЏР·РѕРє, Р·Р°РґР°С‡ Рё СЃРѕРѕР±С‰РµРЅРёР№ РѕС‚РєР»СЋС‡РµРЅРѕ.
              </Alert>
            )}
            <Typography variant="subtitle2">РљР°СЂС‚РѕС‡РєР° РєРѕРЅС‚Р°РєС‚Р°</Typography>
            <TextField
              fullWidth
              label="Р¤РРћ"
              value={contactEditFullName}
              onChange={(e) => setContactEditFullName(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <TextField
              fullWidth
              label="РўРµР»РµС„РѕРЅ"
              value={contactEditPhone}
              onChange={(e) => setContactEditPhone(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <TextField
              fullWidth
              label="Email"
              value={contactEditEmail}
              onChange={(e) => setContactEditEmail(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                label="РљРѕРјРїР°РЅРёСЏ"
                value={contactEditCompany}
                onChange={(e) => setContactEditCompany(e.target.value)}
                disabled={!canEditContactDialogContent}
              />
              <TextField
                fullWidth
                label="Р”РѕР»Р¶РЅРѕСЃС‚СЊ"
                value={contactEditPosition}
                onChange={(e) => setContactEditPosition(e.target.value)}
                disabled={!canEditContactDialogContent}
              />
            </Stack>
            <TextField
              fullWidth
              label="РўРµРіРё (С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ)"
              value={contactEditTags}
              onChange={(e) => setContactEditTags(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <TextField
              fullWidth
              label="РљРѕРјРјРµРЅС‚Р°СЂРёР№"
              multiline
              minRows={2}
              value={contactEditComment}
              onChange={(e) => setContactEditComment(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <TextField
              fullWidth
              label="РСЃС‚РѕС‡РЅРёРє"
              value={contactEditSource}
              onChange={(e) => setContactEditSource(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <Button
              variant="contained"
              onClick={() => void saveContactDetails()}
              sx={{ alignSelf: 'flex-start' }}
              disabled={!canEditContactDialogContent}
            >
              РЎРѕС…СЂР°РЅРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ
            </Button>
            <Divider />
            <Typography variant="subtitle2">РџСЂРѕРµРєС‚С‹</Typography>
            {contactDialogLinkedProjects.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                РќРµ РїСЂРёРІСЏР·Р°РЅ РЅРё Рє РѕРґРЅРѕРјСѓ РїСЂРѕРµРєС‚Сѓ. РќРёР¶Рµ РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
                {contactDialogLinkedProjects.map((p) => (
                  <Box
                    key={p.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 0.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 0 }}>
                      {p.name}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="РЈР±СЂР°С‚СЊ РёР· РїСЂРѕРµРєС‚Р°"
                      disabled={!canEditContactDialogContent}
                      onClick={() => requestRemoveContactFromLinkedProject(p.id)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={projectsCatalogSorted}
                getOptionLabel={(o) => o.name}
                value={contactLinkProjectId}
                onChange={(_, v) => setContactLinkProjectId(v)}
                disabled={!canEditContactDialogContent}
                renderInput={(params) => <TextField {...params} label="Р”РѕР±Р°РІРёС‚СЊ РІ РїСЂРѕРµРєС‚" />}
              />
              <Button
                variant="contained"
                onClick={linkContactToSelectedProject}
                disabled={!contactLinkProjectId || !canEditContactDialogContent}
              >
                Р”РѕР±Р°РІРёС‚СЊ
              </Button>
            </Stack>
            <Typography variant="subtitle2">Р—Р°РґР°С‡Рё РїРѕ РєРѕРЅС‚Р°РєС‚Сѓ</Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              disabled={!canEditContactDialogContent}
              onClick={() => {
                if (!contactDialog) return;
                setNewTaskContactId(contactDialog.id);
                handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
                closeContactDialog();
              }}
            >
              РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ РїРѕ СЌС‚РѕРјСѓ РєРѕРЅС‚Р°РєС‚Сѓ
            </Button>
            <Typography variant="caption" color="text.secondary">
              РђРєС‚РёРІРЅС‹Рµ: {contactDialogTasksActive.length} В· Р·Р°РІРµСЂС€С‘РЅРЅС‹Рµ / РѕС‚РјРµРЅС‘РЅРЅС‹Рµ: {contactDialogTasksDone.length}
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              РђРєС‚РёРІРЅС‹Рµ
            </Typography>
            <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
              {contactDialogTasksActive.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  РќРµС‚ Р°РєС‚РёРІРЅС‹С… Р·Р°РґР°С‡.
                </Typography>
              ) : (
                contactDialogTasksActive.slice(0, 50).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeContactDialog();
                    }}
                  >
                    #{t.id} В· {t.title.length > 48 ? `${t.title.slice(0, 48)}вЂ¦` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Typography variant="caption" fontWeight={600}>
              Р—Р°РІРµСЂС€С‘РЅРЅС‹Рµ Рё РѕС‚РјРµРЅС‘РЅРЅС‹Рµ
            </Typography>
            <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
              {contactDialogTasksDone.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  РќРµС‚ Р·Р°РІРµСЂС€С‘РЅРЅС‹С… РёР»Рё РѕС‚РјРµРЅС‘РЅРЅС‹С….
                </Typography>
              ) : (
                contactDialogTasksDone.slice(0, 50).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeContactDialog();
                    }}
                  >
                    #{t.id} В· {t.title.length > 48 ? `${t.title.slice(0, 48)}вЂ¦` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Divider />
            <Typography variant="subtitle2">РџРµСЂРµРїРёСЃРєР° (СЂСѓС‡РЅРѕР№ РІРІРѕРґ РґР»СЏ MVP)</Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="РЎРѕРѕР±С‰РµРЅРёРµ"
              value={newContactMessage}
              onChange={(e) => setNewContactMessage(e.target.value)}
              disabled={!canEditContactDialogContent}
            />
            <Button variant="outlined" onClick={sendContactMessage} disabled={!canEditContactDialogContent}>
              РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє РёСЃС…РѕРґСЏС‰РµРµ
            </Button>
            <TextField
              size="small"
              fullWidth
              placeholder="РџРѕРёСЃРє РїРѕ С‚РµРєСЃС‚Сѓ СЃРѕРѕР±С‰РµРЅРёР№вЂ¦"
              value={contactMessageSearch}
              onChange={(e) => setContactMessageSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            {contactMessageSearch.trim() && (
              <Typography variant="caption" color="text.secondary">
                РџРѕРєР°Р·Р°РЅРѕ {contactMessagesFiltered.length} РёР· {contactMessages.length}
              </Typography>
            )}
            <Stack spacing={1} sx={{ maxHeight: 240, overflow: 'auto' }}>
              {contactMessagesFiltered.map((m) => (
                <Box key={m.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption">{m.direction}</Typography>
                  <Typography variant="body2">{m.text}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeContactDialog}>Р—Р°РєСЂС‹С‚СЊ</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(taskDialog)} onClose={closeTaskDialog} maxWidth="md" fullWidth>
        <DialogTitle>Р—Р°РґР°С‡Р° #{taskDialog?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              РђРІС‚РѕСЂ: {userName(taskDialog?.creator_id)} В· РЎРѕР·РґР°РЅР°:{' '}
              {taskDialog?.created_at
                ? new Date(taskDialog.created_at).toLocaleString('ru-RU')
                : 'вЂ”'}
              {taskDialog?.updated_at
                ? ` В· РћР±РЅРѕРІР»РµРЅР°: ${new Date(taskDialog.updated_at).toLocaleString('ru-RU')}`
                : ''}
            </Typography>
            {taskDialog?.previous_task_id != null && (
              <Button size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => void openPreviousWorkspaceTask()}>
                РћС‚РєСЂС‹С‚СЊ РїСЂРµРґС‹РґСѓС‰СѓСЋ Р·Р°РґР°С‡Сѓ #{taskDialog.previous_task_id}
              </Button>
            )}
            {taskFormLocked && (
              <Alert severity="info">
                Р—Р°РґР°С‡Р° Р·Р°РІРµСЂС€РµРЅР° РёР»Рё РѕС‚РјРµРЅРµРЅР°: РјРµРЅСЏР№С‚Рµ С‚РѕР»СЊРєРѕ <strong>СЃС‚Р°С‚СѓСЃ</strong>, С‡С‚РѕР±С‹ РІРµСЂРЅСѓС‚СЊ РІ СЂР°Р±РѕС‚Сѓ. РџРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃ Р°РєС‚РёРІРЅС‹Рј СЃС‚Р°С‚СѓСЃРѕРј РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїРѕР»СЏ СЃРЅРѕРІР° СЃС‚Р°РЅСѓС‚ РґРѕСЃС‚СѓРїРЅС‹.
              </Alert>
            )}
            {!canEditTaskDialogContent && (
              <Alert severity="info">
                Р”Р»СЏ РІР°С€РµР№ СЂРѕР»Рё СЌС‚Р° Р·Р°РґР°С‡Р° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Рё РєРѕРјРјРµРЅС‚Р°СЂРёРё РѕС‚РєР»СЋС‡РµРЅС‹.
              </Alert>
            )}
            <TextField
              label="РќР°Р·РІР°РЅРёРµ"
              fullWidth
              value={taskEditTitle}
              onChange={(e) => setTaskEditTitle(e.target.value)}
              disabled={taskDialogReadOnly}
            />
            <TextField
              label="РћРїРёСЃР°РЅРёРµ"
              fullWidth
              multiline
              minRows={3}
              value={taskEditDescription}
              onChange={(e) => setTaskEditDescription(e.target.value)}
              disabled={taskDialogReadOnly}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                select
                label="РЎС‚Р°С‚СѓСЃ"
                fullWidth
                value={taskEditStatus}
                onChange={(e) => setTaskEditStatus(coerceTaskStatus(e.target.value))}
                disabled={!canEditTaskDialogContent}
              >
                {editStatusOptions.map((k) => (
                  <MenuItem key={k} value={k}>
                    {statusLabels[k] ?? k}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="РџСЂРёРѕСЂРёС‚РµС‚"
                fullWidth
                value={taskEditPriority}
                onChange={(e) => setTaskEditPriority(coerceTaskPriority(e.target.value))}
                disabled={taskDialogReadOnly}
              >
                {editPriorityOptions.map((k) => (
                  <MenuItem key={k} value={k}>
                    {priorityLabels[k] ?? k}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Р”РµРґР»Р°Р№РЅ"
              type="datetime-local"
              value={taskEditDeadline}
              onChange={(e) => setTaskEditDeadline(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              disabled={taskDialogReadOnly}
            />
            <TextField
              label="РќР°С‡Р°Р»Рѕ (start_at)"
              type="datetime-local"
              value={taskEditStartAt}
              onChange={(e) => setTaskEditStartAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              disabled={taskDialogReadOnly}
            />
            <Autocomplete
              options={projectsCatalogSorted}
              getOptionLabel={(o) => o.name}
              value={projectsCatalogSorted.find((p) => p.id === taskEditProjectId) || null}
              onChange={(_, v) => setTaskEditProjectId(v ? v.id : '')}
              disabled={taskDialogReadOnly}
              renderInput={(params) => <TextField {...params} label="РџСЂРѕРµРєС‚" />}
            />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => o.full_name}
              value={contactsCatalogSorted.find((c) => c.id === taskEditContactId) || null}
              onChange={(_, v) => setTaskEditContactId(v ? v.id : '')}
              disabled={taskDialogReadOnly}
              renderInput={(params) => <TextField {...params} label="РљРѕРЅС‚Р°РєС‚" />}
            />
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === taskEditAssigneeId) || null}
              onChange={(_, v) => setTaskEditAssigneeId(v ? v.id : '')}
              disabled={taskDialogReadOnly}
              renderInput={(params) => <TextField {...params} label="РСЃРїРѕР»РЅРёС‚РµР»СЊ" />}
            />
            <Autocomplete
              multiple
              freeSolo
              options={[] as string[]}
              value={taskEditTags}
              onChange={(_, v) => setTaskEditTags(v.map(String))}
              disabled={taskDialogReadOnly}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="РўРµРіРё" placeholder="Р’РІРѕРґ Рё Enter" />}
            />
            <Typography variant="subtitle2">Р§РµРєР»РёСЃС‚</Typography>
            {taskEditChecklist.map((item, idx) => (
              <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                <Checkbox
                  checked={item.done}
                  disabled={taskDialogReadOnly}
                  onChange={() => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, done: !item.done };
                    setTaskEditChecklist(next);
                  }}
                />
                <TextField
                  size="small"
                  fullWidth
                  value={item.text}
                  disabled={taskDialogReadOnly}
                  onChange={(e) => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, text: e.target.value };
                    setTaskEditChecklist(next);
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="РЈРґР°Р»РёС‚СЊ РїСѓРЅРєС‚"
                  disabled={taskDialogReadOnly}
                  onClick={() => setTaskEditChecklist(taskEditChecklist.filter((_, i) => i !== idx))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              variant="text"
              disabled={taskDialogReadOnly}
              onClick={() =>
                setTaskEditChecklist((prev) => [...prev, { id: `n-${Date.now()}`, text: '', done: false }])
              }
            >
              + РџСѓРЅРєС‚ С‡РµРєР»РёСЃС‚Р°
            </Button>
            <Divider />
            <Typography variant="subtitle2">Р’Р»РѕР¶РµРЅРёСЏ (JSON-РјР°СЃСЃРёРІ)</Typography>
            <Typography variant="caption" color="text.secondary">
              РќР°РїСЂРёРјРµСЂ: [&#123; &quot;url&quot;: &quot;https://вЂ¦&quot;, &quot;name&quot;: &quot;Р”РѕРєСѓРјРµРЅС‚&quot; &#125;]
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={4}
              value={taskEditAttachmentsText}
              onChange={(e) => setTaskEditAttachmentsText(e.target.value)}
              disabled={taskDialogReadOnly}
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
            />
            {(taskDialog?.linked_message_ids?.length ?? 0) > 0 && (
              <Typography variant="caption" color="text.secondary">
                РЎРІСЏР·Р°РЅРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ (id): {taskDialog!.linked_message_ids!.join(', ')}
              </Typography>
            )}
            <Divider />
            <Typography variant="subtitle2">РСЃС‚РѕСЂРёСЏ РёР·РјРµРЅРµРЅРёР№ (СЌС‚Р° Р·Р°РґР°С‡Р°)</Typography>
            <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {taskDialogHistory.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Р—Р°РїРёСЃРµР№ Р°СѓРґРёС‚Р° РїРѕ СЌС‚РѕР№ Р·Р°РґР°С‡Рµ РїРѕРєР° РЅРµС‚.
                </Typography>
              )}
              {taskDialogHistory.map((h) => (
                <Box key={h.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''} В· {userName(h.author_id)}
                  </Typography>
                  <Typography variant="body2">{h.action_type}</Typography>
                </Box>
              ))}
            </Stack>
            <Typography variant="subtitle2">РљРѕРјРјРµРЅС‚Р°СЂРёРё</Typography>
            <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {taskComments.map((c) => (
                <Box key={c.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : ''}
                  </Typography>
                  <Typography variant="body2">{c.text}</Typography>
                </Box>
              ))}
            </Stack>
            <TextField
              fullWidth
              label="РќРѕРІС‹Р№ РєРѕРјРјРµРЅС‚Р°СЂРёР№"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              disabled={!canEditTaskDialogContent}
              helperText="РЈРїРѕРјРёРЅР°РЅРёРµ: @ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё @email@РґРѕРјРµРЅ вЂ” РѕС‚РґРµР»СЊРЅРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ С‚РµРј, РєРѕРјСѓ СѓР¶Рµ РІРёРґРЅР° Р·Р°РґР°С‡Р° (РёСЃРїРѕР»РЅРёС‚РµР»СЊ Рё Р°РІС‚РѕСЂ РїРѕР»СѓС‡Р°СЋС‚ РѕР±С‹С‡РЅС‹Р№ В«РљРѕРјРјРµРЅС‚Р°СЂРёР№В»)."
            />
            <Button variant="outlined" onClick={addComment} disabled={!canEditTaskDialogContent}>
              Р”РѕР±Р°РІРёС‚СЊ РєРѕРјРјРµРЅС‚Р°СЂРёР№
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            {isWorkspaceFullAccess && (
              <Button color="error" variant="outlined" onClick={() => setDeleteTaskConfirm(taskDialog)}>
                РЈРґР°Р»РёС‚СЊ Р·Р°РґР°С‡Сѓ
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={closeTaskDialog}>РћС‚РјРµРЅР°</Button>
            <Button variant="contained" onClick={saveTaskDialog} disabled={!canEditTaskDialogContent}>
              РЎРѕС…СЂР°РЅРёС‚СЊ
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(completeDialogTask)} onClose={() => setCompleteDialogTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Р—Р°РІРµСЂС€РёС‚СЊ Р·Р°РґР°С‡Сѓ</DialogTitle>
        <DialogContent>
          {completeDialogTask && !canMutateTaskUi(completeDialogTask) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Р”Р»СЏ РІР°С€РµР№ СЂРѕР»Рё СЌС‚Р° Р·Р°РґР°С‡Р° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. Р—Р°РІРµСЂС€РµРЅРёРµ РѕС‚РєР»СЋС‡РµРЅРѕ.
            </Alert>
          )}
          <RadioGroup value={completeMode} onChange={(e) => setCompleteMode(e.target.value as typeof completeMode)}>
            <FormControlLabel value="close" control={<Radio />} label="РџСЂРѕСЃС‚Рѕ Р·Р°РєСЂС‹С‚СЊ" />
            <FormControlLabel
              value="close_and_create_next"
              control={<Radio />}
              label="Р—Р°РєСЂС‹С‚СЊ Рё СЃРѕР·РґР°С‚СЊ СЃР»РµРґСѓСЋС‰СѓСЋ"
            />
          </RadioGroup>
          {completeMode === 'close_and_create_next' && (
            <TextField
              fullWidth
              sx={{ mt: 2 }}
              label="РќР°Р·РІР°РЅРёРµ СЃР»РµРґСѓСЋС‰РµР№ Р·Р°РґР°С‡Рё"
              value={nextTaskTitle}
              onChange={(e) => setNextTaskTitle(e.target.value)}
              disabled={completeDialogTask ? !canMutateTaskUi(completeDialogTask) : false}
              placeholder="РћСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹Рј вЂ” РїРѕРґСЃС‚Р°РІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogTask(null)}>РћС‚РјРµРЅР°</Button>
          <Button variant="contained" onClick={submitComplete} disabled={completeDialogTask ? !canMutateTaskUi(completeDialogTask) : true}>
            РџРѕРґС‚РІРµСЂРґРёС‚СЊ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(messageTaskDialog)} onClose={() => setMessageTaskDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Р—Р°РґР°С‡Р° РёР· СЃРѕРѕР±С‰РµРЅРёСЏ</DialogTitle>
        <DialogContent>
          {messageTaskDialog && !canCreateTaskFromMessageUi && (
            <Alert severity="info" sx={{ mt: 1 }}>
              РљРѕРЅС‚Р°РєС‚ РёР· СЌС‚РѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°. РЎРѕР·РґР°РЅРёРµ Р·Р°РґР°С‡Рё РѕС‚РєР»СЋС‡РµРЅРѕ.
            </Alert>
          )}
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="РќР°Р·РІР°РЅРёРµ Р·Р°РґР°С‡Рё"
            value={messageTaskTitle}
            onChange={(e) => setMessageTaskTitle(e.target.value)}
            disabled={!canCreateTaskFromMessageUi}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageTaskDialog(null)}>РћС‚РјРµРЅР°</Button>
          <Button variant="contained" onClick={submitMessageTask} disabled={!canCreateTaskFromMessageUi}>
            РЎРѕР·РґР°С‚СЊ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(linkTaskDialog)} onClose={() => setLinkTaskDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>РџСЂРёРІСЏР·Р°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ Рє Р·Р°РґР°С‡Рµ</DialogTitle>
        <DialogContent>
          {linkTaskDialog && editableLinkTaskOptions.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… Р·Р°РґР°С‡ СЃ РїСЂР°РІРѕРј СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ РґР»СЏ РїСЂРёРІСЏР·РєРё СЌС‚РѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ.
            </Alert>
          )}
          <Autocomplete
            sx={{ mt: 1 }}
            options={editableLinkTaskOptions}
            getOptionLabel={(o) => `#${o.id} В· ${o.title}`}
            value={linkTaskSelected}
            onChange={(_, v) => setLinkTaskSelected(v)}
            renderInput={(params) => <TextField {...params} label="РђРєС‚РёРІРЅР°СЏ Р·Р°РґР°С‡Р°" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkTaskDialog(null)}>РћС‚РјРµРЅР°</Button>
          <Button
            variant="contained"
            disabled={!linkTaskSelected || !canMutateTaskUi(linkTaskSelected)}
            onClick={submitLinkToTask}
          >
            РџСЂРёРІСЏР·Р°С‚СЊ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>РџРѕРёСЃРє РїРѕ Р·Р°РґР°С‡РЅРёРєСѓ</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            margin="dense"
            label="Р—Р°РїСЂРѕСЃ"
            placeholder="РњРёРЅРёРјСѓРј 2 СЃРёРјРІРѕР»Р° вЂ” РїСЂРѕРµРєС‚С‹, РєРѕРЅС‚Р°РєС‚С‹, Р·Р°РґР°С‡Рё, РїРµСЂРµРїРёСЃРєР°"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Box sx={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
            {searchLoading && <CircularProgress size={24} />}
            {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
              <Typography variant="caption" color="text.secondary">
                Р’РІРµРґРёС‚Рµ РµС‰С‘ СЃРёРјРІРѕР»С‹
              </Typography>
            )}
          </Box>
          {searchResults && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  РџСЂРѕРµРєС‚С‹ ({searchResults.projects.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.projects.map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitProject(p.id)}
                    >
                      {p.name} В· {p.status}
                    </Button>
                  ))}
                  {searchResults.projects.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      вЂ”
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  РљРѕРЅС‚Р°РєС‚С‹ ({searchResults.contacts.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.contacts.map((c) => (
                    <Button
                      key={c.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitContact(c.id)}
                    >
                      {c.full_name} В· {c.phone}
                    </Button>
                  ))}
                  {searchResults.contacts.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      вЂ”
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Р—Р°РґР°С‡Рё ({searchResults.tasks.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.tasks.map((t) => (
                    <Button
                      key={t.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitTask(t.id)}
                    >
                      #{t.id} В· {t.title} ({statusLabels[t.status] || t.status})
                    </Button>
                  ))}
                  {searchResults.tasks.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      вЂ”
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  РЎРѕРѕР±С‰РµРЅРёСЏ ({(searchResults.messages ?? []).length})
                </Typography>
                <Stack spacing={0.25}>
                  {(searchResults.messages ?? []).map((m) => (
                    <Button
                      key={m.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', alignItems: 'flex-start' }}
                      onClick={() => void openSearchHitMessage(m.contact_id)}
                    >
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {m.contact_name || `РљРѕРЅС‚Р°РєС‚ #${m.contact_id}`} В·{' '}
                          {m.direction === 'incoming' ? 'РІС…РѕРґСЏС‰РµРµ' : m.direction === 'outgoing' ? 'РёСЃС…РѕРґСЏС‰РµРµ' : m.direction}
                          {m.created_at
                            ? ` В· ${new Date(m.created_at).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </Typography>
                        <Typography variant="body2">{m.text_preview}</Typography>
                      </Box>
                    </Button>
                  ))}
                  {(searchResults.messages ?? []).length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      вЂ”
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchOpen(false)}>Р—Р°РєСЂС‹С‚СЊ</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default OwnerWorkspacePage;
