const { SlashCommandBuilder } = require('discord.js');
const levelSystem = require('../handles/xp/levelSystem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('Show the top 10 users by XP'),
	async execute(interaction) {
		const top = levelSystem.getLeaderboard(10);
		let desc = '';
		for (let i = 0; i < top.length; i++) {
			const u = top[i];
			let username = u.userId;
			try {
				const userObj = await interaction.client.users.fetch(u.userId);
				username = userObj.username;
			} catch {}
			desc += `#${i + 1} ${username} - Level ${u.level} (${u.xp} XP)\n`;
		}
		if (!desc) desc = 'No data yet.';
		await interaction.reply({
			embeds: [
				{
					title: 'Leaderboard',
					description: desc,
					color: 0x00AE86
				}
			]
		});
	}
};
