import { useState, useCallback, useEffect } from 'react';
import { UnreturnedLoan, TransactionRow, StaffLoanHistory, LoanFilter, TransactionFilter } from '../types';
import { getUnreturnedLoans, getTransactions, getStaffLoanHistory } from '../api';

export function useTransactions() {
  const [unreturnedLoans, setUnreturnedLoans] = useState<UnreturnedLoan[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loanHistory, setLoanHistory] = useState<StaffLoanHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnreturned = useCallback(async (filter: LoanFilter = {}) => {
    try {
      const data = await getUnreturnedLoans(filter);
      setUnreturnedLoans(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTransactions = useCallback(async (filter: TransactionFilter = {}) => {
    try {
      const data = await getTransactions(filter);
      setTransactions(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchLoanHistory = useCallback(async (filter: LoanFilter = {}) => {
    try {
      const data = await getStaffLoanHistory(filter);
      setLoanHistory(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchUnreturned(),
        fetchTransactions()
      ]);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchUnreturned, fetchTransactions]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    unreturnedLoans,
    transactions,
    loanHistory,
    loading,
    error,
    refreshAll,
    fetchLoanHistory
  };
}
