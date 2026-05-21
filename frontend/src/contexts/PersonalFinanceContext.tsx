import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FinanceArticle,
  FinanceOperation,
  RecognitionRule,
  OperationTarget,
} from '../types/personalFinance';
import {
  PersonalFinanceAccount,
  PersonalFinanceCategory,
  PersonalFinanceRule as PersonalFinanceRuleRow,
  PersonalFinanceTransaction,
} from '../types';
import { personalFinanceApi } from '../services/api';

interface PersonalFinanceContextValue {
  articles: FinanceArticle[];
  operations: FinanceOperation[];
  addArticle: (article: Omit<FinanceArticle, 'id'>) => string;
  updateArticle: (id: string, patch: Partial<FinanceArticle>) => void;
  deleteArticle: (id: string) => void;
  deleteArticles: (ids: string[]) => void;
  addOperation: (op: Omit<FinanceOperation, 'id' | 'createdAt'>) => void;
  addOperations: (ops: Omit<FinanceOperation, 'id' | 'createdAt'>[]) => void;
  updateOperation: (id: string, patch: Partial<FinanceOperation>) => void;
  deleteOperation: (id: string) => void;
  deleteOperations: (ids: string[]) => void;
  incomeArticles: FinanceArticle[];
  expenseArticles: FinanceArticle[];
  recognitionRules: RecognitionRule[];
  addRecognitionRule: (rule: Omit<RecognitionRule, 'id'>) => void;
  updateRecognitionRule: (id: string, patch: Partial<Pick<RecognitionRule, 'pattern' | 'displayName'>>) => void;
  deleteRecognitionRule: (id: string) => void;
  getDisplayDescription: (description: string) => string;
  refreshAll: () => Promise<void>;
}

const PersonalFinanceContext = createContext<PersonalFinanceContextValue | null>(null);

const PERSONAL_FINANCE_QUERY_KEY = ['personal-finance'] as const;

function getOperationTarget(account?: PersonalFinanceAccount | null): OperationTarget {
  const raw = String(account?.name || '').trim().toLowerCase();
  if (raw === 'academy' || raw === 'personal' || raw === 'gogol_mogol' || raw === 'leninets') {
    return raw;
  }
  return 'personal';
}

function mapCategoryToArticle(category: PersonalFinanceCategory, index: number): FinanceArticle {
  return {
    id: String(category.id),
    name: category.name,
    type: category.direction,
    order: index,
  };
}

function mapTransactionToOperation(tx: PersonalFinanceTransaction): FinanceOperation {
  const occurred = String(tx.occurred_at || '').slice(0, 10);
  const amount = tx.direction === 'income' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
  return {
    id: String(tx.id),
    date: occurred,
    amount,
    description: tx.description || tx.article || '',
    target: getOperationTarget(tx.account),
    articleId: tx.category_id != null ? String(tx.category_id) : null,
    createdAt: tx.created_at || tx.occurred_at,
  };
}

function mapRuleToRecognition(rule: PersonalFinanceRuleRow): RecognitionRule {
  return {
    id: String(rule.id),
    pattern: rule.pattern,
    displayName: rule.display_name || rule.category?.name || rule.pattern,
  };
}

function occurredAtFromDate(dateValue: string): string {
  return `${dateValue}T12:00:00`;
}

