/**
 * @file src/store/authStore.js
 * @description Store global de autenticacion (Context API + useReducer).
 * Expone: user, role, isAuthenticated, login(), logout()
 *
 * NOTA: Este archivo contiene JSX (AuthProvider retorna JSX).
 * Vite lo procesa correctamente con el plugin @vitejs/plugin-react.
 */
import React, { createContext, useContext, useReducer } from 'react';
import { saveSession, clearSession, getAccessToken } from '../lib/axios';

// Helpers
const decodeJWT = (token) => {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
};

const getUserFromStorage = () => {
    const token = getAccessToken();
    if (!token) return null;
    const payload = decodeJWT(token);
    if (!payload || payload.exp * 1000 < Date.now()) return null;
    return payload;
};

// Reducer
const _initialUser = getUserFromStorage();
const initialState = {
    user: _initialUser,
    isAuthenticated: !!_initialUser,
};

const authReducer = (state, action) => {
    switch (action.type) {
        case 'LOGIN':
            return { user: action.payload, isAuthenticated: true };
        case 'LOGOUT':
            return { user: null, isAuthenticated: false };
        default:
            return state;
    }
};

// Context
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);

    const login = (tokens) => {
        saveSession(tokens);
        const payload = decodeJWT(tokens.access);
        dispatch({ type: 'LOGIN', payload });
    };

    const logout = () => {
        clearSession();
        dispatch({ type: 'LOGOUT' });
    };

    // Rol del usuario (ajustar segun estructura del JWT en DRF)
    const role = state.user?.role || state.user?.groups?.[0] || 'viewer';

    return (
        <AuthContext.Provider value={{ ...state, role, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook
export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
    return ctx;
};
