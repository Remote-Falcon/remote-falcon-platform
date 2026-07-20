import { useCallback, useState } from 'react';

// Shared column-sort toggle for tables: clicking a new column sorts it
// ascending, clicking the active column flips direction. One state machine
// for every sortable table (SequencesList, the bulk metadata review table)
// so sort behavior can't drift between them.
const useTableSort = (initialOrderBy = null, initialOrder = 'asc') => {
  const [orderBy, setOrderBy] = useState(initialOrderBy);
  const [order, setOrder] = useState(initialOrder);

  const requestSort = useCallback(
    (column) => {
      if (orderBy === column) {
        setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setOrderBy(column);
        setOrder('asc');
      }
    },
    [orderBy]
  );

  const resetSort = useCallback(() => {
    setOrderBy(initialOrderBy);
    setOrder(initialOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { orderBy, order, requestSort, resetSort };
};

export default useTableSort;
