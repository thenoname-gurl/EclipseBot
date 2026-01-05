const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getUserLevel } = require('../handles/xp/levelSystem');
const { getAllRewards } = require('../handles/xp/rewards');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('eligible')
		.setDescription('Check all your level rewards eligibility'),
	async execute(interaction) {
		const user = interaction.user;
		const CLAIMS_FILE = path.join(__dirname, '..', 'data', 'rewards_claims.json');
		let claims = {};
		if (fs.existsSync(CLAIMS_FILE)) {
			try {
				claims = JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'))[user.id] || {};
			} catch {
				claims = {};
			}
		}
		const userLevel = getUserLevel(user.id).level;
		const rewards = getAllRewards();
		let msg = `Your eligibility (level ${userLevel}):`;
		for (const r of rewards) {
			const claimed = claims[String(r.level)]?.claimed;
			const eligible = userLevel >= r.level;
			msg += `\n• Level ${r.level}: ${r.description} - ${eligible ? (claimed ? '✅ Claimed' : '🟢 Eligible') : '🔴 Not eligible'}`;
		}
		await interaction.reply({ content: msg });
	}
};
