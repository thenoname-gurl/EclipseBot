const fs = require('fs');
const { ActivityType } = require('discord.js')
const {ThreadManager} = require('discord-tickets');
const grantPendingInviteXp = require('../xp/inviteXpGrantJob');

async function ensureTicketPanel(client) {
    const channelId = String(gconfig.ticketPanelChannelID || '').trim();
    if (!channelId) return;

    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch {
        return;
    }
    if (!channel || !channel.isTextBased?.()) return;

    try {
        let lastId;
        for (let i = 0; i < 20; i++) {
            const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
            if (!fetched.size) break;
            for (const msg of fetched.values()) {
                try {
                    await msg.delete();
                } catch {}
            }
            lastId = fetched.last()?.id;
        }
    } catch {}

    try {
        const content = String(gconfig.ticketPanelMessage || 'React with 🎟️ to create a ticket.');
        const panelMessage = await channel.send({ content });
        client.ticketPanelMessageId = panelMessage.id;
        try {
            await panelMessage.react('🎟️');
        } catch {}
    } catch {}
}

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        let sCount = client.guilds.cache.size
        ascii = `   ____        _                        _       \n  | __ )  ___ | |_   _ __ ___  __ _  __| |_   _ \n  |  _ \\ / _ \\| __| | '__/ _ \\/ _' |/ _' | | | |\n  | |_) | (_) | |_  | | |  __/ (_| | (_| | |_| |\n  |____/ \\___/ \\__| |_|  \\___|\\__,_|\\__,_|\\__, |\n                                          |___/ `
        console.log(`Logged in as ${client.user.tag}\nThis bot is in ${sCount} servers\n${ascii}\n\n`)
        client.user.setActivity(gconfig.status, { type: ActivityType.Watching })
        client.ticketManager = new ThreadManager(client, {
            enabled: true,
            channelId: gconfig.ticketID,
            staffRole: gconfig.supportStaffRoleID || gconfig.staffAccessRoleID || gconfig.customersStaffRoleID,
            storage: `../../../tickets.json`,
            ticketCache: true
        });

        await ensureTicketPanel(client);

        if (client.test) {
            process.exit(0)
        }

        client.inviteCache = new Map();
        async function cacheGuildInvites(guild) {
            try {
                const invites = await guild.invites.fetch();
                client.inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
            } catch {}
        }
        for (const guild of client.guilds.cache.values()) {
            await cacheGuildInvites(guild);
        }

        setInterval(() => grantPendingInviteXp(client), 60 * 1000);

        setInterval(function () {
            fs.writeFileSync('./times.json', '{}', 'utf-8')
        }, 86400000)
    },
};