export const PersonalFinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: [...PERSONAL_FINANCE_QUERY_KEY, 'accounts'],
    queryFn: () => personalFinanceApi.listAccounts(),
  });
  const categoriesQuery = useQuery({
    queryKey: [...PERSONAL_FINANCE_QUERY_KEY, 'categories'],
    queryFn: () => personalFinanceApi.listCategories(),
  });
  const rulesQuery = useQuery({
    queryKey: [...PERSONAL_FINANCE_QUERY_KEY, 'rules'],
    queryFn: () => personalFinanceApi.listRules(),
  });
  const transactionsQuery = useQuery({
    queryKey: [...PERSONAL_FINANCE_QUERY_KEY, 'transactions'],
    queryFn: () => personalFinanceApi.listTransactions({ limit: 10000 }),
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PERSONAL_FINANCE_QUERY_KEY });
  }, [queryClient]);

  const resolveAccountId = useCallback(
    (target: OperationTarget): number => {
      const account = accounts.find((item) => getOperationTarget(item) === target) || accounts[0];
      if (!account) {
        throw new Error('Personal finance accounts are not loaded yet');
      }
      return account.id;
    },
    [accounts]
  );

  const articles = useMemo(
    () => categories.map((category, index) => mapCategoryToArticle(category, index)),
    [categories]
  );
  const operations = useMemo(
    () => transactions.map(mapTransactionToOperation),
    [transactions]
  );
  const incomeArticles = useMemo(
    () => articles.filter((item) => item.type === 'income').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );
  const expenseArticles = useMemo(
    () => articles.filter((item) => item.type === 'expense').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );
  const recognitionRules = useMemo(
    () => rules.map(mapRuleToRecognition),
    [rules]
  );

  const addArticle = useCallback(
    (article: Omit<FinanceArticle, 'id'>) => {
      const tempId = `temp_${Date.now()}`;
      void (async () => {
        await personalFinanceApi.createCategory({
          name: article.name,
          direction: article.type,
        });
        await refreshAll();
      })();
      return tempId;
    },
    [refreshAll]
  );

  const updateArticle = useCallback(
    (id: string, patch: Partial<FinanceArticle>) => {
      void (async () => {
        await personalFinanceApi.updateCategory(Number(id), {
          name: patch.name,
          direction: patch.type,
        });
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const deleteArticle = useCallback(
    (id: string) => {
      void (async () => {
        await personalFinanceApi.updateCategory(Number(id), { is_active: false });
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const deleteArticles = useCallback(
    (ids: string[]) => {
      void (async () => {
        await Promise.all(ids.map((id) => personalFinanceApi.updateCategory(Number(id), { is_active: false })));
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const addOperation = useCallback(
    (op: Omit<FinanceOperation, 'id' | 'createdAt'>) => {
      void (async () => {
        await personalFinanceApi.createTransaction({
          account_id: resolveAccountId(op.target),
          amount: Math.abs(op.amount),
          direction: op.amount >= 0 ? 'income' : 'expense',
          description: op.description,
          occurred_at: occurredAtFromDate(op.date),
          category_id: op.articleId && !String(op.articleId).startsWith('temp_') ? Number(op.articleId) : null,
        });
        await refreshAll();
      })();
    },
    [refreshAll, resolveAccountId]
  );

  const addOperations = useCallback(
    (ops: Omit<FinanceOperation, 'id' | 'createdAt'>[]) => {
      void (async () => {
        for (const op of ops) {
          await personalFinanceApi.createTransaction({
            account_id: resolveAccountId(op.target),
            amount: Math.abs(op.amount),
            direction: op.amount >= 0 ? 'income' : 'expense',
            description: op.description,
            occurred_at: occurredAtFromDate(op.date),
            category_id: op.articleId && !String(op.articleId).startsWith('temp_') ? Number(op.articleId) : null,
          });
        }
        await refreshAll();
      })();
    },
    [refreshAll, resolveAccountId]
  );

  const updateOperation = useCallback(
    (id: string, patch: Partial<FinanceOperation>) => {
      void (async () => {
        const payload: {
          account_id?: number;
          amount?: number;
          direction?: 'income' | 'expense';
          description?: string | null;
          occurred_at?: string;
          category_id?: number | null;
        } = {};
        if (patch.target !== undefined) {
          payload.account_id = resolveAccountId(patch.target);
        }
        if (patch.amount !== undefined) {
          payload.amount = Math.abs(patch.amount);
          payload.direction = patch.amount >= 0 ? 'income' : 'expense';
        }
        if (patch.description !== undefined) {
          payload.description = patch.description;
        }
        if (patch.date !== undefined) {
          payload.occurred_at = occurredAtFromDate(patch.date);
        }
        if (patch.articleId !== undefined) {
          payload.category_id = patch.articleId ? Number(patch.articleId) : null;
        }
        await personalFinanceApi.updateTransaction(Number(id), payload);
        await refreshAll();
      })();
    },
    [refreshAll, resolveAccountId]
  );

  const deleteOperation = useCallback(
    (id: string) => {
      void (async () => {
        await personalFinanceApi.deleteTransaction(Number(id));
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const deleteOperations = useCallback(
    (ids: string[]) => {
      void (async () => {
        await Promise.all(ids.map((id) => personalFinanceApi.deleteTransaction(Number(id))));
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const addRecognitionRule = useCallback(
    (rule: Omit<RecognitionRule, 'id'>) => {
      void (async () => {
        const matchedCategory = categories.find((item) => item.name.trim().toLowerCase() === rule.displayName.trim().toLowerCase());
        await personalFinanceApi.createRule({
          pattern: rule.pattern,
          category_id: matchedCategory?.id ?? null,
          display_name: rule.displayName,
        });
        await refreshAll();
      })();
    },
    [categories, refreshAll]
  );

  const updateRecognitionRule = useCallback(
    (id: string, patch: Partial<Pick<RecognitionRule, 'pattern' | 'displayName'>>) => {
      void (async () => {
        const displayName = patch.displayName;
        const matchedCategory =
          displayName != null
            ? categories.find((item) => item.name.trim().toLowerCase() === displayName.trim().toLowerCase())
            : undefined;
        await personalFinanceApi.updateRule(Number(id), {
          pattern: patch.pattern,
          category_id: matchedCategory ? matchedCategory.id : undefined,
          display_name: patch.displayName,
        });
        await refreshAll();
      })();
    },
    [categories, refreshAll]
  );

  const deleteRecognitionRule = useCallback(
    (id: string) => {
      void (async () => {
        await personalFinanceApi.deleteRule(Number(id));
        await refreshAll();
      })();
    },
    [refreshAll]
  );

  const getDisplayDescription = useCallback(
    (description: string) => {
      const trimmed = description.trim();
      if (!trimmed) return description;
      const matching = recognitionRules.filter((rule) => {
        const pattern = rule.pattern.trim();
        return pattern && (trimmed === pattern || trimmed.includes(pattern));
      });
      if (matching.length === 0) return description;
      const best = matching.reduce((left, right) => (left.pattern.length >= right.pattern.length ? left : right));
      return best.displayName;
    },
    [recognitionRules]
  );

  const value = useMemo<PersonalFinanceContextValue>(
    () => ({
      articles,
      operations,
      addArticle,
      updateArticle,
      deleteArticle,
      deleteArticles,
      addOperation,
      addOperations,
      updateOperation,
      deleteOperation,
      deleteOperations,
      incomeArticles,
      expenseArticles,
      recognitionRules,
      addRecognitionRule,
      updateRecognitionRule,
      deleteRecognitionRule,
      getDisplayDescription,
      refreshAll,
    }),
    [
      articles,
      operations,
      addArticle,
      updateArticle,
      deleteArticle,
      deleteArticles,
      addOperation,
      addOperations,
      updateOperation,
      deleteOperation,
      deleteOperations,
      incomeArticles,
      expenseArticles,
      recognitionRules,
      addRecognitionRule,
      updateRecognitionRule,
      deleteRecognitionRule,
      getDisplayDescription,
      refreshAll,
    ]
  );

  return <PersonalFinanceContext.Provider value={value}>{children}</PersonalFinanceContext.Provider>;
};

export function usePersonalFinance() {
  const ctx = useContext(PersonalFinanceContext);
  if (!ctx) {
    throw new Error('usePersonalFinance must be used within PersonalFinanceProvider');
  }
  return ctx;
}
