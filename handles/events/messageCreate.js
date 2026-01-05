const levelSystem = require('../xp/levelSystem');
const rewards = require('../xp/rewards');
const { getPendingInviteXpForUser } = require('../xp/inviteXpUtils');
const {
        MESSAGE_XP,
        SUPPORT_TICKET_URL,
        THANKS_XP,
        THANKS_GIVER_XP,
        GUILD_INVITE_XP,
        GUILD_LINK,
        GUILD_LINK_XP,
        PRIMARY_GUILD_ID
} = require('../xp/xpConfig');
const badWords = require('bad-words');
let phraseFilter = new badWords({list: [
  'crud',
  'ick',
  'FREE NITRO'
]});
phraseFilter.removeWords("hell","damn")
// I am sorry for this messy code - Noname 2026 for my 2024 actions
const AntiSpam = require("discord-anti-spam");
const antiSpam = new AntiSpam({
    warnThreshold: 3, // Amount of messages sent in a row that will cause a warning.
    muteTreshold: 6, // Amount of messages sent in a row that will cause a mute.
    kickTreshold: 9000000000000000000, // Amount of messages sent in a row that will cause a kick.
    banTreshold: 9000000000000000000, // Amount of messages sent in a row that will cause a ban.
    warnMessage: "Stop spamming!", // Message sent in the channel when a user is warned.
    muteMessage: "You have been muted for spamming!", // Message sent in the channel when a user is muted.
    kickMessage: "You have been kicked for spamming!", // Message sent in the channel when a user is kicked.
    banMessage: "You have been banned for spamming!", // Message sent in the channel when a user is banned.
    unMuteTime: 15, // Time in minutes before the user will be able to send messages again.
    verbose: true, // Whether or not to log every action in the console.
    removeMessages: true, // Whether or not to remove all messages sent by the user.
    ipwarnEnabled: false, //whether to delete ip addresses in channels or not.
    //ignoredPermissions: [PermissionFlagsBits.Administrator], // If the user has the following permissions, ignore him.
    // For more options, see the documentation:
  });
