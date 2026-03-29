import { useState, useCallback, useEffect } from 'react';
import { InstrumentRow, Category, InventoryFilter } from '../types';
import { getInventory, getCategories } from '../api';

export function useInventory() {
  const [items, setItems] = useState<InstrumentRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async (filter: InventoryFilter = {}) => {
    try {
      setLoading(true);
      const data = await getInventory(filter);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchCategories();
    fetchItems({ active_only: true }); // By default, only show active
  }, [fetchCategories, fetchItems]);

  return {
    items,
    categories,
    loading,
    error,
    refetch: fetchItems,
  };
}
