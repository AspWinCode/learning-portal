import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  FinanceArticle,
  FinanceOperation,
  RecognitionRule,
  STORAGE_ARTICLES,
  STORAGE_RECOGNITION,
  OperationTarget,
} from '../types/personalFinance';
import type { FinanceLedgerTransactionRow } from '../types';
import { financeApi } from '../services/api';
import { addAcademyOperation } from '../utils/academyOperationsStorage';

function loadArticles(): FinanceArticle[] {
  try {
    const raw = localStorage.getItem(STORAGE_ARTICLES);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveArticles(articles: FinanceArticle[]) {
  localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(articles));
}

function mapLedgerToOperation(tx: FinanceLedgerTransactionRow): FinanceOperation {
  const occurred = tx.occurred_at ? String(tx.occurred_at).slice(0, 10) : '';
  const amount =
    tx.direction === 'income' ? Math.abs(tx.amount) : tx.direction === 'expense' ? -Math.abs(tx.amount) : tx.amount;
  const rawTarget = (tx.target_code || 'personal') as OperationTarget;
  const target: OperationTarget =
    rawTarget === 'academy' || rawTarget === 'personal' || rawTarget === 'gogol_mogol' || rawTarget === 'leninets'
      ? rawTarget
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
}

function loadRecognition(): RecognitionRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECOGNITION);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveRecognition(rules: RecognitionRule[]) {
  localStorage.setItem(STORAGE_RECOGNITION, JSON.stringify(rules));
}

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
}

const PersonalFinanceContext = createContext<PersonalFinanceContextValue | null>(null);

