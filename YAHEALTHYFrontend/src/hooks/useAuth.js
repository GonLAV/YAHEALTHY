import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '@/services/api';
const AuthContext = createContext(undefined);
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        // Check if user is already logged in
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const response = await authApi.getCurrentUser();
                    setUser(response.data);
                }
                catch (error) {
                    localStorage.removeItem('token');
                }
            }
            setLoading(false);
        };
        checkAuth();
    }, []);
    const login = async (email, password) => {
        const response = await authApi.login(email, password);
        const token = response.data.access_token || response.data.token || '';
        if (token)
            localStorage.setItem('token', token);
        else
            localStorage.removeItem('token');
        const userResponse = await authApi.getCurrentUser();
        setUser(userResponse.data);
    };
    const signup = async (email, password) => {
        const response = await authApi.signup(email, password);
        const token = response.data.access_token || response.data.token || '';
        if (token)
            localStorage.setItem('token', token);
        else
            localStorage.removeItem('token');
        const userResponse = await authApi.getCurrentUser();
        setUser(userResponse.data);
    };
    const logout = async () => {
        await authApi.logout();
        setUser(null);
    };
    return (_jsx(AuthContext.Provider, { value: {
            user,
            loading,
            isAuthenticated: !!user,
            login,
            signup,
            logout,
        }, children: children }));
};
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
