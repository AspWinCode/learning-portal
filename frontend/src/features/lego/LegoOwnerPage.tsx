import React from 'react';
import { Box, Chip, Stack } from '@mui/material';
import { LegoEmbeddedContext, LegoShell } from './LegoShell';
import LegoTodayPage from './LegoTodayPage';
import LegoStudentsPage from './LegoStudentsPage';
import LegoGroupsPage from './LegoGroupsPage';
import LegoLessonsPage from './LegoLessonsPage';
import LegoDebtsPage from './LegoDebtsPage';
import LegoPaymentsPage from './LegoPaymentsPage';
import LegoEventsPage from './LegoEventsPage';

const SECTIONS = [
  { id: 'lego-today', label: 'Сегодня', Page: LegoTodayPage },
  { id: 'lego-groups', label: 'Группы', Page: LegoGroupsPage },
  { id: 'lego-students', label: 'Дети', Page: LegoStudentsPage },
  { id: 'lego-lessons', label: 'Занятия', Page: LegoLessonsPage },
  { id: 'lego-events', label: 'Мастер-классы', Page: LegoEventsPage },
  { id: 'lego-debts', label: 'Долги', Page: LegoDebtsPage },
  { id: 'lego-payments', label: 'Оплаты', Page: LegoPaymentsPage },
];

// Единая страница LEGO для владельца: все разделы на одном экране.
// Разделы — те же страницы, встроенные через LegoEmbeddedContext (без Layout и вкладок).
// Липкая панель переходов по якорям, чтобы не листать всю страницу в поисках раздела.
const LegoOwnerPage: React.FC = () => (
  <LegoShell title="Все разделы" tabs={false}>
    <LegoEmbeddedContext.Provider value={true}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          py: 1,
          mb: 2,
          overflowX: 'auto',
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {SECTIONS.map((s) => (
          <Chip key={s.id} label={s.label} component="a" href={`#${s.id}`} clickable variant="outlined" />
        ))}
      </Stack>
      {SECTIONS.map(({ id, Page }) => (
        <Box key={id} id={id} sx={{ scrollMarginTop: 72 }}>
          <Page />
        </Box>
      ))}
    </LegoEmbeddedContext.Provider>
  </LegoShell>
);

export default LegoOwnerPage;
