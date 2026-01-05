const { SlashCommandBuilder } = require('discord.js');
const levelSystem = require('../handles/xp/levelSystem');
const { getPendingInviteXpForUser } = require('../handles/xp/inviteXpUtils');
const { GUILD_INVITE_XP } = require('../handles/xp/xpConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('level')
		.setDescription("Check your or another user's level")
		.addUserOption(option =>
			option
				.setName('user')
				.setDescription('User to check')
				.setRequired(false)
		),
	async execute(interaction) {
		const user = interaction.options.getUser('user') || interaction.user;
		const { level, xp } = levelSystem.getUserLevel(user.id);

		let pendingMsg = '';
		try {
			const pending = getPendingInviteXpForUser(user.id);
			if (pending.length > 0) {
				pendingMsg = `\n\n⏳ You have ${pending.length * GUILD_INVITE_XP} XP on hold from ${pending.length} invite(s).`;
				for (const p of pending) {
					const timeLeft = Math.ceil(p.msLeft / (1000 * 60 * 60 * 24));
					pendingMsg += `\n• +${GUILD_INVITE_XP} XP in ~${timeLeft} day(s) if invitee stays`;
				}
			}
		} catch {}

		await interaction.reply({ content: `${user} is level ${level} with ${xp} XP.${pendingMsg}` });
	}
};
