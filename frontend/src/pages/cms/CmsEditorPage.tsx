import React, { useEffect, useState, useCallback } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Alert, Box, Button, CircularProgress, Chip, Divider, IconButton,
  List, ListItemButton, ListItemText, ListSubheader, Paper, Stack,
  Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import BoltIcon from '@mui/icons-material/Bolt';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Layout from '../../components/Layout';
import { cmsApi, mediaApi } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

// ─── Pages registry ───────────────────────────────────────────────────────────

const PAGE_GROUPS = [
  {
    group: 'Основные',
    pages: [
      { slug: 'home', label: 'Главная' },
      { slug: 'blog', label: '📝 Блог' },
      { slug: 'faq', label: 'FAQ' },
      { slug: 'o-nas', label: 'О нас' },
      { slug: 'kontakty', label: 'Контакты' },
    ],
  },
  {
    group: 'Треки',
    pages: [
      { slug: 'game-studio', label: '🎮 Игровая студия' },
      { slug: 'kodeks', label: '🔍 Кодэкс' },
      { slug: 'technolab', label: '⚙️ ТехноЛаб' },
    ],
  },
  {
    group: 'Услуги',
    pages: [
      { slug: 'besplatnyj-probnyj-urok', label: 'Пробный урок' },
      { slug: 'individualnye-zanyatiya', label: 'Инд. занятия' },
      { slug: 'podgotovka-k-oge-po-informatike', label: 'ОГЭ' },
      { slug: 'podgotovka-k-ege-po-informatike', label: 'ЕГЭ' },
      { slug: 'dostizheniya-uchenikov', label: 'Достижения' },
      { slug: 'aktivnosti', label: 'Активности' },
      { slug: 'igrovye-dzhemy', label: 'Игровые джемы' },
    ],
  },
  {
    group: 'SEO-страницы',
    pages: [
      { slug: 'programmirovanie-dlya-detej', label: 'Программирование' },
      { slug: 'python-dlya-detej', label: 'Python для детей' },
      { slug: 'razrabotka-igr-na-python', label: 'Игры на Python' },
      { slug: 'backend-razrabotka', label: 'Backend' },
      { slug: 'frontend-razrabotka', label: 'Frontend' },
      { slug: 'napravleniya-razrabotki', label: 'Направления' },
    ],
  },
  {
    group: 'Юридические',
    pages: [
      { slug: 'legal-oferta', label: '📄 Публичная оферта' },
      { slug: 'legal-privacy', label: '🔒 Политика конф.' },
      { slug: 'legal-terms', label: '📋 Пользоват. соглашение' },
    ],
  },
  {
    group: 'Оболочка сайта',
    pages: [
      { slug: 'header', label: '🔝 Шапка (навигация)' },
      { slug: 'footer', label: '🔻 Подвал (футер)' },
      { slug: 'branding', label: '🎨 Брендинг / Цвета' },
    ],
  },
];

const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TF({ label, value, onChange, multiline = false, rows = 1 }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number;
}) {
  return (
    <TextField label={label} value={value || ''} fullWidth size="small"
      multiline={multiline} minRows={multiline ? rows : undefined}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function StringListEditor({ label, items, onChange }: {
  label: string; items: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{label}</Typography>
      <Stack spacing={1}>
        {items.map((item, i) => (
          <Stack direction="row" spacing={1} key={i} alignItems="center">
            <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            <TextField size="small" fullWidth value={item}
              onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }} />
            <IconButton size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...items, ''])} sx={{ alignSelf: 'flex-start' }}>
          Добавить
        </Button>
      </Stack>
    </Box>
  );
}

function KVListEditor({ label, items, onChange, valueLabel = 'Значение', labelLabel = 'Подпись' }: {
  label: string; items: { value: string; label: string }[];
  onChange: (v: any[]) => void; valueLabel?: string; labelLabel?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{label}</Typography>
      <Stack spacing={1}>
        {items.map((item, i) => (
          <Stack direction="row" spacing={1} key={i} alignItems="center">
            <TextField size="small" label={valueLabel} value={item.value || ''} sx={{ flex: 1 }}
              onChange={(e) => { const n = [...items]; n[i] = { ...n[i], value: e.target.value }; onChange(n); }} />
            <TextField size="small" label={labelLabel} value={item.label || ''} sx={{ flex: 2 }}
              onChange={(e) => { const n = [...items]; n[i] = { ...n[i], label: e.target.value }; onChange(n); }} />
            <IconButton size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...items, { value: '', label: '' }])} sx={{ alignSelf: 'flex-start' }}>
          Добавить
        </Button>
      </Stack>
    </Box>
  );
}

