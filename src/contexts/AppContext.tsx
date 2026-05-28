import React, { createContext, useContext, useState, useCallback } from 'react';
import { Account } from '@/lib/types';
import { getAccounts, getActiveAccountId, setActiveAccountId, getAccount, getMainAccountId, setMainAccountId } from '@/lib/store';

interface AppContextType {
  accounts: Account[];
  activeAccountId: string | null;
  activeAccount: Account | null;
  mainAccountId: string | null;
  mainAccount: Account | null;
  refresh: () => void;
  switchAccount: (id: string) => void;
  setMainAccount: (id: string) => void;
}

const AppContext = createContext<AppContextType>({
  accounts: [],
  activeAccountId: null,
  activeAccount: null,
  mainAccountId: null,
  mainAccount: null,
  refresh: () => {},
  switchAccount: () => {},
  setMainAccount: () => {},
});

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);

  const accounts = getAccounts();
  const activeAccountId = getActiveAccountId();
  const activeAccount = activeAccountId ? getAccount(activeAccountId) || null : null;
  const mainAccountId = getMainAccountId();
  const mainAccount = mainAccountId ? getAccount(mainAccountId) || null : null;

  const switchAccount = (id: string) => {
    setActiveAccountId(id);
    refresh();
  };

  const setMainAccount = (id: string) => {
    setMainAccountId(id);
    refresh();
  };

  return (
    <AppContext.Provider value={{ accounts, activeAccountId, activeAccount, mainAccountId, mainAccount, refresh, switchAccount, setMainAccount }}>
      {children}
    </AppContext.Provider>
  );
};
