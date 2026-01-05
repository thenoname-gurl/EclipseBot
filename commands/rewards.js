const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllRewards } = require('../handles/xp/rewards');

const notes = [
	'¹ Not valid for contract products, dedicated servers, domains, and licenses',
	'² Only valid for one product',
	'³ Physical rewards may require shipping information',
	'⁴ Boost XP is only granted once per user',
	'',
	'**Other XP Rewards:**',
	'Use `/thanks @User` to thank someone: They get 10 XP, you get 1 XP',
	'Boosting the server: 50 XP (only once per user)',
	'Put "eclipsesystems.top" in your status: 10 XP (only once per user, case-insensitive)',
	'Inviting a user: 25 XP (XP is held for 7 days and only granted if the invited user stays)'
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rewards')
		.setDescription('Show all level rewards and notes'),
	async execute(interaction) {
		const rewards = getAllRewards().sort((a, b) => a.level - b.level);
		let desc = '';
		let lastLevel = null;
		for (const r of rewards) {
			if (r.level !== lastLevel) {
				desc += `\n**Level ${r.level}:**`;
				lastLevel = r.level;
			}
			desc += `\n- ${r.description}`;
		}
		const notesText = notes
			.map(n => (n.trim() === '' || n.trim().startsWith('**') ? n : `• ${n}`))
			.join('\n');
		const embed = new EmbedBuilder()
			.setTitle('Level Rewards')
			.setDescription(desc)
			.setColor(0x00AE86)
			.addFields({ name: 'Notes', value: notesText });
		await interaction.reply({ embeds: [embed] });
	}
};