export const PersonalFinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [articles, setArticles] = useState<FinanceArticle[]>(loadArticles);
  const [operations, setOperations] = useState<FinanceOperation[]>([]);
  const [recognitionRules, setRecognitionRules] = useState<RecognitionRule[]>(loadRecognition);

  const persistArticles = useCallback((next: FinanceArticle[]) => {
    setArticles(next);
    saveArticles(next);
  }, []);

  const persistOperations = useCallback((next: FinanceOperation[]) => {
    setOperations(next);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const txs = await financeApi.listLedgerTransactions({
          target_codes: ['personal', 'leninets', 'gogol_mogol', 'academy'],
          limit: 10000,
        });
        const mapped = txs.map(mapLedgerToOperation);
        setOperations(mapped);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load personal finance operations from ledger', err);
      }
    };
    void load();
  }, []);

  const addArticle = useCallback(
    (article: Omit<FinanceArticle, 'id'>) => {
      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newArt: FinanceArticle = { ...article, id, order: articles.length };
      persistArticles([...articles, newArt]);
      return id;
    },
    [articles, persistArticles]
  );

  const updateArticle = useCallback(
    (id: string, patch: Partial<FinanceArticle>) => {
      persistArticles(
        articles.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    [articles, persistArticles]
  );

  const deleteArticle = useCallback(
    (id: string) => {
      persistArticles(articles.filter((a) => a.id !== id));
    },
    [articles, persistArticles]
  );

  const deleteArticles = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      persistArticles(articles.filter((a) => !set.has(a.id)));
    },
    [articles, persistArticles]
  );

  const addOperation = useCallback(
    (op: Omit<FinanceOperation, 'id' | 'createdAt'>) => {
      financeApi
        .createPersonalOperation({
          date: op.date,
          amount: op.amount,
          description: op.description,
          target_code: op.target,
        })
        .then((tx) => {
          setOperations((prev) => [...prev, mapLedgerToOperation(tx)]);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to create personal operation in ledger', err);
          const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const createdAt = new Date().toISOString();
          setOperations((prev) => [...prev, { ...op, id, createdAt }]);
        });
    },
    []
  );

  const addOperations = useCallback((ops: Omit<FinanceOperation, 'id' | 'createdAt'>[]) => {
    ops.forEach((op, index) => {
      financeApi
        .createPersonalOperation({
          date: op.date,
          amount: op.amount,
          description: op.description,
          target_code: op.target,
        })
        .then((tx) => {
          setOperations((prev) => [...prev, mapLedgerToOperation(tx)]);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to create personal operation in ledger (bulk)', err);
          const id = `op_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
          const createdAt = new Date().toISOString();
          setOperations((prev) => [...prev, { ...op, id, createdAt }]);
        });
    });
  }, []);

  const updateOperation = useCallback(
    (id: string, patch: Partial<FinanceOperation>) => {
      if (patch.target === 'academy') {
        const op = operations.find((o) => o.id === id);
        if (op) {
          addAcademyOperation({ ...op, target: 'academy' });
          persistOperations(operations.filter((o) => o.id !== id));
        }
        return;
      }
      const isLedger = id.startsWith('ledger_');
      const txId = isLedger ? Number(id.replace('ledger_', '')) : null;
      if (isLedger && txId) {
        const payload: { target_id?: number | null; article_id?: number | null } = {};
        if (patch.target !== undefined) {
          // target_id подставляем по коду через API listTargets только при создании; здесь ограничимся локальным обновлением
        }
        if (patch.articleId !== undefined) {
          payload.article_id = patch.articleId ? Number(patch.articleId) : null;
        }
        if (Object.keys(payload).length > 0) {
          financeApi
            .updateTransaction(txId, payload)
            .then((updated) => {
              setOperations((prev) =>
                prev.map((o) => (o.id === id ? mapLedgerToOperation(updated as any) : o))
              );
            })
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.error('Failed to update personal operation in ledger', err);
            });
          return;
        }
      }
      persistOperations(operations.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    },
    [operations, persistOperations]
  );

  const deleteOperation = useCallback(
    (id: string) => {
      const isLedger = id.startsWith('ledger_');
      const txId = isLedger ? Number(id.replace('ledger_', '')) : null;
      if (isLedger && txId) {
        financeApi
          .deleteTransaction(txId)
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error('Failed to delete personal operation in ledger', err);
          })
          .finally(() => {
            setOperations((prev) => prev.filter((o) => o.id !== id));
          });
      } else {
        persistOperations(operations.filter((o) => o.id !== id));
      }
    },
    [operations, persistOperations]
  );

  const deleteOperations = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      const ledgerIds: number[] = [];
      ids.forEach((id) => {
        if (id.startsWith('ledger_')) {
          const txId = Number(id.replace('ledger_', ''));
          if (txId) ledgerIds.push(txId);
        }
      });
      if (ledgerIds.length > 0) {
        Promise.all(
          ledgerIds.map((txId) =>
            financeApi.deleteTransaction(txId).catch((err) => {
              // eslint-disable-next-line no-console
              console.error('Failed to delete personal operation in ledger (bulk)', err);
            })
          )
        ).finally(() => {
          setOperations((prev) => prev.filter((o) => !set.has(o.id)));
        });
      } else {
        persistOperations(operations.filter((o) => !set.has(o.id)));
      }
    },
    [operations, persistOperations]
  );

  const incomeArticles = useMemo(
    () => articles.filter((a) => a.type === 'income').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );
  const expenseArticles = useMemo(
    () => articles.filter((a) => a.type === 'expense').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );

  const persistRecognition = useCallback((next: RecognitionRule[]) => {
    setRecognitionRules(next);
    saveRecognition(next);
  }, []);

  const addRecognitionRule = useCallback(
    (rule: Omit<RecognitionRule, 'id'>) => {
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      persistRecognition([...recognitionRules, { ...rule, id }]);
    },
    [recognitionRules, persistRecognition]
  );

  const updateRecognitionRule = useCallback(
    (id: string, patch: Partial<Pick<RecognitionRule, 'pattern' | 'displayName'>>) => {
      persistRecognition(
        recognitionRules.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [recognitionRules, persistRecognition]
  );

  const deleteRecognitionRule = useCallback(
    (id: string) => {
      persistRecognition(recognitionRules.filter((r) => r.id !== id));
    },
    [recognitionRules, persistRecognition]
  );

  const getDisplayDescription = useCallback(
    (description: string) => {
      const trimmed = description.trim();
      if (!trimmed) return description;
      const matching = recognitionRules.filter(
        (r) => {
          const p = r.pattern.trim();
          return p && (trimmed === p || trimmed.includes(p));
        }
      );
      if (matching.length === 0) return description;
      const best = matching.reduce((a, b) => (a.pattern.length >= b.pattern.length ? a : b));
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
    ]
  );

  return (
    <PersonalFinanceContext.Provider value={value}>
      {children}
    </PersonalFinanceContext.Provider>
  );
};

export function usePersonalFinance() {
  const ctx = useContext(PersonalFinanceContext);
  if (!ctx) throw new Error('usePersonalFinance must be used within PersonalFinanceProvider');
  return ctx;
}
