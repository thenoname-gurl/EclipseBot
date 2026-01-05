const fs = require('fs');
const path = require('path');
const levelSystem = require('./levelSystem');
const { GUILD_INVITE_XP } = require('./xpConfig');

const pendingFile = path.join(__dirname, '..', '..', 'data', 'invite_pending.json');

async function grantPendingInviteXp(client) {
	if (!fs.existsSync(pendingFile)) return;
	let pending;
	try {
		pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
	} catch {
		return;
	}

	let changed = false;
	const now = Date.now();

	for (const entry of Object.values(pending)) {
		if (!entry || entry.left || entry.granted || !entry.grantAt || !entry.inviter) continue;
		if (now < entry.grantAt) continue;

		levelSystem.addXP(entry.inviter, GUILD_INVITE_XP);
		entry.granted = true;
		changed = true;

		try {
			const user = await client.users.fetch(entry.inviter);
			await user.send(
				`You received ${GUILD_INVITE_XP} XP for your invite (held 7 days for anti-abuse).`
			);
		} catch {}
	}

	if (changed) {
		fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
	}
}

module.exports = grantPendingInviteXp;
