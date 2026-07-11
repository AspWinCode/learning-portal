import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, CircularProgress, Chip, Divider, IconButton,
  List, ListItemButton, ListItemText, ListSubheader, Paper, Stack,
  Tab, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Layout from '../../components/Layout';
import { cmsApi } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

// ─── Pages registry ───────────────────────────────────────────────────────────

const PAGE_GROUPS = [
  {
    group: 'Основные',
    pages: [
      { slug: 'home', label: 'Главная' },
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
  const [tab, setTab] = useState(0);

  const setHero = (k: string, v: string) => onChange({ ...content, hero: { ...hero, [k]: v } });

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" /><Tab label={`Статистика (${stats.length})`} /><Tab label={`Отзывы (${reviews.length})`} />
      </Tabs>
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
  return <HeroFaqEditor content={content} onChange={onChange} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CmsEditorPage: React.FC = () => {
  const [selectedSlug, setSelectedSlug] = useState('home');
  const [content, setContent] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
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
    try {
      await cmsApi.savePage(selectedSlug, content);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
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
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              disabled={saving || loading}
              onClick={handleSave}
            >
              Сохранить
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Сохранено. Изменения появятся на сайте в течение 1 часа (ISR-кэш).
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Paper sx={{ p: 3 }}>
              <PageEditor slug={selectedSlug} content={content} onChange={setContent} />
            </Paper>
          )}
        </Box>
      </Box>
    </Layout>
  );
};

export default CmsEditorPage;
