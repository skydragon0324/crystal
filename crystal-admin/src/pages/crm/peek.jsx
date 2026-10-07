import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { TransactionDrawer } from './Transactions';
import { CaseDetail } from './ServiceCases';
import { InstanceDetail } from './Products';

/**
 * OPENING A RELATED RECORD WITHOUT LEAVING THE CUSTOMER.
 *
 * An order, a service case or a product clicked anywhere on the customer
 * record - a tab, an overview card, the activity timeline - opens over the
 * record instead of on its own screen, so the manager stays with the customer.
 * The record provides `peek(kind, id)`; whatever is shown below reads it with
 * usePeek(). Kinds: TRANSACTION, CASE, PRODUCT (a product instance).
 */
const PeekContext = createContext(null);

export function usePeek() {
  return useContext(PeekContext);
}

/** `onChanged` runs when a case closes, since it can be classified while open. */
export function PeekProvider({ children, onChanged }) {
  const [open, setOpen] = useState(null);
  const peek = useCallback((kind, id) => { if (id) setOpen({ kind: kind, id: id }); }, []);
  const close = useCallback(() => setOpen(null), []);
  const value = useMemo(() => peek, [peek]);
  const idOf = (kind) => (open && open.kind === kind ? open.id : null);
  return (
    <PeekContext.Provider value={value}>
      {children}
      <TransactionDrawer id={idOf('TRANSACTION')} onClose={close} />
      <CaseDetail id={idOf('CASE')} onClose={() => { close(); if (onChanged) onChanged(); }} />
      <InstanceDetail id={idOf('PRODUCT')} onClose={close} />
    </PeekContext.Provider>
  );
}