module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, client) {
        try {
            const panelChannelId = String(gconfig?.ticketPanelChannelID || '').trim();
            const botId = client?.user?.id || String(gconfig?.botID || '').trim();
            if (panelChannelId && botId && message?.channelId === panelChannelId) {
                if (message.author?.id !== botId) {
                    try {
                        await message.delete();
                    } catch {}
                    return;
                }
            }
        } catch {}

        if (!message.author?.bot && message.guild) {
            try {
                const { level, leveledUp } = levelSystem.addXP(message.author.id, MESSAGE_XP);
                if (leveledUp) {
                    let rewardMsg = '';
                    const reward = rewards.getRewardForLevel(level);
                    if (reward && SUPPORT_TICKET_URL) {
                        rewardMsg = `\n\n🎁 **Reward:** ${reward.description}\nPlease open a support ticket to claim your reward: ${SUPPORT_TICKET_URL}`;
                    }

                    let pendingMsg = '';
                    try {
                        const pending = getPendingInviteXpForUser(message.author.id);
                        if (pending.length > 0) {
                            pendingMsg = `\n\n⏳ You have ${pending.length * GUILD_INVITE_XP} XP on hold from ${pending.length} invite(s).`;
                            for (const p of pending) {
                                const timeLeft = Math.ceil(p.msLeft / (1000 * 60 * 60 * 24));
                                pendingMsg += `\n• +${GUILD_INVITE_XP} XP in ~${timeLeft} day(s) if invitee stays`;
                            }
                        }
                    } catch {}

                    try {
                        await message.channel.send({
                            content: `🎉 ${message.author}, you reached level ${level}!${rewardMsg}${pendingMsg}`
                        });
                    } catch {}
                }

                try {
                    const fs = require('fs');
                    const path = require('path');
                    const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'presence_rewards.json');
                    const ensureDataFile = () => {
                        if (!fs.existsSync(DATA_FILE)) {
                            fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
                            fs.writeFileSync(DATA_FILE, '{}');
                        }
                    };
                    const hasReceived = (userId, type) => {
                        ensureDataFile();
                        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                        return data[userId] && data[userId][type];
                    };
                    const setReceived = (userId, type) => {
                        ensureDataFile();
                        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                        if (!data[userId]) data[userId] = {};
                        data[userId][type] = true;
                        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
                    };

                    if (GUILD_LINK && !hasReceived(message.author.id, 'link')) {
                        const member = await message.guild.members.fetch(message.author.id);
                        const status = (member.presence?.activities?.map(a => a.state || '').join(' ') || '').toLowerCase();
                        if (status.includes(String(GUILD_LINK).toLowerCase())) {
                            setReceived(message.author.id, 'link');
                            levelSystem.addXP(message.author.id, GUILD_LINK_XP);
                            try {
                                await message.author.send(
                                    `You received ${GUILD_LINK_XP} XP for putting our link in your status!`
                                );
                            } catch {}
                        }
                    }

                    if (PRIMARY_GUILD_ID && !hasReceived(message.author.id, 'primaryGuild')) {
                        try {
                            if (
                                message.author.primaryGuild &&
                                message.author.primaryGuild.identityGuildId === PRIMARY_GUILD_ID
                            ) {
                                setReceived(message.author.id, 'primaryGuild');
                                levelSystem.addXP(message.author.id, 10);
                                try {
                                    await message.author.send(
                                        'You received 10 XP for having our server as your primary guild!'
                                    );
                                } catch {}
                            }
                        } catch {}
                    }
                } catch {}

                if (
                    message.type === 19 &&
                    message.content &&
                    /\b(thank(s| you)?|danke|ty|thx)\b/i.test(message.content)
                ) {
                    const repliedTo = await message.fetchReference().catch(() => null);
                    if (
                        repliedTo &&
                        repliedTo.author &&
                        !repliedTo.author.bot &&
                        repliedTo.author.id !== message.author.id
                    ) {
                        levelSystem.addXP(repliedTo.author.id, THANKS_XP);
                        levelSystem.addXP(message.author.id, THANKS_GIVER_XP);
                        try {
                            message.channel.send({
                                content: `${message.author} thanked ${repliedTo.author}! They received ${THANKS_XP} XP.`
                            });
                        } catch {}
                    }
                }
            } catch {}
        }
        if (message.content.startsWith('p-eval')) {
            if (message.author.id === '674972845671186459' || message.author.id === '674972845671186459') {
                const toeval = message.content.replace('p-eval', '');
                if (toeval === '') return message.reply('You must give me something to evaluate');
                try {
                    let result = eval(toeval);
                    if (typeof result !== 'string') {
                        result = require('util').inspect(result, { depth: 0 });
                    }
                } catch (err) {
                    message.reply(`There was an error\n \`\`\`${err}\`\`\``)
                }
            }
        }
        // 2026 - I was funnier back in the day? - Noname
        if (message.content.match(/later/i)) {
            if (message.author.id === '674972845671186459') {
                    message.reply(`*You mean never?*`)
            }
        }
        if (message.content.match(/lazy/i)) {
            if (message.author.id === '674972845671186459') {
                    message.reply(`*You are to lazy..*`)
            }
        }
        flaggedMessage = false
        if (!!phraseFilter.isProfane(message)) {
            flaggedMessage = true
            flagReason = 'Banned Word detected';
        }
        if (!!message.content.match(/http(s)?\:\/\/discord\.gg/g)) {
            flaggedMessage = true
            flagReason = 'Invite Link detected';
        }
        if (flaggedMessage == true) {
            await message.delete();
            message.channel.send(`<@${message.author.id}> im sorry! Dont ruin friendly atmosphere!\nFlag reason: ${flagReason}\nFlagged by: Auto Mod`).then(repliedMessage => {
                setTimeout(() => repliedMessage.delete(), 5000);
            });
        }
        antiSpam.message(message)
    },
};
