import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs, Button, Alert } from '@mui/material';
import Layout from '../components/Layout';
import { PersonalFinanceProvider, usePersonalFinance } from '../contexts/PersonalFinanceContext';
import { FinanceDashboardTab } from './personalFinance/FinanceDashboardTab';
import { FinanceOperationsTab } from './personalFinance/FinanceOperationsTab';
import { FinanceArticlesTab } from './personalFinance/FinanceArticlesTab';
import { FinanceRecognitionTab } from './personalFinance/FinanceRecognitionTab';
import { personalFinanceApi } from '../services/api';
import {
  STORAGE_ARTICLES,
  STORAGE_OPERATIONS,
  STORAGE_RECOGNITION,
  FinanceArticle,
  FinanceOperation,
  RecognitionRule,
} from '../types/personalFinance';

const TAB_DASHBOARD = 'dashboard';
const TAB_OPERATIONS = 'operations';
const TAB_ARTICLES = 'articles';
const TAB_RECOGNITION = 'recognition';

function loadLegacyJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PersonalFinancePageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshAll } = usePersonalFinance();
  const tab = searchParams.get('tab') || TAB_DASHBOARD;
  const effectiveTab = [TAB_DASHBOARD, TAB_OPERATIONS, TAB_ARTICLES, TAB_RECOGNITION].includes(tab) ? tab : TAB_DASHBOARD;
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_DASHBOARD ? {} : { tab: value });
  };

  const handleImportLegacy = async () => {
    if (
      !window.confirm(
        'Перенести текущие данные личных финансов из localStorage в базу данных? Старые данные в браузере автоматически не очищаются.'
      )
    ) {
      return;
    }
    setMigrateLoading(true);
    setMigrateError(null);
    setMigrateResult(null);
    try {
      const accounts = await personalFinanceApi.listAccounts();
      const categories = await personalFinanceApi.listCategories();
      let createdCategoriesCount = 0;

      const accountByName = new Map(accounts.map((item) => [item.name.trim().toLowerCase(), item.id]));
      const categoryById = new Map(categories.map((item) => [String(item.id), item]));
      const categoryByNameDirection = new Map(
        categories.map((item) => [`${item.direction}:${item.name.trim().toLowerCase()}`, item.id])
      );

      const legacyArticles = loadLegacyJson<FinanceArticle>(STORAGE_ARTICLES);
      const legacyOperations = loadLegacyJson<FinanceOperation>(STORAGE_OPERATIONS);
      const legacyRules = loadLegacyJson<RecognitionRule>(STORAGE_RECOGNITION);

      const payloadCategories = legacyArticles.map((item) => ({
        name: item.name,
        direction: item.type,
      }));

      for (const item of payloadCategories) {
        const key = `${item.direction}:${item.name.trim().toLowerCase()}`;
        if (!categoryByNameDirection.has(key)) {
          const created = await personalFinanceApi.createCategory(item);
          categoryByNameDirection.set(key, created.id);
          createdCategoriesCount += 1;
        }
      }

      const refreshedCategories = await personalFinanceApi.listCategories();
      const refreshedCategoryById = new Map(refreshedCategories.map((item) => [String(item.id), item]));

      const transactions = legacyOperations
        .map((item) => {
          const accountId = accountByName.get(item.target);
          if (!accountId) return null;
          let categoryId: number | null = null;
          if (item.articleId) {
            const existing = refreshedCategoryById.get(String(item.articleId)) || categoryById.get(String(item.articleId));
            if (existing) {
              categoryId = existing.id;
            } else {
              const article = legacyArticles.find((candidate) => candidate.id === item.articleId);
              if (article) {
                categoryId = categoryByNameDirection.get(`${article.type}:${article.name.trim().toLowerCase()}`) ?? null;
              }
            }
          }
          return {
            account_id: accountId,
            amount: Math.abs(item.amount),
            direction: item.amount >= 0 ? 'income' as const : 'expense' as const,
            description: item.description,
            occurred_at: `${item.date}T12:00:00`,
            category_id: categoryId,
          };
        })
        .filter(Boolean) as Array<{
          account_id: number;
          amount: number;
          direction: 'income' | 'expense';
          description?: string | null;
          occurred_at: string;
          category_id?: number | null;
        }>;

      const rules = legacyRules.map((item) => ({
        pattern: item.pattern,
        display_name: item.displayName,
        category_id:
          refreshedCategories.find((candidate) => candidate.name.trim().toLowerCase() === item.displayName.trim().toLowerCase())?.id ??
          null,
      }));

      const result = await personalFinanceApi.importLegacy({
        accounts: [],
        categories: [],
        transactions,
        rules,
      });
      await refreshAll();
      setMigrateResult(
        `Перенесено: счетов ${result.accounts_created}, статей ${createdCategoriesCount}, операций ${result.transactions_created}, правил ${result.rules_created}.`
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Ошибка переноса личных финансов в БД';
      setMigrateError(String(msg));
    } finally {
      setMigrateLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {migrateError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMigrateError(null)}>
          {migrateError}
        </Alert>
      )}
      {migrateResult && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMigrateResult(null)}>
          {migrateResult}
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Tabs value={effectiveTab} onChange={handleTabChange}>
          <Tab label="Дашборд по финансам" value={TAB_DASHBOARD} />
          <Tab label="Операции" value={TAB_OPERATIONS} />
          <Tab label="Настройки статей" value={TAB_ARTICLES} />
          <Tab label="Опознавание" value={TAB_RECOGNITION} />
        </Tabs>
        <Button variant="outlined" size="small" onClick={handleImportLegacy} disabled={migrateLoading}>
          {migrateLoading ? 'Перенос...' : 'Импорт из localStorage'}
        </Button>
      </Box>
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
