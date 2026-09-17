import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * Minimal data-fetching hook with loading / error / retry semantics.
 * `fn` should be stable (wrap in useCallback at the call site).
 */
export function useAsync(fn, deps = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [nonce, setNonce] = useState(0);
    const fnRef = useRef(fn);
    fnRef.current = fn;
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fnRef
            .current()
            .then((result) => {
            if (!cancelled) {
                setData(result);
                setLoading(false);
            }
        })
            .catch((err) => {
            if (!cancelled) {
                setError(err?.response?.data?.error || err?.message || 'Something went wrong');
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce]);
    const reload = useCallback(() => setNonce((n) => n + 1), []);
    return { data, loading, error, reload, setData };
}
/** Friendly message for any thrown axios/unknown error */
export function errMessage(err) {
    const anyErr = err;
    return (anyErr?.response?.data?.error ||
        (typeof anyErr?.response?.data?.details === 'string' ? anyErr.response.data.details : undefined) ||
        anyErr?.message ||
        'Something went wrong');
}
