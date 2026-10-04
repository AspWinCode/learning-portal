import React from 'react';
import { LegoEmbeddedContext, LegoShell } from './LegoShell';
import LegoTodayPage from './LegoTodayPage';
import LegoStudentsPage from './LegoStudentsPage';
import LegoGroupsPage from './LegoGroupsPage';
import LegoLessonsPage from './LegoLessonsPage';
import LegoDebtsPage from './LegoDebtsPage';
import LegoPaymentsPage from './LegoPaymentsPage';

// Единая страница LEGO для владельца: все разделы на одном экране.
// Разделы — те же страницы, встроенные через LegoEmbeddedContext (без Layout и вкладок).
const LegoOwnerPage: React.FC = () => (
  <LegoShell title="Все разделы" tabs={false}>
    <LegoEmbeddedContext.Provider value={true}>
      <LegoTodayPage />
      <LegoGroupsPage />
      <LegoStudentsPage />
      <LegoLessonsPage />
      <LegoDebtsPage />
      <LegoPaymentsPage />
    </LegoEmbeddedContext.Provider>
  </LegoShell>
);

export default LegoOwnerPage;
