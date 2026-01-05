const { SlashCommandBuilder } = require('discord.js');
const levelSystem = require('../handles/xp/levelSystem');
const { THANKS_XP, THANKS_GIVER_XP } = require('../handles/xp/xpConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('thanks')
		.setDescription('Thank a user and give them XP!')
		.addUserOption(option =>
			option
				.setName('user')
				.setDescription('User to thank')
				.setRequired(true)
		),
	async execute(interaction) {
		const user = interaction.options.getUser('user');
		if (user.bot) return interaction.reply({ content: 'You cannot thank bots.', ephemeral: true });
		if (user.id === interaction.user.id) {
			return interaction.reply({ content: 'You cannot thank yourself.', ephemeral: true });
		}
		levelSystem.addXP(user.id, THANKS_XP);
		levelSystem.addXP(interaction.user.id, THANKS_GIVER_XP);
		await interaction.reply({ content: `You thanked ${user}! They received ${THANKS_XP} XP.` });
	}
};
