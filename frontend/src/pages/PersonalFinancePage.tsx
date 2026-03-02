import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs, Button, Alert, FormControlLabel, Switch } from '@mui/material';
import Layout from '../components/Layout';
import { PersonalFinanceProvider } from '../contexts/PersonalFinanceContext';
import { FinanceDashboardTab } from './personalFinance/FinanceDashboardTab';
import { FinanceOperationsTab } from './personalFinance/FinanceOperationsTab';
import { FinanceArticlesTab } from './personalFinance/FinanceArticlesTab';
import { FinanceRecognitionTab } from './personalFinance/FinanceRecognitionTab';
import { financeApi } from '../services/api';
import {
  STORAGE_ARTICLES,
  STORAGE_OPERATIONS,
  STORAGE_RECOGNITION,
} from '../types/personalFinance';
import type { FinanceOperation, FinanceArticle, OperationTarget } from '../types/personalFinance';
import type { FinanceLedgerTransactionRow } from '../types';

const TAB_DASHBOARD = 'dashboard';
const TAB_OPERATIONS = 'operations';
const TAB_ARTICLES = 'articles';
const TAB_RECOGNITION = 'recognition';

const PERSONAL_TARGETS: OperationTarget[] = ['personal', 'leninets', 'gogol_mogol', 'academy'];

function mapLedgerToOperations(txs: FinanceLedgerTransactionRow[]): FinanceOperation[] {
  return txs.map((tx) => {
    const occurred = tx.occurred_at ? String(tx.occurred_at).slice(0, 10) : '';
    const amount =
      tx.direction === 'income' ? Math.abs(tx.amount) : tx.direction === 'expense' ? -Math.abs(tx.amount) : tx.amount;
    const target: OperationTarget = PERSONAL_TARGETS.includes((tx.target_code as OperationTarget))
      ? (tx.target_code as OperationTarget)
      : 'personal';
    return {
      id: `ledger_${tx.id}`,
      date: occurred,
      amount,
      description: tx.counterparty_name || tx.description_raw || '',
      target,
      articleId: tx.article_id != null ? String(tx.article_id) : null,
      createdAt: tx.occurred_at || new Date().toISOString(),
    };
  });
}

function mapLedgerArticlesToContext(
  articles: Array<{ id: number; name: string; direction: string; scope: string }>
): { income: FinanceArticle[]; expense: FinanceArticle[] } {
  const income: FinanceArticle[] = [];
  const expense: FinanceArticle[] = [];
  articles.forEach((a, i) => {
    const art: FinanceArticle = { id: String(a.id), name: a.name, type: a.direction as 'income' | 'expense', order: i };
    if (a.direction === 'income') income.push(art);
    else expense.push(art);
  });
  return { income, expense };
}

const PersonalFinancePageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || TAB_DASHBOARD;
  const effectiveTab = [TAB_DASHBOARD, TAB_OPERATIONS, TAB_ARTICLES, TAB_RECOGNITION].includes(tab) ? tab : TAB_DASHBOARD;
  const [migrateResult, setMigrateResult] = useState<null | { ok: boolean; message: string }>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);

  const [useLedgerSource, setUseLedgerSource] = useState(false);
  const [ledgerTransactions, setLedgerTransactions] = useState<FinanceLedgerTransactionRow[]>([]);
  const [ledgerArticles, setLedgerArticles] = useState<Array<{ id: number; name: string; direction: string; scope: string }>>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    if (!useLedgerSource) return;
    setLedgerLoading(true);
    setLedgerError(null);
    Promise.all([financeApi.listLedgerTransactions({ limit: 10000 }), financeApi.listArticles({ scope: 'personal' })])
      .then(([txs, arts]) => {
        setLedgerTransactions(txs);
        setLedgerArticles(arts);
      })
      .catch((err: any) => {
        setLedgerError(err?.response?.data?.detail || err?.message || 'Ошибка загрузки журнала');
      })
      .finally(() => setLedgerLoading(false));
  }, [useLedgerSource]);

  const ledgerOperations = useMemo(
    () => (useLedgerSource ? mapLedgerToOperations(ledgerTransactions) : []),
    [useLedgerSource, ledgerTransactions]
  );
  const { income: ledgerIncomeArticles, expense: ledgerExpenseArticles } = useMemo(
    () => mapLedgerArticlesToContext(ledgerArticles),
    [ledgerArticles]
  );

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_DASHBOARD ? {} : { tab: value });
  };

  const handleMigrateToLedger = async () => {
    if (!window.confirm('Перенести текущие «Личные финансы» в единый финансовый журнал? Операции будут добавлены в общий журнал, но localStorage не будет очищен автоматически.')) {
      return;
    }
    setMigrateLoading(true);
    setMigrateError(null);
    setMigrateResult(null);
    try {
      const rawArticles = localStorage.getItem(STORAGE_ARTICLES);
      const rawOps = localStorage.getItem(STORAGE_OPERATIONS);
      const rawRules = localStorage.getItem(STORAGE_RECOGNITION);
      const articles = rawArticles ? JSON.parse(rawArticles) : [];
      const operations = rawOps ? JSON.parse(rawOps) : [];
      const recognitionRules = rawRules ? JSON.parse(rawRules) : [];

      const res = await financeApi.migratePersonalFinance({
        articles,
        operations,
        recognitionRules,
      });
      setMigrateResult({
        ok: true,
        message: `Перенесено: статей ${res.articles_created}, операций ${res.operations_created}, правил ${res.recognition_rules_created}.`,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Ошибка миграции «Личных финансов»';
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
          {migrateResult.message}
        </Alert>
      )}
      {ledgerError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setLedgerError(null)}>
          {ledgerError}
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Tabs value={effectiveTab} onChange={handleTabChange}>
          <Tab label="Дашборд по финансам" value={TAB_DASHBOARD} />
          <Tab label="Операции" value={TAB_OPERATIONS} />
          <Tab label="Настройки статей" value={TAB_ARTICLES} />
          <Tab label="Опознавание" value={TAB_RECOGNITION} />
        </Tabs>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {effectiveTab === TAB_DASHBOARD && (
            <FormControlLabel
              control={
                <Switch
                  checked={useLedgerSource}
                  onChange={(e) => setUseLedgerSource(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label="Показывать из единого журнала"
            />
          )}
          <Button
            variant="outlined"
            size="small"
            onClick={handleMigrateToLedger}
            disabled={migrateLoading}
          >
            {migrateLoading ? 'Перенос…' : 'Перенести в единый журнал'}
          </Button>
        </Box>
      </Box>
      {effectiveTab === TAB_DASHBOARD && (
        <FinanceDashboardTab
          useLedgerSource={useLedgerSource}
          ledgerLoading={ledgerLoading}
          ledgerOperations={ledgerOperations}
          ledgerIncomeArticles={ledgerIncomeArticles}
          ledgerExpenseArticles={ledgerExpenseArticles}
        />
      )}
      {effectiveTab === TAB_OPERATIONS && (
        <FinanceOperationsTab
          useLedgerSource={useLedgerSource}
          ledgerLoading={ledgerLoading}
          ledgerOperations={ledgerOperations}
          ledgerIncomeArticles={ledgerIncomeArticles}
          ledgerExpenseArticles={ledgerExpenseArticles}
        />
      )}
      {effectiveTab === TAB_ARTICLES && <FinanceArticlesTab useLedgerSource={useLedgerSource} />}
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
