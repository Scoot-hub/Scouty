import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type OperationType = 'enrichment' | 'import';

export interface Operation {
  id: string;
  type: OperationType;
  label: string;
  current: number;
  total: number;
  /** Set when the operation is done */
  done: boolean;
  /** Number of new items created */
  newCount?: number;
  /** Number of updated items */
  updatedCount?: number;
  /** Number of errors */
  errorCount?: number;
}

interface OperationBannerContextValue {
  operations: Operation[];
  addOperation: (op: Omit<Operation, 'done'>) => void;
  updateOperation: (id: string, patch: Partial<Operation>) => void;
  completeOperation: (id: string, result: { newCount?: number; updatedCount?: number; errorCount?: number }) => void;
  dismissOperation: (id: string) => void;
  dismissAll: () => void;
}

const OperationBannerContext = createContext<OperationBannerContextValue | null>(null);

export function OperationBannerProvider({ children }: { children: ReactNode }) {
  const [operations, setOperations] = useState<Operation[]>([]);

  const addOperation = useCallback((op: Omit<Operation, 'done'>) => {
    setOperations(prev => [...prev.filter(o => o.id !== op.id), { ...op, done: false }]);
  }, []);

  const updateOperation = useCallback((id: string, patch: Partial<Operation>) => {
    setOperations(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  }, []);

  const completeOperation = useCallback((id: string, result: { newCount?: number; updatedCount?: number; errorCount?: number }) => {
    setOperations(prev => prev.map(o =>
      o.id === id ? { ...o, done: true, current: o.total, ...result } : o
    ));
  }, []);

  const dismissOperation = useCallback((id: string) => {
    setOperations(prev => prev.filter(o => o.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setOperations(prev => prev.filter(o => !o.done));
  }, []);

  return (
    <OperationBannerContext.Provider value={{ operations, addOperation, updateOperation, completeOperation, dismissOperation, dismissAll }}>
      {children}
    </OperationBannerContext.Provider>
  );
}

export function useOperationBanner() {
  const ctx = useContext(OperationBannerContext);
  if (!ctx) throw new Error('useOperationBanner must be used within OperationBannerProvider');
  return ctx;
}
