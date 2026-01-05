const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

const THREAD_TICKETS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'thread_tickets.json');

function ensureJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '{}');
    }
}

function loadThreadTickets() {
    ensureJsonFile(THREAD_TICKETS_FILE);
    try {
        return JSON.parse(fs.readFileSync(THREAD_TICKETS_FILE, 'utf8')) || {};
    } catch {
        return {};
    }
}

function saveThreadTickets(data) {
    ensureJsonFile(THREAD_TICKETS_FILE);
    fs.writeFileSync(THREAD_TICKETS_FILE, JSON.stringify(data, null, 2));
}

function sanitizeForThreadName(value) {
    const base = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 18);
    return base || 'user';
}

// 2026 - This was hell to fix and rework.. sorry for the mess

module.exports = {
    name: 'messageReactionAdd',
    once: false,
    async execute(reaction, user)  {
        try {
            if (user?.bot) return;

            const debug = String(gconfig?.debug || '0') === '1';

            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch {
                    if (debug) console.log('[tickets] reaction.fetch failed');
                    return;
                }
            }
            const message = !reaction.message.partial ? reaction.message : await reaction.message.fetch();

            const panelChannelId = String(gconfig.ticketPanelChannelID || '').trim();
            if (panelChannelId && message.channelId !== panelChannelId) {
                if (debug) console.log('[tickets] wrong channel', message.channelId);
                return;
            }

            const botId = gclient?.user?.id || String(gconfig.botID || '').trim();
            if (!botId || message.author.id !== botId) {
                if (debug) console.log('[tickets] not bot panel message', message.author?.id);
                return;
            }


            if (gclient.ticketPanelMessageId && message.id !== gclient.ticketPanelMessageId) {
                if (debug) console.log('[tickets] panel message id mismatch (allowed)', message.id);
            }

            if (reaction.emoji?.name !== '🎟️') {
                if (debug) console.log('[tickets] wrong emoji', reaction.emoji?.name);
                return;
            }

            if (!message.guild) return;

            const primaryGuildId = String(gconfig?.botServerID || '').trim();
            if (primaryGuildId && message.guild.id !== primaryGuildId) {
                if (debug) console.log('[tickets] ignoring reaction: not primary guild', message.guild.id);
                return;
            }

            const guild = message.guild;
            const member = await guild.members.fetch(user.id);

            const ticketParentChannelId = String(gconfig?.ticketID || '').trim();
            if (!ticketParentChannelId) {
                if (debug) console.log('[tickets] missing gconfig.ticketID');
                return;
            }

            let ticketParentChannel = guild.channels.cache.get(ticketParentChannelId);
            if (!ticketParentChannel) {
                try {
                    ticketParentChannel = await guild.channels.fetch(ticketParentChannelId);
                } catch (err) {
                    console.error('[tickets] failed to fetch ticketID channel (will fall back to panel channel):', ticketParentChannelId, err);
                    ticketParentChannel = message.channel;
                }
            }

            const canCreateThreads = !!ticketParentChannel?.threads?.create;
            if (!canCreateThreads) {
                console.error(
                    '[tickets] ticketID channel does not support threads. ticketID must be a text channel where threads are allowed:',
                    ticketParentChannelId,
                    ticketParentChannel?.type
                );
                return;
            }

            const staffRoleCandidates = [
                String(gconfig?.supportStaffRoleID || '').trim(),
                String(gconfig?.staffAccessRoleID || '').trim(),
                String(gconfig?.customersStaffRoleID || '').trim()
            ].filter(Boolean);
            const staffRoleId = staffRoleCandidates.find(id => guild.roles.cache.has(id));
            if (!staffRoleId) {
                console.error('[tickets] No staff role found in this guild (check supportStaffRoleID/staffAccessRoleID).');
                return;
            }

            const store = loadThreadTickets();
            const key = `${guild.id}:${user.id}`;
            const existingThreadId = store[key];
            if (existingThreadId) {
                try {
                    const existingThread = await guild.channels.fetch(existingThreadId).catch(() => null);
                    if (existingThread) {
                        if (debug) console.log('[tickets] user already has a thread ticket', user.id, existingThreadId);
                        try { await reaction.users.remove(user.id); } catch {}
                        return;
                    }
                } catch {}
                delete store[key];
                saveThreadTickets(store);
            }

            const threadName = `ticket-${sanitizeForThreadName(user.username)}-${String(Date.now()).slice(-4)}`.slice(0, 100);

            if (debug) console.log('[tickets] creating private thread ticket for', user.id, 'under', ticketParentChannel.id);
            let thread;
            try {
                thread = await ticketParentChannel.threads.create({
                    name: threadName,
                    autoArchiveDuration: 10080,
                    type: ChannelType.PrivateThread,
                    invitable: false,
                    reason: `Ticket opened by ${user.tag}`
                });
            } catch (err) {
                console.error('[tickets] failed to create private thread:', err);
                return;
            }

            try { await thread.members.add(member.id); } catch {}
            try { await thread.members.add('@me'); } catch {}
            try {
                const role = guild.roles.cache.get(staffRoleId);
                role?.members?.forEach(m => {
                    thread.members.add(m.id).catch(() => null);
                });
            } catch {}

            store[key] = thread.id;
            saveThreadTickets(store);

            try {
                await thread.send({ content: `${member} <@&${staffRoleId}>\nPlease describe your issue.` });
            } catch {}

            try { await reaction.users.remove(user.id); } catch {}
        } catch (error) {
            console.error('Something went wrong when fetching the message: ', error);
        }
    }
};