function FaqSectionEditor({ items, onChange }: { items: { q: string; a: string }[]; onChange: (v: any[]) => void }) {
  return (
    <Stack spacing={2}>
      {items.map((item, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
          <Stack spacing={1.5}>
            <TextField label="Вопрос" size="small" fullWidth value={item.q || ''}
              onChange={(e) => { const n = [...items]; n[i] = { ...n[i], q: e.target.value }; onChange(n); }} />
            <TextField label="Ответ" size="small" fullWidth multiline minRows={2} value={item.a || ''}
              onChange={(e) => { const n = [...items]; n[i] = { ...n[i], a: e.target.value }; onChange(n); }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconButton size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Stack>
        </Paper>
      ))}
      <Button startIcon={<AddIcon />} variant="outlined" size="small"
        onClick={() => onChange([...items, { q: '', a: '' }])}>
        Добавить вопрос
      </Button>
    </Stack>
  );
}

// ─── Track editor ─────────────────────────────────────────────────────────────

function TrackEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const patch = (key: string, val: any) => onChange({ ...content, [key]: val });

  const howItWorks: any[] = content.howItWorks || [];
  const skills: string[] = content.skills || [];
  const forWhom = content.forWhom || { yes: [], no: [] };
  const review = content.review || {};
  const faq: any[] = content.faq || [];
  const tools: string[] = content.tools || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }} variant="scrollable" scrollButtons="auto">
        <Tab label="Основное" />
        <Tab label="Инструменты" />
        <Tab label={`Как работает (${howItWorks.length})`} />
        <Tab label={`Навыки (${skills.length})`} />
        <Tab label="Для кого" />
        <Tab label="Отзыв" />
        <Tab label={`FAQ (${faq.length})`} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок (H1)" value={content.narrativeH1 || ''} onChange={(v) => patch('narrativeH1', v)} />
          <TF label="Подзаголовок" value={content.subtitle || ''} onChange={(v) => patch('subtitle', v)} multiline rows={2} />
          <Stack direction="row" spacing={2}>
            <TF label="Возраст" value={content.age || ''} onChange={(v) => patch('age', v)} />
            <TF label="Формат" value={content.format || ''} onChange={(v) => patch('format', v)} />
            <TF label="Старт" value={content.start || ''} onChange={(v) => patch('start', v)} />
            <TF label="Эмодзи" value={content.emoji || ''} onChange={(v) => patch('emoji', v)} />
          </Stack>
        </Stack>
      )}

      {tab === 1 && (
        <StringListEditor label="Инструменты и технологии" items={tools} onChange={(v) => patch('tools', v)} />
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          {howItWorks.map((item, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Шаг (01 —)" value={item.step || ''} onChange={(v) => patch('howItWorks', howItWorks.map((x, idx) => idx === i ? { ...x, step: v } : x))} />
                  <TF label="Заголовок" value={item.title || ''} onChange={(v) => patch('howItWorks', howItWorks.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={item.desc || ''} onChange={(v) => patch('howItWorks', howItWorks.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => patch('howItWorks', howItWorks.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => patch('howItWorks', [...howItWorks, { step: `0${howItWorks.length + 1} —`, title: '', desc: '' }])} variant="outlined" size="small">
            Добавить шаг
          </Button>
        </Stack>
      )}

      {tab === 3 && (
        <StringListEditor label="Что освоит ученик" items={skills} onChange={(v) => patch('skills', v)} />
      )}

      {tab === 4 && (
        <Stack spacing={3}>
          <StringListEditor label="✅ Подходит если..." items={forWhom.yes || []}
            onChange={(v) => patch('forWhom', { ...forWhom, yes: v })} />
          <Divider />
          <StringListEditor label="❌ Лучше другой трек если..." items={forWhom.no || []}
            onChange={(v) => patch('forWhom', { ...forWhom, no: v })} />
        </Stack>
      )}

      {tab === 5 && (
        <Stack spacing={2}>
          <TF label="Текст отзыва" value={review.text || ''} onChange={(v) => patch('review', { ...review, text: v })} multiline rows={4} />
          <Stack direction="row" spacing={2}>
            <TF label="Имя" value={review.name || ''} onChange={(v) => patch('review', { ...review, name: v })} />
            <TF label="Роль" value={review.role || ''} onChange={(v) => patch('review', { ...review, role: v })} />
            <TF label="Инициалы" value={review.initials || ''} onChange={(v) => patch('review', { ...review, initials: v })} />
          </Stack>
        </Stack>
      )}

      {tab === 6 && <FaqSectionEditor items={faq} onChange={(v) => patch('faq', v)} />}
    </Box>
  );
}

// ─── Service page editors ─────────────────────────────────────────────────────

function TrialEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const benefits: any[] = content.benefits || [];
  const stats: any[] = content.stats || [];
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Преимущества (${benefits.length})`} /><Tab label={`Статистика (${stats.length})`} /><Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {benefits.map((b, i) => (
            <Stack direction="row" key={i} spacing={1} alignItems="center">
              <TextField size="small" fullWidth label={`Преимущество ${i + 1}`} value={b.text || ''}
                onChange={(e) => p('benefits', benefits.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))} />
              <IconButton size="small" onClick={() => p('benefits', benefits.filter((_, idx) => idx !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => p('benefits', [...benefits, { text: '' }])}>Добавить</Button>
        </Stack>
      )}
      {tab === 2 && <KVListEditor label="Блоки статистики" items={stats} onChange={(v) => p('stats', v)} />}
      {tab === 3 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function IndividualEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const advantages: any[] = content.advantages || [];
  const cases: any[] = content.cases || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Преимущества (${advantages.length})`} /><Tab label={`Случаи (${cases.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {advantages.map((a, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <TF label="Заголовок" value={a.title || ''} onChange={(v) => p('advantages', advantages.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                <TF label="Описание" value={a.desc || ''} onChange={(v) => p('advantages', advantages.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('advantages', advantages.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('advantages', [...advantages, { title: '', desc: '' }])} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
      {tab === 2 && (
        <Stack spacing={2}>
          {cases.map((c, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Тег" value={c.tag || ''} onChange={(v) => p('cases', cases.map((x, idx) => idx === i ? { ...x, tag: v } : x))} />
                  <TF label="Заголовок" value={c.title || ''} onChange={(v) => p('cases', cases.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={c.desc || ''} onChange={(v) => p('cases', cases.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('cases', cases.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('cases', [...cases, { tag: '', title: '', desc: '' }])} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
    </Box>
  );
}

function ExamEditor({ content, onChange, isEge = false }: {
  content: any; onChange: (c: any) => void; isEge?: boolean;
}) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const topics: any[] = content.topics || [];
  const blocks: any[] = content.blocks || [];
  const results: any[] = content.results || [];
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" />
        <Tab label={isEge ? `Блоки (${blocks.length})` : `Темы (${topics.length})`} />
        <Tab label={`Результаты (${results.length})`} />
        <Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && !isEge && (
        <Stack spacing={2}>
          {topics.map((t, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Номер" value={t.num || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, num: v } : x))} />
                  <TF label="Заголовок" value={t.title || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={t.desc || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('topics', topics.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('topics', [...topics, { num: '', title: '', desc: '' }])} variant="outlined" size="small">Добавить тему</Button>
        </Stack>
      )}
      {tab === 1 && isEge && (
        <Stack spacing={2}>
          {blocks.map((b, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Заголовок блока" value={b.title || ''} onChange={(v) => p('blocks', blocks.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                  <TF label="Подзаголовок" value={b.subtitle || ''} onChange={(v) => p('blocks', blocks.map((x, idx) => idx === i ? { ...x, subtitle: v } : x))} />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Пункты блока</Typography>
                  <Stack spacing={1}>
                    {(b.items || []).map((item: string, ii: number) => (
                      <Stack direction="row" spacing={1} key={ii} alignItems="center">
                        <TextField size="small" fullWidth value={item}
                          onChange={(e) => {
                            const items = [...(b.items || [])]; items[ii] = e.target.value;
                            p('blocks', blocks.map((x, idx) => idx === i ? { ...x, items } : x));
                          }} />
                        <IconButton size="small" onClick={() => p('blocks', blocks.map((x, idx) => idx === i ? { ...x, items: (x.items || []).filter((_: any, jj: number) => jj !== ii) } : x))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" startIcon={<AddIcon />}
                      onClick={() => p('blocks', blocks.map((x, idx) => idx === i ? { ...x, items: [...(x.items || []), ''] } : x))}>
                      Добавить пункт
                    </Button>
                  </Stack>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('blocks', blocks.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('blocks', [...blocks, { title: '', subtitle: '', items: [] }])} variant="outlined" size="small">Добавить блок</Button>
        </Stack>
      )}
      {tab === 2 && <KVListEditor label="Результаты" items={results} onChange={(v) => p('results', v)} />}
      {tab === 3 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function AchievementsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const stats: any[] = content.stats || [];
  const stories: any[] = content.stories || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Статистика (${stats.length})`} /><Tab label={`Истории (${stories.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && <KVListEditor label="Блоки статистики" items={stats} onChange={(v) => p('stats', v)} />}
      {tab === 2 && (
        <Stack spacing={2}>
          {stories.map((s, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Имя" value={s.name || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, name: v } : x))} />
                  <TF label="Возраст" value={s.age || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, age: v } : x))} />
                  <TF label="Трек" value={s.track || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, track: v } : x))} />
                </Stack>
                <TF label="Достижение" value={s.achievement || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, achievement: v } : x))} />
                <TF label="Цитата" value={s.quote || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, quote: v } : x))} multiline rows={2} />
                <TF label="Детали" value={s.detail || ''} onChange={(v) => p('stories', stories.map((x, idx) => idx === i ? { ...x, detail: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('stories', stories.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('stories', [...stories, { name: '', age: '', track: '', achievement: '', quote: '', detail: '' }])} variant="outlined" size="small">
            Добавить историю
          </Button>
        </Stack>
      )}
    </Box>
  );
}

function ActivitiesEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const formats: any[] = content.formats || [];
  const jams: any[] = content.jams_past || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Форматы (${formats.length})`} /><Tab label={`Прошлые джемы (${jams.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {formats.map((f, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Заголовок" value={f.title || ''} onChange={(v) => p('formats', formats.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                  <TF label="Бейдж" value={f.badge || ''} onChange={(v) => p('formats', formats.map((x, idx) => idx === i ? { ...x, badge: v } : x))} />
                </Stack>
                <TF label="Описание" value={f.desc || ''} onChange={(v) => p('formats', formats.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('formats', formats.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('formats', [...formats, { title: '', desc: '', badge: '' }])} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
      {tab === 2 && (
        <Stack spacing={2}>
          {jams.map((j, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Название" value={j.title || ''} onChange={(v) => p('jams_past', jams.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                  <TF label="Участники" value={String(j.participants || '')} onChange={(v) => p('jams_past', jams.map((x, idx) => idx === i ? { ...x, participants: v } : x))} />
                  <TF label="Игр создано" value={String(j.games || '')} onChange={(v) => p('jams_past', jams.map((x, idx) => idx === i ? { ...x, games: v } : x))} />
                </Stack>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('jams_past', jams.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('jams_past', [...jams, { title: '', participants: '', games: '' }])} variant="outlined" size="small">Добавить джем</Button>
        </Stack>
      )}
    </Box>
  );
}

function JamsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const how: any[] = content.how || [];
  const rules: string[] = content.rules || [];
  const tools: any[] = content.tools || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Как проходит (${how.length})`} /><Tab label="Правила" /><Tab label="Инструменты" />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {how.map((h, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Номер" value={h.num || ''} onChange={(v) => p('how', how.map((x, idx) => idx === i ? { ...x, num: v } : x))} />
                  <TF label="Заголовок" value={h.title || ''} onChange={(v) => p('how', how.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={h.desc || ''} onChange={(v) => p('how', how.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('how', how.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('how', [...how, { num: '', title: '', desc: '' }])} variant="outlined" size="small">Добавить шаг</Button>
        </Stack>
      )}
      {tab === 2 && <StringListEditor label="Правила участия" items={rules} onChange={(v) => p('rules', v)} />}
      {tab === 3 && (
        <Stack spacing={2}>
          {tools.map((t, i) => (
            <Stack direction="row" spacing={2} key={i} alignItems="center">
              <TF label="Инструмент" value={t.name || ''} onChange={(v) => p('tools', tools.map((x, idx) => idx === i ? { ...x, name: v } : x))} />
              <TF label="Тег" value={t.tag || ''} onChange={(v) => p('tools', tools.map((x, idx) => idx === i ? { ...x, tag: v } : x))} />
              <IconButton onClick={() => p('tools', tools.filter((_, idx) => idx !== i))}>
                <DeleteIcon />
              </IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('tools', [...tools, { name: '', tag: '' }])} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
    </Box>
  );
}

// ─── SEO page editors ─────────────────────────────────────────────────────────

function CoursePageEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const topics: any[] = content.topics || [];
  const skills: string[] = content.skills || [];
  const results: any[] = content.results || [];
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Темы (${topics.length})`} /><Tab label={`Навыки (${skills.length})`} /><Tab label={`Результаты (${results.length})`} /><Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {topics.map((t, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Номер" value={t.num || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, num: v } : x))} />
                  <TF label="Заголовок" value={t.title || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={t.desc || ''} onChange={(v) => p('topics', topics.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('topics', topics.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('topics', [...topics, { num: '', title: '', desc: '' }])} variant="outlined" size="small">Добавить тему</Button>
        </Stack>
      )}
      {tab === 2 && <StringListEditor label="Что освоит ученик" items={skills} onChange={(v) => p('skills', v)} />}
      {tab === 3 && <KVListEditor label="Результаты" items={results} onChange={(v) => p('results', v)} />}
      {tab === 4 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function PythonEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const why: any[] = content.why || [];
  const what_learn: string[] = content.what_learn || [];
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Почему Python (${why.length})`} /><Tab label={`Чему научимся (${what_learn.length})`} /><Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {why.map((w, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Эмодзи" value={w.emoji || ''} onChange={(v) => p('why', why.map((x, idx) => idx === i ? { ...x, emoji: v } : x))} />
                  <TF label="Заголовок" value={w.title || ''} onChange={(v) => p('why', why.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={w.desc || ''} onChange={(v) => p('why', why.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('why', why.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('why', [...why, { emoji: '✨', title: '', desc: '' }])} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
      {tab === 2 && <StringListEditor label="Список навыков" items={what_learn} onChange={(v) => p('what_learn', v)} />}
      {tab === 3 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function GameDevEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const stages: any[] = content.stages || [];
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Этапы (${stages.length})`} /><Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {stages.map((s, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Номер" value={s.num || ''} onChange={(v) => p('stages', stages.map((x, idx) => idx === i ? { ...x, num: v } : x))} />
                  <TF label="Заголовок" value={s.title || ''} onChange={(v) => p('stages', stages.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                </Stack>
                <TF label="Описание" value={s.desc || ''} onChange={(v) => p('stages', stages.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('stages', stages.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('stages', [...stages, { num: '', title: '', desc: '' }])} variant="outlined" size="small">Добавить этап</Button>
        </Stack>
      )}
      {tab === 2 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function HeroFaqEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const faq: any[] = content.faq || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`FAQ (${faq.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && <FaqSectionEditor items={faq} onChange={(v) => p('faq', v)} />}
    </Box>
  );
}

function DirectionsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const [tab, setTab] = useState(0);
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const hero = content.hero || {};
  const directions: any[] = content.directions || [];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Направления (${directions.length})`} />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={hero.heading || ''} onChange={(v) => p('hero', { ...hero, heading: v })} />
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => p('hero', { ...hero, subtitle: v })} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          {directions.map((d, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Эмодзи" value={d.emoji || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, emoji: v } : x))} />
                  <TF label="Заголовок" value={d.title || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, title: v } : x))} />
                  <TF label="Подзаголовок" value={d.subtitle || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, subtitle: v } : x))} />
                </Stack>
                <TF label="Описание" value={d.desc || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, desc: v } : x))} multiline rows={2} />
                <Stack direction="row" spacing={2}>
                  <TF label="Для кого" value={d.forWhom || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, forWhom: v } : x))} />
                  <TF label="Результат" value={d.result || ''} onChange={(v) => p('directions', directions.map((x, idx) => idx === i ? { ...x, result: v } : x))} />
                </Stack>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => p('directions', directions.filter((_, idx) => idx !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => p('directions', [...directions, { emoji: '', title: '', subtitle: '', desc: '', forWhom: '', result: '' }])} variant="outlined" size="small">
            Добавить направление
          </Button>
        </Stack>
      )}
    </Box>
  );
}

// ─── Basic page editors ───────────────────────────────────────────────────────

function HomeEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  const stats: any[] = content.stats || [];
  const reviews: any[] = content.reviews || [];
  const adv = content.advantages || {};
  const advItems: any[] = adv.items || [];
  const tracks = content.tracks || {};
  const trackItems: any[] = tracks.items || [];
  const path = content.path || {};
  const pathSteps: any[] = path.steps || [];
  const promos = content.promos || {};
  const promoItems: any[] = promos.items || [];
  const lms = content.lms || {};
  const lmsFeatures: string[] = lms.features || [];
  const ctaFinal = content.cta_final || {};
  const [tab, setTab] = useState(0);

  const setHero = (k: string, v: string) => onChange({ ...content, hero: { ...hero, [k]: v } });
  const setSection = (key: string, patch: any) => onChange({ ...content, [key]: { ...(content[key] || {}), ...patch } });

  const TRACK_LABELS = ['Игровая студия', 'Кодэкс', 'ТехноЛаб'];
  const STEP_LABELS = ['Шаг 01', 'Шаг 02', 'Шаг 03'];

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" />
        <Tab label={`Статистика (${stats.length})`} />
        <Tab label={`Отзывы (${reviews.length})`} />
        <Tab label="Преимущества" />
        <Tab label="Треки" />
        <Tab label="Путь ученика" />
        <Tab label={`Акции (${promoItems.length})`} />
        <Tab label="LMS-секция" />
        <Tab label="Финальный CTA" />
      </Tabs>

      {/* Герой */}
      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Бейдж" value={hero.badge || ''} onChange={(v) => setHero('badge', v)} />
          <Stack direction="row" spacing={2}>
            <TF label="H1" value={hero.h1 || ''} onChange={(v) => setHero('h1', v)} />
            <TF label="H1 акцент" value={hero.h1_accent || ''} onChange={(v) => setHero('h1_accent', v)} />
          </Stack>
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => setHero('subtitle', v)} multiline rows={2} />
          <StringListEditor label="Буллеты" items={hero.bullets || []}
            onChange={(v) => onChange({ ...content, hero: { ...hero, bullets: v } })} />
          <Stack direction="row" spacing={2}>
            <TF label="CTA основная" value={hero.cta_primary || ''} onChange={(v) => setHero('cta_primary', v)} />
            <TF label="CTA вторичная" value={hero.cta_secondary || ''} onChange={(v) => setHero('cta_secondary', v)} />
          </Stack>
        </Stack>
      )}

      {/* Статистика */}
      {tab === 1 && (
        <Stack spacing={2}>
          {stats.map((s, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Значение" value={s.value || ''} onChange={(v) => onChange({ ...content, stats: stats.map((x, idx) => idx === i ? { ...x, value: v } : x) })} />
                  <TF label="Подпись" value={s.label || ''} onChange={(v) => onChange({ ...content, stats: stats.map((x, idx) => idx === i ? { ...x, label: v } : x) })} />
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption">Выделить:</Typography>
                  <Chip size="small" label={s.highlight ? 'Да' : 'Нет'} color={s.highlight ? 'primary' : 'default'}
                    onClick={() => onChange({ ...content, stats: stats.map((x, idx) => idx === i ? { ...x, highlight: !x.highlight } : x) })}
                    sx={{ cursor: 'pointer' }} />
                  <Box flex={1} />
                  <IconButton size="small" onClick={() => onChange({ ...content, stats: stats.filter((_, idx) => idx !== i) })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => onChange({ ...content, stats: [...stats, { value: '', label: '', highlight: false }] })} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}

      {/* Отзывы */}
      {tab === 2 && (
        <Stack spacing={2}>
          {reviews.map((r, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Имя" value={r.name || ''} onChange={(v) => onChange({ ...content, reviews: reviews.map((x, idx) => idx === i ? { ...x, name: v } : x) })} />
                  <TF label="Роль" value={r.role || ''} onChange={(v) => onChange({ ...content, reviews: reviews.map((x, idx) => idx === i ? { ...x, role: v } : x) })} />
                  <TF label="Инициалы" value={r.initials || ''} onChange={(v) => onChange({ ...content, reviews: reviews.map((x, idx) => idx === i ? { ...x, initials: v } : x) })} />
                </Stack>
                <TF label="Текст" value={r.text || ''} onChange={(v) => onChange({ ...content, reviews: reviews.map((x, idx) => idx === i ? { ...x, text: v } : x) })} multiline rows={3} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => onChange({ ...content, reviews: reviews.filter((_, idx) => idx !== i) })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => onChange({ ...content, reviews: [...reviews, { name: '', role: '', text: '', initials: '' }] })} variant="outlined" size="small">Добавить отзыв</Button>
        </Stack>
      )}

      {/* Преимущества */}
      {tab === 3 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="Заголовок секции" value={adv.heading || ''} onChange={(v) => setSection('advantages', { heading: v })} />
            <TF label="Подзаголовок" value={adv.subheading || ''} onChange={(v) => setSection('advantages', { subheading: v })} />
          </Stack>
          <Typography variant="caption" color="text.secondary">Карточки преимуществ (иконки по позиции: Книга / График / Люди / Наушники)</Typography>
          {advItems.map((item, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption" sx={{ minWidth: 24, fontWeight: 700 }}>#{i + 1}</Typography>
                  <TF label="Заголовок" value={item.title || ''} onChange={(v) => onChange({ ...content, advantages: { ...adv, items: advItems.map((x, idx) => idx === i ? { ...x, title: v } : x) } })} />
                  <IconButton size="small" color="error" onClick={() => onChange({ ...content, advantages: { ...adv, items: advItems.filter((_, idx) => idx !== i) } })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <TF label="Описание" value={item.description || ''} multiline rows={2} onChange={(v) => onChange({ ...content, advantages: { ...adv, items: advItems.map((x, idx) => idx === i ? { ...x, description: v } : x) } })} />
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} variant="outlined" size="small"
            onClick={() => onChange({ ...content, advantages: { ...adv, items: [...advItems, { title: '', description: '' }] } })}>
            Добавить карточку
          </Button>
        </Stack>
      )}

      {/* Треки */}
      {tab === 4 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="Заголовок секции" value={tracks.heading || ''} onChange={(v) => setSection('tracks', { heading: v })} />
            <TF label="Подзаголовок" value={tracks.subheading || ''} onChange={(v) => setSection('tracks', { subheading: v })} />
          </Stack>
          <Typography variant="caption" color="text.secondary">Цвета треков фиксированы (фиолетовый / синий / зелёный). Редактируются только тексты.</Typography>
          {[0, 1, 2].map((i) => {
            const t = trackItems[i] || {};
            const upd = (patch: any) => {
              const arr = [0, 1, 2].map((j) => j === i ? { ...(trackItems[j] || {}), ...patch } : (trackItems[j] || {}));
              onChange({ ...content, tracks: { ...tracks, items: arr } });
            };
            return (
              <Paper key={i} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{TRACK_LABELS[i]}</Typography>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={2}>
                    <TF label="Название трека" value={t.title || ''} onChange={(v) => upd({ title: v })} />
                    <TF label="Возраст" value={t.age || ''} onChange={(v) => upd({ age: v })} sx={{ maxWidth: 140 }} />
                  </Stack>
                  <TF label="Нарратив (подзаголовок)" value={t.narrative || ''} onChange={(v) => upd({ narrative: v })} />
                  <TF label="Описание" value={t.description || ''} multiline rows={3} onChange={(v) => upd({ description: v })} />
                  <TF label="Ссылка (href)" value={t.href || ''} onChange={(v) => upd({ href: v })} placeholder={`/${['game-studio','kodeks','technolab'][i]}`} />
                  <StringListEditor label="Теги" items={t.tags || []} onChange={(v) => upd({ tags: v })} />
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Путь ученика */}
      {tab === 5 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="Заголовок секции" value={path.heading || ''} onChange={(v) => setSection('path', { heading: v })} />
            <TF label="Подзаголовок" value={path.subheading || ''} onChange={(v) => setSection('path', { subheading: v })} />
          </Stack>
          <Typography variant="caption" color="text.secondary">Номера шагов (01/02/03) и цвета фиксированы.</Typography>
          {[0, 1, 2].map((i) => {
            const s = pathSteps[i] || {};
            const upd = (patch: any) => {
              const arr = [0, 1, 2].map((j) => j === i ? { ...(pathSteps[j] || {}), ...patch } : (pathSteps[j] || {}));
              onChange({ ...content, path: { ...path, steps: arr } });
            };
            return (
              <Paper key={i} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>{STEP_LABELS[i]}</Typography>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={2}>
                    <TF label="Название трека" value={s.track || ''} onChange={(v) => upd({ track: v })} />
                    <TF label="Возраст" value={s.age || ''} onChange={(v) => upd({ age: v })} sx={{ maxWidth: 140 }} />
                  </Stack>
                  <TF label="Описание" value={s.description || ''} multiline rows={2} onChange={(v) => upd({ description: v })} />
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Акции */}
      {tab === 6 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="Заголовок секции" value={promos.heading || ''} onChange={(v) => setSection('promos', { heading: v })} />
            <TF label="Подзаголовок" value={promos.subheading || ''} onChange={(v) => setSection('promos', { subheading: v })} />
          </Stack>
          {promoItems.map((promo, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <TF label="Бейдж" value={promo.badge || ''} onChange={(v) => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, badge: v } : x) } })} sx={{ maxWidth: 180 }} />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption">Выделить:</Typography>
                    <Chip size="small" label={promo.highlight ? 'Да (brand)' : 'Нет'} color={promo.highlight ? 'primary' : 'default'}
                      onClick={() => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, highlight: !x.highlight } : x) } })}
                      sx={{ cursor: 'pointer' }} />
                  </Stack>
                  <Box flex={1} />
                  <IconButton size="small" color="error" onClick={() => onChange({ ...content, promos: { ...promos, items: promoItems.filter((_, idx) => idx !== i) } })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <TF label="Заголовок" value={promo.title || ''} onChange={(v) => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, title: v } : x) } })} />
                <TF label="Описание" value={promo.desc || ''} multiline rows={2} onChange={(v) => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, desc: v } : x) } })} />
                <Stack direction="row" spacing={2}>
                  <TF label="Текст кнопки" value={promo.cta || ''} onChange={(v) => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, cta: v } : x) } })} sx={{ maxWidth: 200 }} />
                  <TF label="Ссылка (href)" value={promo.href || ''} onChange={(v) => onChange({ ...content, promos: { ...promos, items: promoItems.map((x, idx) => idx === i ? { ...x, href: v } : x) } })} />
                </Stack>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} variant="outlined" size="small"
            onClick={() => onChange({ ...content, promos: { ...promos, items: [...promoItems, { badge: '', title: '', desc: '', cta: 'Подробнее', href: '/kontakty', highlight: false }] } })}>
            Добавить акцию
          </Button>
        </Stack>
      )}

      {/* LMS-секция */}
      {tab === 7 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={lms.heading || ''} onChange={(v) => setSection('lms', { heading: v })} />
          <TF label="Описание" value={lms.description || ''} multiline rows={4} onChange={(v) => setSection('lms', { description: v })} />
          <StringListEditor label="Возможности LMS (список)" items={lmsFeatures}
            onChange={(v) => setSection('lms', { features: v })} />
          <Stack direction="row" spacing={2}>
            <TF label="Текст ссылки" value={lms.cta_text || ''} onChange={(v) => setSection('lms', { cta_text: v })} />
            <TF label="URL кабинета" value={lms.cta_href || ''} onChange={(v) => setSection('lms', { cta_href: v })} />
          </Stack>
        </Stack>
      )}

      {/* Финальный CTA */}
      {tab === 8 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={ctaFinal.heading || ''} onChange={(v) => setSection('cta_final', { heading: v })} />
          <TF label="Подзаголовок" value={ctaFinal.subtext || ''} multiline rows={2} onChange={(v) => setSection('cta_final', { subtext: v })} />
          <Stack direction="row" spacing={2}>
            <TF label="Кнопка 1 — текст" value={ctaFinal.btn_primary || ''} onChange={(v) => setSection('cta_final', { btn_primary: v })} />
            <TF label="Кнопка 1 — ссылка" value={ctaFinal.btn_primary_href || ''} onChange={(v) => setSection('cta_final', { btn_primary_href: v })} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TF label="Кнопка 2 — текст" value={ctaFinal.btn_secondary || ''} onChange={(v) => setSection('cta_final', { btn_secondary: v })} />
            <TF label="Кнопка 2 — ссылка" value={ctaFinal.btn_secondary_href || ''} onChange={(v) => setSection('cta_final', { btn_secondary_href: v })} />
          </Stack>
          <TF label="Подпись под кнопками" value={ctaFinal.note || ''} onChange={(v) => setSection('cta_final', { note: v })} placeholder="Ответим в течение часа. Без спама." />
        </Stack>
      )}
    </Box>
  );
}

function FaqPageEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const sections: any[] = content.sections || [];
  const setSection = (i: number, k: string, v: any) =>
    onChange({ ...content, sections: sections.map((s, idx) => idx === i ? { ...s, [k]: v } : s) });

  return (
    <Stack spacing={3}>
      {sections.map((sec, si) => (
        <Paper key={si} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <TextField label="Раздел" size="small" fullWidth value={sec.title || ''}
              onChange={(e) => setSection(si, 'title', e.target.value)} />
            <IconButton onClick={() => onChange({ ...content, sections: sections.filter((_, idx) => idx !== si) })} color="error">
              <DeleteIcon />
            </IconButton>
          </Stack>
          <FaqSectionEditor items={sec.items || []} onChange={(v) => setSection(si, 'items', v)} />
        </Paper>
      ))}
      <Button startIcon={<AddIcon />} onClick={() => onChange({ ...content, sections: [...sections, { title: '', items: [] }] })} variant="outlined">
        Добавить раздел
      </Button>
    </Stack>
  );
}

function AboutEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  const story = content.story || {};
  const values: any[] = content.values || [];
  const team: any[] = content.team || [];
  const stats: any[] = content.stats || [];
  const [tab, setTab] = useState(0);

  const patchSection = (section: string, k: string, v: any) =>
    onChange({ ...content, [section]: { ...(content[section] || {}), [k]: v } });

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label="История" /><Tab label={`Ценности (${values.length})`} /><Tab label={`Команда (${team.length})`} /><Tab label="Статистика" />
      </Tabs>
      {tab === 0 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="H1" value={hero.h1 || ''} onChange={(v) => patchSection('hero', 'h1', v)} />
            <TF label="H1 акцент" value={hero.h1_accent || ''} onChange={(v) => patchSection('hero', 'h1_accent', v)} />
          </Stack>
          <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => patchSection('hero', 'subtitle', v)} multiline rows={2} />
        </Stack>
      )}
      {tab === 1 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={story.heading || ''} onChange={(v) => patchSection('story', 'heading', v)} />
          <Stack spacing={1}>
            {(story.paragraphs || []).map((para: string, i: number) => (
              <Stack direction="row" spacing={1} key={i} alignItems="flex-start">
                <TextField size="small" fullWidth multiline minRows={2} value={para}
                  onChange={(e) => { const pp = [...(story.paragraphs || [])]; pp[i] = e.target.value; patchSection('story', 'paragraphs', pp); }} />
                <IconButton size="small" onClick={() => patchSection('story', 'paragraphs', (story.paragraphs || []).filter((_: string, idx: number) => idx !== i))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button size="small" startIcon={<AddIcon />}
              onClick={() => patchSection('story', 'paragraphs', [...(story.paragraphs || []), ''])} sx={{ alignSelf: 'flex-start' }}>
              Добавить абзац
            </Button>
          </Stack>
        </Stack>
      )}
      {tab === 2 && (
        <Stack spacing={2}>
          {values.map((v, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Эмодзи" value={v.emoji || ''} onChange={(val) => onChange({ ...content, values: values.map((x, idx) => idx === i ? { ...x, emoji: val } : x) })} />
                  <TF label="Заголовок" value={v.title || ''} onChange={(val) => onChange({ ...content, values: values.map((x, idx) => idx === i ? { ...x, title: val } : x) })} />
                </Stack>
                <TF label="Описание" value={v.desc || ''} onChange={(val) => onChange({ ...content, values: values.map((x, idx) => idx === i ? { ...x, desc: val } : x) })} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => onChange({ ...content, values: values.filter((_, idx) => idx !== i) })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => onChange({ ...content, values: [...values, { emoji: '⭐', title: '', desc: '' }] })} variant="outlined" size="small">Добавить ценность</Button>
        </Stack>
      )}
      {tab === 3 && (
        <Stack spacing={2}>
          {team.map((m, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Имя" value={m.name || ''} onChange={(v) => onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, name: v } : x) })} />
                  <TF label="Должность" value={m.role || ''} onChange={(v) => onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, role: v } : x) })} />
                  <TF label="Инициалы" value={m.initials || ''} onChange={(v) => onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, initials: v } : x) })} />
                </Stack>
                <TF label="Биография" value={m.bio || ''} onChange={(v) => onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, bio: v } : x) })} multiline rows={2} />
                <TF label="Специализация" value={m.specialization || ''} onChange={(v) => onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, specialization: v } : x) })} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => onChange({ ...content, team: team.filter((_, idx) => idx !== i) })}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => onChange({ ...content, team: [...team, { name: '', role: '', initials: '', bio: '', specialization: '' }] })} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
      {tab === 4 && <KVListEditor label="Статистика" items={stats} onChange={(v) => onChange({ ...content, stats: v })} />}
    </Box>
  );
}

function ContactsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  return (
    <Stack spacing={2}>
      <Alert severity="info">Телефон, email и соцсети — в «Настройки сайта».</Alert>
      <TF label="Заголовок страницы" value={hero.heading || ''} onChange={(v) => onChange({ ...content, hero: { ...hero, heading: v } })} />
      <TF label="Подзаголовок" value={hero.subtitle || ''} onChange={(v) => onChange({ ...content, hero: { ...hero, subtitle: v } })} multiline rows={2} />
      <TF label="Дополнительный текст" value={content.extra_text || ''} onChange={(v) => onChange({ ...content, extra_text: v })} multiline rows={3} />
    </Stack>
  );
}

// ─── Legal page editor ────────────────────────────────────────────────────────

function LegalEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const p = (k: string, v: any) => onChange({ ...content, [k]: v });
  const sections: any[] = content.sections || [];

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ mb: 1 }}>
        Разделы отображаются как параграфы. Переносы строк сохраняются. Если поле не заполнено — используется захардкоженный текст страницы.
      </Alert>
      <Stack direction="row" spacing={2}>
        <TF label="Заголовок (H1)" value={content.heading || ''} onChange={(v) => p('heading', v)} />
        <TF label="Подзаголовок / дата" value={content.effective_date || ''} onChange={(v) => p('effective_date', v)} />
      </Stack>
      <Divider />
      <Typography variant="subtitle2" fontWeight={700}>Разделы</Typography>
      {sections.map((sec, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField size="small" label="Заголовок раздела (h2)" fullWidth value={sec.h2 || ''}
                onChange={(e) => p('sections', sections.map((x, idx) => idx === i ? { ...x, h2: e.target.value } : x))} />
              <IconButton size="small" onClick={() => p('sections', sections.filter((_, idx) => idx !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <TextField
              label="Содержимое раздела (plain text, переносы сохраняются)"
              size="small" fullWidth multiline minRows={3}
              value={sec.content || ''}
              onChange={(e) => p('sections', sections.map((x, idx) => idx === i ? { ...x, content: e.target.value } : x))}
            />
          </Stack>
        </Paper>
      ))}
      <Button startIcon={<AddIcon />}
        onClick={() => p('sections', [...sections, { h2: '', content: '' }])}
        variant="outlined" size="small">
        Добавить раздел
      </Button>
    </Stack>
  );
}

// ─── Editor router ────────────────────────────────────────────────────────────

// ─── Header Editor ────────────────────────────────────────────────────────────

function HeaderEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const links: { label: string; href: string }[] = Array.isArray(content.nav_links) ? content.nav_links : [
    { label: 'Игровая студия', href: '/game-studio' },
    { label: 'Кодэкс', href: '/kodeks' },
    { label: 'ТехноЛаб', href: '/technolab' },
    { label: 'Направления', href: '/napravleniya-razrabotki' },
    { label: 'Мероприятия', href: '/aktivnosti' },
    { label: 'Блог', href: '/blog' },
    { label: 'О нас', href: '/o-nas' },
  ];
  const setLinks = (v: typeof links) => onChange({ ...content, nav_links: v });
  const setLink = (i: number, field: 'label' | 'href', val: string) => {
    const next = links.map((l, idx) => idx === i ? { ...l, [field]: val } : l);
    setLinks(next);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Пункты навигации</Typography>
        <Stack spacing={1}>
          {links.map((l, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField size="small" label="Название" value={l.label} sx={{ flex: 1 }}
                onChange={(e) => setLink(i, 'label', e.target.value)} />
              <TextField size="small" label="Ссылка (/путь)" value={l.href} sx={{ flex: 1 }}
                onChange={(e) => setLink(i, 'href', e.target.value)} />
              <IconButton size="small" color="error" onClick={() => setLinks(links.filter((_, idx) => idx !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
        <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }}
          onClick={() => setLinks([...links, { label: '', href: '/' }])}>
          Добавить пункт
        </Button>
      </Box>
      <Divider />
      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Кнопка CTA (правый угол)</Typography>
        <Stack direction="row" spacing={2}>
          <TF label="Текст кнопки" value={content.cta_label ?? ''} onChange={(v) => onChange({ ...content, cta_label: v })} />
          <TF label="Ссылка кнопки" value={content.cta_href ?? ''} onChange={(v) => onChange({ ...content, cta_href: v })} />
        </Stack>
        <Typography variant="caption" color="text.secondary">По умолчанию: «Пробный урок» → /besplatnyj-probnyj-urok</Typography>
      </Box>
    </Stack>
  );
}

// ─── Footer Editor ────────────────────────────────────────────────────────────

function FooterColumnEditor({ col, onChange }: { col: { title: string; links: { label: string; href: string }[] }; onChange: (c: typeof col) => void }) {
  const setLink = (i: number, field: 'label' | 'href', val: string) => {
    const next = col.links.map((l, idx) => idx === i ? { ...l, [field]: val } : l);
    onChange({ ...col, links: next });
  };
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
      <TextField size="small" label="Заголовок колонки" value={col.title} fullWidth sx={{ mb: 1.5 }}
        onChange={(e) => onChange({ ...col, title: e.target.value })} />
      <Stack spacing={1}>
        {col.links.map((l, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center">
            <TextField size="small" label="Название" value={l.label} sx={{ flex: 1 }}
              onChange={(e) => setLink(i, 'label', e.target.value)} />
            <TextField size="small" label="Ссылка" value={l.href} sx={{ flex: 1 }}
              onChange={(e) => setLink(i, 'href', e.target.value)} />
            <IconButton size="small" color="error"
              onClick={() => onChange({ ...col, links: col.links.filter((_, idx) => idx !== i) })}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }}
        onClick={() => onChange({ ...col, links: [...col.links, { label: '', href: '/' }] })}>
        Добавить ссылку
      </Button>
    </Box>
  );
}

function FooterEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const defaultColumns = [
    { title: 'Треки', links: [{ label: 'Игровая студия', href: '/game-studio' }, { label: 'Кодэкс', href: '/kodeks' }, { label: 'ТехноЛаб', href: '/technolab' }] },
    { title: 'Продукты', links: [{ label: 'Направления разработки', href: '/napravleniya-razrabotki' }, { label: 'Подготовка к ОГЭ', href: '/podgotovka-k-oge-po-informatike' }, { label: 'Инд. занятия', href: '/individualnye-zanyatiya' }] },
    { title: 'Компания', links: [{ label: 'О нас', href: '/o-nas' }, { label: 'Блог', href: '/blog' }, { label: 'Контакты', href: '/kontakty' }] },
  ];
  const columns = Array.isArray(content.columns) ? content.columns : defaultColumns;
  const setCol = (i: number, col: typeof columns[0]) => {
    const next = columns.map((c: any, idx: number) => idx === i ? col : c);
    onChange({ ...content, columns: next });
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2}>
        <TF label="Подпись под логотипом" value={content.tagline ?? ''}
          onChange={(v) => onChange({ ...content, tagline: v })} multiline rows={2} />
      </Stack>
      <TF label="Текст копирайта (без ©, года)" value={content.copyright ?? ''}
        onChange={(v) => onChange({ ...content, copyright: v })} />
      <Typography variant="caption" color="text.secondary">
        Телефон, email и соцсети редактируются в разделе Настройки портала.
      </Typography>
      <Divider />
      <Typography variant="subtitle2" fontWeight={700}>Колонки навигации</Typography>
      <Stack spacing={2}>
        {columns.map((col: any, i: number) => (
          <FooterColumnEditor key={i} col={col} onChange={(c) => setCol(i, c)} />
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />}
        onClick={() => onChange({ ...content, columns: [...columns, { title: 'Новая колонка', links: [] }] })}>
        Добавить колонку
      </Button>
    </Stack>
  );
}

// ─── Branding Editor ──────────────────────────────────────────────────────────

const BRAND_PRESETS = [
  { label: 'Фиолетовый', color: '#7F23CC' },
  { label: 'Синий',      color: '#2563EB' },
  { label: 'Изумрудный', color: '#059669' },
  { label: 'Оранжевый',  color: '#EA580C' },
  { label: 'Красный',    color: '#DC2626' },
  { label: 'Розовый',    color: '#DB2777' },
];

function BrandingEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const brandHex: string = content.brand_hex ?? '#7F23CC';
  const set = (v: string) => onChange({ ...content, brand_hex: v });

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Цвет бренда</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            component="input" type="color" value={brandHex}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value)}
            sx={{ width: 56, height: 40, border: '1px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer', p: 0.5 }}
          />
          <TextField size="small" value={brandHex} sx={{ width: 120 }}
            onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) set(e.target.value); }}
            inputProps={{ maxLength: 7, style: { fontFamily: 'monospace' } }}
          />
          <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: brandHex, border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Быстрые пресеты</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {BRAND_PRESETS.map((p) => (
            <Chip
              key={p.color}
              label={p.label}
              onClick={() => set(p.color)}
              variant={brandHex === p.color ? 'filled' : 'outlined'}
              sx={{
                bgcolor: brandHex === p.color ? p.color : 'transparent',
                color: brandHex === p.color ? '#fff' : p.color,
                borderColor: p.color,
                fontWeight: 600,
                '&:hover': { bgcolor: p.color, color: '#fff' },
              }}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default' }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5} fontWeight={600}>
          Предпросмотр элементов сайта
        </Typography>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1}>
            <Box sx={{ px: 2, py: 1, borderRadius: 1, bgcolor: brandHex, color: '#fff', fontSize: 13, fontWeight: 600 }}>
              Кнопка CTA
            </Box>
            <Box sx={{ px: 2, py: 1, borderRadius: 1, border: '1px solid', borderColor: brandHex, color: brandHex, fontSize: 13, fontWeight: 600 }}>
              Кнопка outline
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: brandHex }} />
            <Typography variant="body2" sx={{ color: brandHex, fontWeight: 600 }}>Ссылка / акцент</Typography>
          </Stack>
          <Box sx={{ height: 4, borderRadius: 2, bgcolor: brandHex, width: '60%' }} />
        </Stack>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Цвет применяется ко всему сайту: кнопки, ссылки, акценты, фоновые тени. Светлая и тёмная темы генерируются автоматически.
        Изменения видны на сайте после нажатия «Применить сейчас».
      </Typography>

      <Divider />

      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={0.5}>Фавиконка сайта</Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          Загрузите PNG/ICO 32×32 или 64×64. Отображается во вкладке браузера.
        </Typography>
        <ImageUpload
          label="Фавиконка"
          value={content.favicon_url || ''}
          onChange={(v) => onChange({ ...content, favicon_url: v })}
        />
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={0.5}>Кастомный код в {'<head>'}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          Произвольный JS-код (без тегов {'<script>'}). Вставляется в {'<head>'} всех страниц.
          Подходит для пикселей, виджетов, кастомных счётчиков.
        </Typography>
        <TextField
          label="JS-код"
          multiline
          rows={5}
          fullWidth
          size="small"
          value={content.custom_head_script || ''}
          onChange={(e) => onChange({ ...content, custom_head_script: e.target.value })}
          placeholder={"// Например: window.myWidget = { token: '...' };"}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </Box>
    </Stack>
  );
}

// ─── Page router ──────────────────────────────────────────────────────────────

function BlogListingEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        Тексты страницы-листинга /blog. Сами статьи управляются в разделе «Блог» портала.
      </Typography>
      <TF label="Заголовок страницы" value={content.heading || ''} onChange={(v) => onChange({ ...content, heading: v })} placeholder="Блог" />
      <TF label="Подзаголовок" value={content.subheading || ''} multiline rows={2} onChange={(v) => onChange({ ...content, subheading: v })}
        placeholder="О программировании для детей, подготовке к экзаменам и историях учеников." />
      <SeoSection content={content} onChange={onChange} />
    </Stack>
  );
}

function PageEditor({ slug, content, onChange }: { slug: string; content: any; onChange: (c: any) => void }) {
  if (slug === 'home') return <HomeEditor content={content} onChange={onChange} />;
  if (slug === 'faq') return <FaqPageEditor content={content} onChange={onChange} />;
  if (slug === 'o-nas') return <AboutEditor content={content} onChange={onChange} />;
  if (slug === 'kontakty') return <ContactsEditor content={content} onChange={onChange} />;
  if (['game-studio', 'kodeks', 'technolab'].includes(slug)) return <TrackEditor content={content} onChange={onChange} />;
  if (slug === 'besplatnyj-probnyj-urok') return <TrialEditor content={content} onChange={onChange} />;
  if (slug === 'individualnye-zanyatiya') return <IndividualEditor content={content} onChange={onChange} />;
  if (slug === 'podgotovka-k-oge-po-informatike') return <ExamEditor content={content} onChange={onChange} />;
  if (slug === 'podgotovka-k-ege-po-informatike') return <ExamEditor content={content} onChange={onChange} isEge />;
  if (slug === 'dostizheniya-uchenikov') return <AchievementsEditor content={content} onChange={onChange} />;
  if (slug === 'aktivnosti') return <ActivitiesEditor content={content} onChange={onChange} />;
  if (slug === 'igrovye-dzhemy') return <JamsEditor content={content} onChange={onChange} />;
  if (slug === 'python-dlya-detej') return <PythonEditor content={content} onChange={onChange} />;
  if (slug === 'razrabotka-igr-na-python') return <GameDevEditor content={content} onChange={onChange} />;
  if (slug === 'backend-razrabotka' || slug === 'frontend-razrabotka') return <CoursePageEditor content={content} onChange={onChange} />;
  if (slug === 'napravleniya-razrabotki') return <DirectionsEditor content={content} onChange={onChange} />;
  if (slug === 'legal-oferta' || slug === 'legal-privacy' || slug === 'legal-terms') return <LegalEditor content={content} onChange={onChange} />;
  if (slug === 'blog') return <BlogListingEditor content={content} onChange={onChange} />;
  if (slug === 'header') return <HeaderEditor content={content} onChange={onChange} />;
  if (slug === 'footer') return <FooterEditor content={content} onChange={onChange} />;
  if (slug === 'branding') return <BrandingEditor content={content} onChange={onChange} />;
  return <HeroFaqEditor content={content} onChange={onChange} />;
}

// ─── Image Upload ─────────────────────────────────────────────────────────────

function ImageUpload({ value, onChange, label = 'Изображение' }: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const { url } = await mediaApi.uploadImage(file);
      onChange(url);
    } catch (ex) {
      setErr(extractApiError(ex, 'Ошибка загрузки'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <TextField
            size="small" fullWidth
            placeholder="https://... или загрузите файл"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {err && <Typography variant="caption" color="error">{err}</Typography>}
        </Box>
        <Button
          variant="outlined" size="small" component="label"
          disabled={uploading}
          startIcon={uploading ? <CircularProgress size={14} /> : undefined}
          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {uploading ? 'Загрузка...' : 'Загрузить'}
          <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" onChange={handleFile} />
        </Button>
      </Stack>
      {value && (
        <Box mt={1} sx={{ position: 'relative', display: 'inline-block' }}>
          <Box
            component="img" src={value} alt="preview"
            sx={{ maxHeight: 100, maxWidth: 300, borderRadius: 1, border: '1px solid', borderColor: 'divider', display: 'block' }}
            onError={(e: any) => { e.target.style.display = 'none'; }}
          />
          <IconButton size="small" color="error"
            sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', boxShadow: 1 }}
            onClick={() => onChange('')}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

// ─── SEO Section ──────────────────────────────────────────────────────────────

interface SeoSectionProps {
  content: any;
  onChange: (c: any) => void;
}

function SeoSection({ content, onChange }: SeoSectionProps) {
  const seo = (content?.seo && typeof content.seo === 'object' ? content.seo : {}) as Record<string, string>;
  const set = (key: string, val: string) => onChange({ ...content, seo: { ...seo, [key]: val } });

  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SearchIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={600}>SEO / Метатеги</Typography>
          {(seo.meta_title || seo.meta_description) && (
            <Chip label="настроено" size="small" color="success" variant="outlined" />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <TextField
            label="meta title"
            value={seo.meta_title ?? ''}
            onChange={(e) => set('meta_title', e.target.value)}
            fullWidth size="small"
            helperText={`${(seo.meta_title ?? '').length} / 60 симв. — заголовок во вкладке браузера и в Google`}
            inputProps={{ maxLength: 120 }}
          />
          <TextField
            label="meta description"
            value={seo.meta_description ?? ''}
            onChange={(e) => set('meta_description', e.target.value)}
            fullWidth size="small" multiline rows={2}
            helperText={`${(seo.meta_description ?? '').length} / 160 симв. — описание в результатах поиска`}
            inputProps={{ maxLength: 320 }}
          />
          <TextField
            label="keywords (через запятую)"
            value={seo.keywords ?? ''}
            onChange={(e) => set('keywords', e.target.value)}
            fullWidth size="small"
            helperText="Например: программирование для детей, Python, онлайн школа"
          />
          <ImageUpload
            label="OG-изображение (для соцсетей, 1200×630 px)"
            value={seo.og_image ?? ''}
            onChange={(url) => set('og_image', url)}
          />
          <Typography variant="caption" color="text.secondary">
            Пустые поля — используется текст и изображение по умолчанию из кода страницы.
          </Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CmsEditorPage: React.FC = () => {
  const [selectedSlug, setSelectedSlug] = useState('home');
  const [content, setContent] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateSuccess, setRevalidateSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await cmsApi.getPage(slug);
      const c = data.content && typeof data.content === 'object' && Object.keys(data.content as object).length > 0
        ? data.content : {};
      setContent(c);
    } catch {
      setContent({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(selectedSlug); }, [selectedSlug, loadPage]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    setRevalidateSuccess(false);
    try {
      await cmsApi.savePage(selectedSlug, content);
      setSuccess(true);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  const handleRevalidate = async () => {
    setRevalidating(true);
    setError(null);
    setRevalidateSuccess(false);
    try {
      await cmsApi.revalidatePage(selectedSlug);
      setRevalidateSuccess(true);
      setTimeout(() => setRevalidateSuccess(false), 4000);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сбросить кэш'));
    } finally {
      setRevalidating(false);
    }
  };

  const selectedPage = ALL_PAGES.find((p) => p.slug === selectedSlug)!;

  return (
    <Layout>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{ width: 210, borderRight: 1, borderColor: 'divider', flexShrink: 0, overflow: 'auto' }}>
          <List dense disablePadding>
            {PAGE_GROUPS.map((group) => (
              <React.Fragment key={group.group}>
                <ListSubheader sx={{ lineHeight: '32px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'text.disabled', bgcolor: 'background.default' }}>
                  {group.group}
                </ListSubheader>
                {group.pages.map((page) => (
                  <ListItemButton key={page.slug} selected={selectedSlug === page.slug}
                    onClick={() => setSelectedSlug(page.slug)} sx={{ py: 0.5 }}>
                    <ListItemText primary={page.label} primaryTypographyProps={{ fontSize: 13 }} />
                  </ListItemButton>
                ))}
                <Divider />
              </React.Fragment>
            ))}
          </List>
        </Box>

        {/* Editor area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>{selectedPage?.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                tirskix-academy.com/{selectedSlug === 'home' ? '' : selectedSlug + '/'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                disabled={saving || loading}
                onClick={handleSave}
              >
                Сохранить
              </Button>
              <Button
                variant="outlined"
                color="success"
                startIcon={revalidating ? <CircularProgress size={14} color="inherit" /> : <BoltIcon />}
                disabled={revalidating || loading}
                onClick={handleRevalidate}
                title="Применить изменения на сайте сразу, не дожидаясь 1 часа"
              >
                Применить сейчас
              </Button>
            </Stack>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
              Сохранено. Нажмите «Применить сейчас» чтобы обновить сайт немедленно, или подождите до 1 часа.
            </Alert>
          )}
          {revalidateSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setRevalidateSuccess(false)}>
              Кэш сброшен — изменения уже на сайте.
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <SeoSection content={content} onChange={setContent} />
              <Paper sx={{ p: 3 }}>
                <PageEditor slug={selectedSlug} content={content} onChange={setContent} />
              </Paper>
            </>
          )}
        </Box>
      </Box>
    </Layout>
  );
};

export default CmsEditorPage;
