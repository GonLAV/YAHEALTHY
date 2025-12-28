// Minimal browser-only Data SDK used by the static UI.
// Implements an in-memory/localStorage-backed collection so the Sign In UI
// can call `window.dataSdk.init()` and `window.dataSdk.create()`.

(function () {
	const STORAGE_KEY = 'yahealthy_users_v1';

	/** @type {{ onDataChanged?: (data: any[]) => void } | null} */
	let handler = null;

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : [];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function save(users) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
			return true;
		} catch {
			return false;
		}
	}

	function emit(users) {
		try {
			if (handler && typeof handler.onDataChanged === 'function') {
				handler.onDataChanged(users);
			}
		} catch {
			// ignore
		}
	}

	window.dataSdk = {
		async init(newHandler) {
			handler = newHandler || null;
			const users = load();
			emit(users);
			return { isOk: true, value: users };
		},

		async list() {
			const users = load();
			return { isOk: true, value: users };
		},

		async create(user) {
			try {
				const users = load();
				users.push(user);
				const ok = save(users);
				if (!ok) return { isOk: false, error: 'storage_failed' };
				emit(users);
				return { isOk: true, value: user };
			} catch {
				return { isOk: false, error: 'unknown_error' };
			}
		}
	};
})();
