// Minimal Element SDK shim.
// This allows the static UI to call `window.elementSdk.init()` and
// `window.elementSdk.setConfig()` without crashing.

(function () {
	/** @type {any} */
	let state = {};
	/** @type {null | ((cfg: any) => void)} */
	let onConfigChange = null;

	window.elementSdk = {
		init({ defaultConfig, onConfigChange: onChange } = {}) {
			state = { ...(defaultConfig || {}), ...(state || {}) };
			onConfigChange = typeof onChange === 'function' ? onChange : null;
			if (onConfigChange) onConfigChange(state);
		},

		setConfig(partial) {
			state = { ...(state || {}), ...(partial || {}) };
			if (onConfigChange) onConfigChange(state);
		}
	};
})();
