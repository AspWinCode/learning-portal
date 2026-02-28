import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import Layout from '../components/Layout';
import { PersonalFinanceProvider } from '../contexts/PersonalFinanceContext';
import { FinanceDashboardTab } from './personalFinance/FinanceDashboardTab';
import { FinanceOperationsTab } from './personalFinance/FinanceOperationsTab';
import { FinanceArticlesTab } from './personalFinance/FinanceArticlesTab';
import { FinanceRecognitionTab } from './personalFinance/FinanceRecognitionTab';

const TAB_DASHBOARD = 'dashboard';
const TAB_OPERATIONS = 'operations';
const TAB_ARTICLES = 'articles';
const TAB_RECOGNITION = 'recognition';

const PersonalFinancePageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || TAB_DASHBOARD;
  const effectiveTab = [TAB_DASHBOARD, TAB_OPERATIONS, TAB_ARTICLES, TAB_RECOGNITION].includes(tab) ? tab : TAB_DASHBOARD;

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_DASHBOARD ? {} : { tab: value });
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Tabs value={effectiveTab} onChange={handleTabChange} sx={{ mb: 2 }}>
        <Tab label="Дашборд по финансам" value={TAB_DASHBOARD} />
        <Tab label="Операции" value={TAB_OPERATIONS} />
        <Tab label="Настройки статей" value={TAB_ARTICLES} />
        <Tab label="Опознавание" value={TAB_RECOGNITION} />
      </Tabs>
      {effectiveTab === TAB_DASHBOARD && <FinanceDashboardTab />}
      {effectiveTab === TAB_OPERATIONS && <FinanceOperationsTab />}
      {effectiveTab === TAB_ARTICLES && <FinanceArticlesTab />}
      {effectiveTab === TAB_RECOGNITION && <FinanceRecognitionTab />}
    </Box>
  );
};

const PersonalFinancePage: React.FC = () => (
  <Layout>
    <PersonalFinanceProvider>
      <PersonalFinancePageContent />
    </PersonalFinanceProvider>
  </Layout>
);

export default PersonalFinancePage;
