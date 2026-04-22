import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/axios';

const AlertContext = createContext({ sinRC: 0, refresh: () => {} });

export function AlertProvider({ children }) {
    const [sinRC, setSinRC] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const { data } = await apiClient.get('facturas/raw_all/');
            const arr = Array.isArray(data) ? data : [];
            setSinRC(arr.filter(r => r.folio_oc && !r.folio_rc).length);
        } catch {
            // No bloquear la app si falla
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return (
        <AlertContext.Provider value={{ sinRC, refresh }}>
            {children}
        </AlertContext.Provider>
    );
}

export const useAlertCount = () => useContext(AlertContext);
