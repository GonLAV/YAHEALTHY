import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import { Button, Field, inputCls } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
export const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/dashboard');
        }
        catch (err) {
            setError(err.response?.data?.error || 'Login failed — please try again');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-b from-teal-50 via-emerald-50/40 to-slate-50 flex flex-col items-center justify-center px-4 py-10", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsxs("div", { className: "flex flex-col items-center mb-8", children: [_jsx("span", { className: "w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/20 mb-4", children: _jsx(Leaf, { className: "w-8 h-8" }) }), _jsxs("h1", { className: "text-3xl font-extrabold tracking-tight text-slate-900", children: ["YA", _jsx("span", { className: "text-teal-600", children: "Healthy" })] }), _jsx("p", { className: "text-slate-500 mt-1.5", children: "Your daily nutrition & health companion" })] }), _jsxs("div", { className: "bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8", children: [_jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsx(Field, { label: "Email", children: _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: inputCls, autoComplete: "email", required: true }) }), _jsx(Field, { label: "Password", children: _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), className: inputCls, autoComplete: "current-password", required: true }) }), error && (_jsx("div", { className: "bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-xl text-sm", role: "alert", children: error })), _jsx(Button, { type: "submit", size: "lg", className: "w-full", loading: loading, children: "Sign in" })] }), _jsxs("p", { className: "text-center text-sm text-slate-500 mt-6", children: ["New here?", ' ', _jsx(Link, { to: "/signup", className: "font-semibold text-teal-600 hover:text-teal-700", children: "Create an account" })] })] })] }) }));
};
