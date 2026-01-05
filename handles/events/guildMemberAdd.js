const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { WELCOME_CHANNEL_ID } = require('../xp/xpConfig');

const HOLD_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
	name: 'guildMemberAdd',
	once: false,
	async execute(member, client) {
		try {
			if (!member?.guild) return;
			if (member.user?.bot) return;

			// 2026 - Discord when you'll do sum about ts?
			let inviter = null;
			let inviterTag = null;
			try {
				const cachedInvites = (client.inviteCache && client.inviteCache.get(member.guild.id)) || new Map();
				let newInvites;
				try {
					newInvites = await member.guild.invites.fetch();
				} catch {
					newInvites = new Map();
				}
				for (const [code, invite] of newInvites) {
					const prevUses = cachedInvites.get(code) || 0;
					if (invite.uses > prevUses && invite.inviter && invite.inviter.id !== member.id) {
						inviter = invite.inviter;
						inviterTag = invite.inviter.tag;
						break;
					}
				}
				if (!client.inviteCache) client.inviteCache = new Map();
				client.inviteCache.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));
			} catch {}

			if (WELCOME_CHANNEL_ID) {
				let welcomeDesc = `Hey ${member}, welcome to the official eclipsesystems.top Discord!`;
				if (inviter && inviterTag) {
					welcomeDesc += `\nInvited by: **${inviterTag}**`;
				}
				const embed = new EmbedBuilder()
					.setTitle('Welcome!')
					.setDescription(welcomeDesc)
					.setColor(0x00AE86)
					.setThumbnail(member.user.displayAvatarURL())
					.setTimestamp();

				const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
				if (channel?.isTextBased?.()) {
					channel.send({ embeds: [embed] }).catch(() => {});
				}
			}

			if (!inviter || inviter.bot || inviter.id === member.id) return;
			const now = Date.now();
			const pendingFile = path.join(__dirname, '..', '..', 'data', 'invite_pending.json');
			let pending = {};
			if (fs.existsSync(pendingFile)) {
				try {
					pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
				} catch {
					pending = {};
				}
			}
			if (!pending[member.id]) {
				fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
				pending[member.id] = {
					inviter: inviter.id,
					grantAt: now + HOLD_PERIOD_MS,
					left: false,
					granted: false
				};
				fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
			}
			try {
				await inviter.send(
					`Invite XP for inviting ${member.user.tag} is on hold for 7 days and will be granted if they stay.`
				);
			} catch {}
		} catch {}
	}
};
