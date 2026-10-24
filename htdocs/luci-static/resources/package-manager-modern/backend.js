'use strict';
'require baseclass';
'require fs';
'require rpc';
'require package-manager-modern.model as model';

const helper = '/usr/libexec/package-manager-modern';
const mounts = rpc.declare({ object: 'luci', method: 'getMountPoints', expect: { result: [] } });

return baseclass.extend({
	load: function() {
		return Promise.all([
			fs.exec_direct(helper, ['list-available']),
			fs.exec_direct(helper, ['list-installed']),
			// An unavailable upgrade query must not silently mean zero updates.
			fs.exec_direct(helper, ['list-updates']),
			fs.exec_direct(helper, ['source-status']).then(text => ({ text: text }), err => ({ error: String(err) })),
			mounts().then(data => ({ data: data }), err => ({ error: String(err) }))
		]).then(data => ({
			packages: model.merge(model.parse(data[0]), model.parse(data[1]), model.parse(data[2])),
			sources: data[3], mounts: data[4]
		}));
	},
	mutate: function(action, names) {
		if (action !== 'update' && (!['install', 'upgrade', 'remove'].includes(action) || !names.length || names.length > 100 || names.some(n => !/^[a-zA-Z0-9][a-zA-Z0-9+_.-]{0,127}$/.test(n))))
			return Promise.reject(new Error('Invalid package operation'));
		if (action === 'update' && names.length) return Promise.reject(new Error('Unexpected arguments'));
		return fs.exec_direct(helper, [action].concat(names), 'json').then(result => {
			if (!result || !Number.isInteger(result.code)) throw new Error('Invalid package manager result; inspect device state before retrying');
			return result;
		});
	}
});
