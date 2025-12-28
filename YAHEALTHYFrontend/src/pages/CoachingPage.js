import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { crmApi } from '@/services/api';
export const CoachingPage = () => {
    const { user } = useAuth();
    const userId = user?.id;
    const [insights, setInsights] = useState([]);
    const [message, setMessage] = useState('');
    const [response, setResponse] = useState('');
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [asking, setAsking] = useState(false);
    const canAsk = useMemo(() => !asking && message.trim().length > 0, [asking, message]);
    const loadInsights = async () => {
        if (!userId)
            return;
        setLoadingInsights(true);
        try {
            const res = await crmApi.getInsights(userId);
            const data = (res.data?.data ?? res.data);
            setInsights(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.error('Failed to load insights:', err);
            setInsights([]);
        }
        finally {
            setLoadingInsights(false);
        }
    };
    useEffect(() => {
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
    const handleAsk = async () => {
        if (!userId || !canAsk)
            return;
        setAsking(true);
        setResponse('');
        try {
            const res = await crmApi.askCoach(userId, message.trim());
            setResponse(res.data?.response || res.data?.message || '');
            setMessage('');
            // Give the backend a moment to write insights (if it does so async)
            setTimeout(loadInsights, 750);
        }
        catch (err) {
            console.error('Failed to ask coach:', err);
            setResponse('Sorry, I encountered an error. Please try again.');
        }
        finally {
            setAsking(false);
        }
    };
    if (!userId) {
        return (_jsx("div", { className: "min-h-screen bg-gray-50 p-8", children: _jsxs("div", { className: "max-w-3xl mx-auto", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900", children: "AI Coaching" }), _jsx("p", { className: "text-gray-600 mt-2", children: "Please sign in to use coaching." })] }) }));
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-50 p-8", children: _jsxs("div", { className: "max-w-3xl mx-auto", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900 mb-8", children: "AI Coaching" }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6 mb-8", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900", children: "Your Insights" }), _jsx("button", { onClick: loadInsights, disabled: loadingInsights, className: "text-indigo-600 hover:text-indigo-700 font-semibold disabled:opacity-50", children: loadingInsights ? 'Refreshing…' : 'Refresh' })] }), loadingInsights ? (_jsx("p", { className: "text-gray-600", children: "Loading insights\u2026" })) : insights.length === 0 ? (_jsx("p", { className: "text-gray-600", children: "No insights yet. Keep logging food!" })) : (_jsx("div", { className: "space-y-4", children: insights.map((insight) => (_jsxs("div", { className: "p-4 bg-indigo-50 rounded-lg border border-indigo-200", children: [_jsx("p", { className: "font-semibold text-indigo-900", children: insight.title || insight.insight_type || 'Insight' }), insight.content && _jsx("p", { className: "text-sm text-gray-700 mt-2", children: insight.content })] }, insight.id))) }))] }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-4", children: "Ask Your Coach" }), _jsxs("div", { className: "flex gap-2 mb-4", children: [_jsx("input", { type: "text", value: message, onChange: (e) => setMessage(e.target.value), placeholder: "Ask me anything about your nutrition\u2026", className: "flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none", onKeyDown: (e) => {
                                        if (e.key === 'Enter')
                                            handleAsk();
                                    } }), _jsx("button", { onClick: handleAsk, disabled: !canAsk, className: "px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700", children: asking ? 'Thinking…' : 'Ask' })] }), response && (_jsx("div", { className: "p-4 bg-green-50 rounded-lg border border-green-200", children: _jsx("p", { className: "text-gray-800", children: response }) }))] })] }) }));
};
