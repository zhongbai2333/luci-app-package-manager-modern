'use strict';
'require baseclass';

function parseControl(raw) {
	const records = []; let record = {}, key = null;
	for (const line of (raw + '\n\n').split(/\r?\n/)) {
		if (!line.trim()) {
			if (Object.keys(record).length) records.push(record);
			record = {}; key = null; continue;
		}
		if (/^\s/.test(line) && key) { record[key] += '\n' + line.trim(); continue; }
		const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
		if (!match) throw new Error('Invalid package control data');
		key = match[1].toLowerCase(); record[key] = match[2];
	}
	return records.map(p => Object.assign({}, p, { name: p.package, 'file-size': p.size,
		depends: p.depends ? p.depends.split(/\s*,\s*/) : [], provides: p.provides ? p.provides.split(/\s*,\s*/) : [] }));
}

function parse(raw) {
	// 25.12.0 ships control-style output; newer helpers return APK query JSON.
	const list = typeof raw === 'string' ? (/^[\[{]/.test(raw.trim()) ? JSON.parse(raw) : raw.trim().startsWith('Package:') ? parseControl(raw) : null) : raw;
	if (list && !Array.isArray(list) && typeof list.stderr === 'string') throw new Error(list.stderr);
	if (!Array.isArray(list)) throw new Error('Invalid APK response: expected an array');
	const result = new Map();
	for (const item of list) {
		if (!item || typeof item.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9+_.-]{0,127}$/.test(item.name) || typeof item.version !== 'string')
			throw new Error('Invalid APK package record');
		// APK query chooses the best candidate for each name, not a JS version heuristic.
		result.set(item.name, Object.assign({}, item, {
			size: Number.isFinite(+item['file-size']) && +item['file-size'] >= 0 ? +item['file-size'] : null,
			installedSize: Number.isFinite(+item['installed-size']) && +item['installed-size'] >= 0 ? +item['installed-size'] : null,
			description: typeof item.description === 'string' ? item.description : '',
			depends: Array.isArray(item.depends) ? item.depends.filter(d => typeof d === 'string') : [],
			provides: Array.isArray(item.provides) ? item.provides.filter(d => typeof d === 'string') : []
		}));
	}
	return result;
}

function merge(available, installed, upgrades) {
	const all = new Map();
	for (const [name, p] of available) all.set(name, { name: name, available: p, installed: null });
	for (const [name, p] of installed) {
		if (!all.has(name)) all.set(name, { name: name, available: null, installed: p });
		else all.get(name).installed = p;
	}
	for (const p of all.values()) {
		p.update = p.installed && upgrades.has(p.name) ? upgrades.get(p.name) : null;
		p.info = p.available || p.installed;
		p.search = (p.name + ' ' + p.info.description).toLowerCase();
		p.category = p.name.startsWith('luci-') ? 'luci' : p.name.startsWith('kmod-') ? 'kernel' : 'other';
	}
	return all;
}

function filter(all, mode, query, category, sort) {
	const q = query.trim().toLowerCase();
	const rank = p => !q ? 0 : p.name.toLowerCase() === q ? 0 : p.name.toLowerCase().startsWith(q) ? 1 : p.name.toLowerCase().includes(q) ? 2 : 3;
	return Array.from(all.values()).filter(p =>
		(mode === 'all' || mode === 'installed' && p.installed || mode === 'available' && p.available && !p.installed || mode === 'updates' && p.update) &&
		(category === 'all' || category === p.category) && (!q || p.search.includes(q)))
		.sort((a, b) => (sort === 'size' ? (a.info.size ?? Infinity) - (b.info.size ?? Infinity) : sort === 'relevance' ? rank(a) - rank(b) : 0) || a.name.localeCompare(b.name));
}

function validate(queue, all) {
	if (queue.size === 0 || queue.size > 100) throw new Error('Select between 1 and 100 packages');
	for (const [name, action] of queue) {
		const p = all.get(name);
		if (!p || !['install', 'upgrade', 'remove'].includes(action) ||
			action === 'install' && (!p.available || p.installed) ||
			action === 'upgrade' && !p.update || action === 'remove' && !p.installed)
			throw new Error('Package state changed: ' + name);
	}
}

function groups(queue) {
	// Finish additive operations before removing packages. Each group is independent.
	return ['install', 'upgrade', 'remove'].map(action => ({ action: action,
		names: Array.from(queue).filter(entry => entry[1] === action).map(entry => entry[0]) }))
		.filter(group => group.names.length > 0);
}

function reverseDependencies(name, all) {
	const target = all.get(name);
	const aliases = new Set([name].concat(target && target.installed ? target.installed.provides.map(p => p.split(/[<>=~]/)[0]) : []));
	return Array.from(all.values()).filter(p => p.installed && p.name !== name && p.installed.depends.some(d => !d.startsWith('!') && aliases.has(d.split(/[<>=~]/)[0]))).map(p => p.name);
}

return baseclass.extend({ parse: parse, merge: merge, filter: filter, validate: validate, groups: groups, reverseDependencies: reverseDependencies });
