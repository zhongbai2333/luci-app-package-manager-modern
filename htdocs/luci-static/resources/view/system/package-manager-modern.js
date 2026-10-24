'use strict';
'require view';
'require ui';
'require dom';
'require package-manager-modern.model as model';
'require package-manager-modern.backend as backend';

const actionText = { install: _('Install package'), upgrade: _('Upgrade package'), remove: _('Uninstall package') };
const modeText = { all: _('All packages'), installed: _('Installed'), available: _('Installable packages'), updates: _('Updates') };
const pageSize = 50;
function text(tag, value, attrs) { return E(tag, attrs || {}, [String(value)]); }
function button(label, fn, disabled, kind) {
	return E('button', { type: 'button', 'class': 'btn cbi-button ' + (kind || 'cbi-button-neutral'), click: fn, disabled: disabled || null }, [label]);
}
function bytes(value) { return value == null ? _('Unknown') : value < 1024 ? value + ' B' : value < 1048576 ? (value / 1024).toFixed(1) + ' KiB' : (value / 1048576).toFixed(2) + ' MiB'; }

return view.extend({
	load: function() {
		if (!L.hasSystemFeature('apk')) return { error: _('This application requires APK on OpenWrt 25.12.') };
		return backend.load().catch(err => ({ error: String(err) }));
	},
	render: function(data) {
		this.data = data;
		this.queue = new Map();
		this.selected = new Set();
		this.mode = 'all'; this.query = ''; this.category = 'all'; this.sort = 'relevance'; this.page = 0;
		this.busy = false; this.stale = !!data.error; this.log = '';
		this.root = E('div', { 'class': 'pm-modern' });
		this.draw();
		return this.root;
	},
	canWrite: function() { return L.hasViewPermission() && !this.busy && !this.stale; },
	showError: function(err) { ui.addNotification(null, text('p', String(err)), 'error'); },
	reload: async function() {
		try {
			const data = await backend.load();
			this.data = data; this.stale = false;
			for (const name of this.selected) if (!data.packages.has(name)) this.selected.delete(name);
		}
		catch (err) { this.stale = true; throw err; }
	},
	readAgain: async function() {
		if (this.busy) return;
		this.busy = true; this.draw();
		try { await this.reload(); }
		catch (err) { this.stale = true; this.showError(err); }
		finally { this.busy = false; this.draw(); }
	},
	add: function(name, action, deferDraw) {
		if (!this.canWrite()) return;
		const p = this.data.packages.get(name);
		if (!this.queue.has(name) && this.queue.size >= 100) { this.showError(_('The queue is limited to 100 packages.')); return; }
		this.queue.set(name, action || (!p.installed ? 'install' : this.mode === 'installed' ? 'remove' : p.update ? 'upgrade' : 'remove'));
		if (!deferDraw) { this.drawQueue(); this.drawList(); }
	},
	draw: function() {
		const link = E('link', { rel: 'stylesheet', href: L.resource('package-manager-modern/style.css') + '?v=0.2.0-3-' + encodeURIComponent(L.env.resource_version || '') });
		const header = E('div', { 'class': 'pm-heading' }, [
			E('div', {}, [text('h2', _('Modern Package Manager')), text('p', _('Manage system APK packages using your existing LuCI session.'), { 'class': 'cbi-map-descr' })]),
			E('div', { 'class': 'pm-buttons' }, [button(_('Reload package data'), () => this.readAgain(), this.busy), button(_('Refresh repositories…'), () => this.reviewRefresh(), !this.canWrite(), 'cbi-button-action')])
		]);
		if (this.data.error) {
			dom.content(this.root, [link, header, text('p', _('Unable to load package information.'), { role: 'alert' }), text('pre', this.data.error), text('p', _('Check the plugin installation, APK and LuCI read permissions, then reload.'))]); return;
		}
		const all = this.data.packages;
		const counts = { all: all.size, installed: 0, available: 0, updates: 0 };
		for (const p of all.values()) { if (p.installed) counts.installed++; else if (p.available) counts.available++; if (p.update) counts.updates++; }
		const tabs = E('div', { 'class': 'pm-tabs', role: 'group', 'aria-label': _('Package status') }, Object.keys(modeText).map(mode => {
			const tab = button(modeText[mode] + ' (' + counts[mode] + ')', () => { this.mode = mode; this.page = 0; this.draw(); }, this.busy, this.mode === mode ? 'cbi-button-action' : 'cbi-button-neutral');
			tab.setAttribute('aria-pressed', this.mode === mode ? 'true' : 'false');
			return tab;
		}));
		const search = E('input', { type: 'search', value: this.query, placeholder: _('Search package names and descriptions…'), 'aria-label': _('Search packages'), input: ev => {
			this.query = ev.target.value; this.page = 0; window.clearTimeout(this.searchTimer); this.searchTimer = window.setTimeout(() => this.drawList(), 120);
		} });
		const category = E('select', { 'aria-label': _('Package category'), change: ev => { this.category = ev.target.value; this.page = 0; this.drawList(); } },
			[['all', _('All categories')], ['luci', 'LuCI'], ['kernel', _('Kernel modules')], ['other', _('Other packages')]].map(([value, label]) => E('option', { value: value, selected: this.category === value || null }, [label])));
		const sort = E('select', { 'aria-label': _('Sort packages'), change: ev => { this.sort = ev.target.value; this.page = 0; this.drawList(); } },
			[['relevance', _('Search relevance')], ['name', _('Name A–Z')], ['size', _('Package size')]].map(([value, label]) => E('option', { value: value, selected: this.sort === value || null }, [label])));
		this.listNode = E('div'); this.queueNode = E('section', { 'class': 'cbi-section pm-queue', 'aria-label': _('Operation queue') });
		this.queueJump = button(_('Operation queue'), () => this.queueNode.scrollIntoView({ behavior: 'smooth', block: 'start' }), false, 'cbi-button-action pm-queue-jump');
		const mount = (this.data.mounts.data || []).find(m => m.mount === '/overlay') || (this.data.mounts.data || []).find(m => m.mount === '/');
		const disk = text('p', mount ? _('Free space') + ': ' + bytes(mount.free) + ' / ' + bytes(mount.size) : _('Storage information unavailable.'), { 'class': 'pm-muted' });
		const source = E('section', { 'class': 'cbi-section pm-sources' }, [text('h3', _('Repositories')),
			text('p', this.lastRefresh || _('Cached index information; connectivity has not been checked.')),
			text('pre', this.data.sources.error || this.data.sources.text || _('No cached repository information.'), { 'class': 'pm-log' })]);
		dom.content(this.root, [link, header,
			!L.hasViewPermission() ? text('p', _('Read-only session: package operations are disabled.'), { 'class': 'alert-message notice' }) : '',
			this.stale ? text('p', _('Package data may be stale. Reload successfully before making changes.'), { 'class': 'alert-message warning', role: 'alert' }) : '',
			disk, tabs, E('div', { 'class': 'pm-layout' }, [E('section', { 'class': 'cbi-section pm-catalog' }, [E('div', { 'class': 'pm-filters' }, [search, category, sort]), this.listNode]), E('div', {}, [this.queueNode, source])]),
			this.log ? button(_('View last operation log'), () => this.showLog(), false) : '', this.queueJump
		]);
		this.drawList(); this.drawQueue();
	},
	drawList: function() {
		if (!this.listNode) return;
		const list = model.filter(this.data.packages, this.mode, this.query, this.category, this.sort);
		this.page = Math.min(this.page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
		const current = list.slice(this.page * pageSize, (this.page + 1) * pageSize);
		const selectAll = E('input', { type: 'checkbox', checked: current.length > 0 && current.every(p => this.selected.has(p.name)) || null,
			disabled: !this.canWrite() || null, change: ev => { current.forEach(p => ev.target.checked ? this.selected.add(p.name) : this.selected.delete(p.name)); this.drawList(); } });
		selectAll.indeterminate = current.some(p => this.selected.has(p.name)) && !current.every(p => this.selected.has(p.name));
		const selected = E('div', { 'class': 'pm-selection' }, [E('label', {}, [selectAll, ' ', _('Select this page')]),
			text('span', _('Selected') + ': ' + this.selected.size),
			button(_('Add selected to queue'), () => {
				let overflow = false;
				for (const name of this.selected) {
					if (this.queue.has(name) || this.queue.size < 100) this.add(name, null, true); else overflow = true;
				}
				this.selected.clear(); this.drawList(); this.drawQueue();
				if (overflow) this.showError(_('The queue is limited to 100 packages.'));
			}, !this.canWrite() || !this.selected.size),
			button(_('Clear selection'), () => { this.selected.clear(); this.drawList(); }, !this.selected.size || this.busy)
		]);
		const rows = current.map(p => {
			const check = E('input', { type: 'checkbox', 'aria-label': _('Select') + ' ' + p.name, checked: this.selected.has(p.name) || null, disabled: !this.canWrite() || null,
				change: ev => { ev.target.checked ? this.selected.add(p.name) : this.selected.delete(p.name); this.drawList(); } });
			const act = !p.installed ? 'install' : this.mode === 'installed' ? 'remove' : p.update ? 'upgrade' : 'remove';
			return E('article', { 'class': 'pm-package' }, [E('label', { 'class': 'pm-check' }, [check]),
				E('div', { 'class': 'pm-package-info' }, [button(p.name, () => this.details(p.name), false, 'pm-package-name'),
					text('p', p.info.description || _('No description available.')),
					E('div', { 'class': 'pm-meta' }, [text('span', (p.installed || p.info).version + (p.update ? ' → ' + p.update.version : '')),
						text('span', bytes(p.info.size)), text('span', p.update ? _('Update available') : p.installed ? _('Installed') : _('Available'), { 'class': 'label' })])]),
				button(this.queue.has(p.name) ? _('Queued') : actionText[act], () => this.add(p.name, act), !this.canWrite() || this.queue.has(p.name), act === 'remove' ? 'cbi-button-negative' : 'cbi-button-positive')]);
		});
		const pager = E('div', { 'class': 'pm-pager' }, [text('span', list.length ? (this.page * pageSize + 1) + '–' + Math.min((this.page + 1) * pageSize, list.length) + ' / ' + list.length : _('No matching packages.')),
			button(_('Previous page'), () => { this.page--; this.drawList(); }, this.page === 0),
			button(_('Next page'), () => { this.page++; this.drawList(); }, (this.page + 1) * pageSize >= list.length)]);
		dom.content(this.listNode, [selected, E('div', {}, rows.length ? rows : [text('p', _('No matching packages.'), { 'class': 'pm-empty' })]), pager]);
	},
	drawQueue: function() {
		if (!this.queueNode) return;
		this.queueJump.textContent = _('Operation queue') + ' (' + this.queue.size + ')';
		const entries = Array.from(this.queue);
		let total = 0, unknown = false;
		for (const [name, action] of entries) {
			const p = this.data.packages.get(name);
			if (action !== 'remove') { if (p && p.info.size != null) total += p.info.size; else unknown = true; }
		}
		dom.content(this.queueNode, [text('h3', _('Operation queue') + ' (' + this.queue.size + '/100)'),
			text('p', _('Select packages first, then review all operations.')),
			E('div', {}, entries.length ? entries.map(([name, action]) => E('div', { 'class': 'pm-queue-item' }, [E('div', {}, [text('strong', name), text('small', actionText[action])]),
				button(_('Remove from queue'), () => { this.queue.delete(name); this.drawQueue(); this.drawList(); }, this.busy)])) : [text('p', _('The queue is empty.'), { 'class': 'pm-empty' })]),
			entries.length ? text('p', _('Selected package files') + ': ' + bytes(total) + (unknown ? ' + ' + _('Unknown') : '') + '. ' + _('Dependencies and disk changes are not included.')) : '',
			button(_('Review operations…'), () => this.review(), !this.canWrite() || !entries.length, 'cbi-button-action'),
			button(_('Clear queue'), () => { this.queue.clear(); this.drawQueue(); this.drawList(); }, this.busy || !entries.length)
		]);
	},
	modal: function(title, children) {
		ui.showModal(title, [E('div', { 'class': 'pm-modern-dialog' }, children)]);
	},
	details: function(name) {
		const p = this.data.packages.get(name), info = p.info;
		const reverse = model.reverseDependencies(name, this.data.packages);
		const fields = [[_('Installed version'), p.installed ? p.installed.version : '—'], [_('Repository version'), p.available ? p.available.version : '—'],
			[_('Package file size'), bytes(info.size)], [_('Installed size'), bytes((p.installed || info).installedSize)], [_('Architecture'), info.arch || '—'], [_('License'), info.license || '—']];
		this.modal(name, [text('p', info.description), E('dl', { 'class': 'pm-details' }, fields.flatMap(([key, value]) => [text('dt', key), text('dd', value)])),
			text('h4', _('Direct dependencies')), text('pre', info.depends.join('\n') || _('None'), { 'class': 'pm-log' }),
			text('h4', _('Installed direct reverse dependencies')), text('pre', reverse.join('\n') || _('None'), { 'class': 'pm-log' }),
			text('p', _('Dependency information is descriptive. APK resolves version constraints, virtual providers and automatic removals when executing.')),
			E('div', { 'class': 'pm-buttons' }, [button(_('Close'), ui.hideModal, false),
				!p.installed ? button(_('Queue installation'), () => { this.add(name, 'install'); ui.hideModal(); }, !this.canWrite(), 'cbi-button-positive') : '',
				p.update ? button(_('Queue upgrade'), () => { this.add(name, 'upgrade'); ui.hideModal(); }, !this.canWrite(), 'cbi-button-positive') : '',
				p.installed ? button(_('Queue removal'), () => { this.add(name, 'remove'); ui.hideModal(); }, !this.canWrite(), 'cbi-button-negative') : ''])]);
	},
	review: async function() {
		if (!this.canWrite() || !this.queue.size) return;
		this.busy = true; this.draw();
		this.modal(_('Review operations'), [text('p', _('Reloading package state…'), { 'class': 'spinning' })]);
		try {
			await this.reload(); model.validate(this.queue, this.data.packages);
			const groups = model.groups(this.queue);
			this.modal(_('Review operations'), [
				text('p', _('Operations run in order: install, upgrade, remove. This is not a transaction. A failure stops later groups and does not roll back earlier changes.')),
				...groups.map(group => E('div', {}, [text('h4', actionText[group.action]), E('ul', {}, group.names.map(name => {
					const p = this.data.packages.get(name);
					return text('li', name + (group.action === 'upgrade' ? ' (' + p.installed.version + ' → ' + p.update.version + ')' : '') +
						(group.action === 'remove' && model.reverseDependencies(name, this.data.packages).length ? ' · ' + _('Has installed reverse dependencies') : ''));
				}))])),
				text('p', _('APK may install or remove additional dependencies. No force flags are used. Package changes can interrupt services; review core and kernel packages carefully.')),
				E('div', { 'class': 'pm-buttons' }, [button(_('Cancel'), ui.hideModal, false), button(_('Execute selected operations'), () => this.execute(groups), !L.hasViewPermission(), 'cbi-button-action')])]);
		}
		catch (err) { this.showError(err); ui.hideModal(); }
		finally { this.busy = false; this.draw(); }
	},
	reviewRefresh: function() {
		if (!this.canWrite()) return;
		this.modal(_('Refresh repositories'), [text('p', _('Download the configured APK indexes. This does not upgrade installed packages.')),
			E('div', { 'class': 'pm-buttons' }, [button(_('Cancel'), ui.hideModal, false), button(_('Refresh repositories'), () => this.execute([{ action: 'update', names: [] }]), false, 'cbi-button-action')])]);
	},
	execute: async function(groups) {
		if (!this.canWrite()) return;
		this.busy = true; this.log = ''; this.draw();
		const status = text('p', _('Waiting for APK to finish…'), { 'class': 'spinning', role: 'status' });
		const output = text('pre', '', { 'class': 'pm-log', role: 'log', 'aria-live': 'polite' });
		const end = E('div', { 'class': 'pm-buttons' });
		this.modal(_('Package manager operation'), [status, text('p', _('The system returns final output only. No live percentage is available.')), output, end]);
		const leaving = ev => { ev.preventDefault(); ev.returnValue = ''; };
		window.addEventListener('beforeunload', leaving);
		let failed = false;
		try {
			// Refresh data immediately before mutation; a second view may have changed it.
			if (groups[0].action !== 'update') { await this.reload(); model.validate(this.queue, this.data.packages); }
			for (const group of groups) {
				this.log += '\n> ' + group.action + ' ' + group.names.join(' ') + '\n'; output.textContent = this.log;
				const result = await backend.mutate(group.action, group.names);
				this.log += (result.stdout || '') + '\n' + (result.stderr || '') + '\n' + _('Exit code') + ': ' + result.code + '\n'; output.textContent = this.log;
				if (result.code !== 0) { failed = true; if (group.action === 'update') this.lastRefresh = _('Last refresh failed; inspect the log.'); break; }
				group.names.forEach(name => { this.queue.delete(name); this.selected.delete(name); });
				if (group.action === 'update') this.lastRefresh = _('Last refresh completed successfully') + ' · ' + new Date().toLocaleString();
			}
		}
		catch (err) { failed = true; if (groups[0].action === 'update') this.lastRefresh = _('Refresh result unknown; inspect the log.'); this.log += '\n' + String(err) + '\n' + _('The result may be incomplete. Inspect refreshed package state before retrying.'); }
		finally {
			this.stale = true;
			try { await this.reload(); }
			catch (err) { this.log += '\n' + _('Unable to reload package state') + ': ' + String(err); }
			this.busy = false; window.removeEventListener('beforeunload', leaving);
			status.classList.remove('spinning'); status.textContent = failed ? _('Stopped. Review the log and remaining queue.') : _('Operations completed.');
			output.textContent = this.log;
			dom.content(end, [button(_('Close'), () => { ui.hideModal(); this.draw(); }, false)]);
			if (ui.menu && ui.menu.flushCache) ui.menu.flushCache();
			this.draw();
		}
	},
	showLog: function() { this.modal(_('Last operation log'), [text('pre', this.log, { 'class': 'pm-log' }), button(_('Close'), ui.hideModal, false)]); },
	handleSave: null, handleSaveApply: null, handleReset: null
});
