import { useState, useCallback, useEffect } from 'react';
import { StaffMember, StaffLoanSummary } from '../types';
import { getStaff, getStaffLoanSummary } from '../api';

export function useStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loanSummary, setLoanSummary] = useState<StaffLoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [staffData, summaryData] = await Promise.all([
        getStaff(true), // active only
        getStaffLoanSummary()
      ]);
      setStaff(staffData);
      setLoanSummary(summaryData);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    staff,
    loanSummary,
    loading,
    error,
    refetch: fetchData,
  };
}
