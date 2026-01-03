const { SlashCommandBuilder } = require(`discord.js`);
// Code by bob 10000% sure - Noname 2026
module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Ping fr, what more do you want")
        .setDMPermission(true)
    ,
    async execute(interaction, client) {
        interaction.reply({content: `Bonjour\n${client.ws.ping}ms`})
    }
};

