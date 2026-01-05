const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const discordTranscripts = require('discord-html-transcripts');

const levelSystem = require('../handles/xp/levelSystem');
const { STAFF_ROLE_ID, BOOST_XP } = require('../handles/xp/xpConfig');
const { getAllRewards } = require('../handles/xp/rewards');
const { updatejson, checkjson, checkrole } = require('../jsonupdate.js');

const BOOST_DATA_FILE = path.join(__dirname, '..', 'data', 'boosted.json');
const COUPONS_FILE = path.join(__dirname, '..', 'data', 'coupons.json');
const PAYMENT_REQUESTS_FILE = path.join(__dirname, '..', 'data', 'payment_requests.json');

function ensureJsonFile(filePath) {
	if (!fs.existsSync(filePath)) {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, '{}');
	}
}

function loadJsonObject(filePath) {
	ensureJsonFile(filePath);
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed;
		return {};
	} catch {
		return {};
	}
}

function saveJsonObject(filePath, data) {
	ensureJsonFile(filePath);
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeCouponName(value) {
	return String(value || '').trim().toLowerCase();
}

function priceToCents(value) {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(n * 100);
}

function centsToPriceString(cents) {
	const n = Number(cents);
	if (!Number.isFinite(n)) return '0.00';
	return (n / 100).toFixed(2);
}

function setReceivedBoostXP(userId) {
	ensureJsonFile(BOOST_DATA_FILE);
	const data = JSON.parse(fs.readFileSync(BOOST_DATA_FILE, 'utf8'));
	data[userId] = true;
	fs.writeFileSync(BOOST_DATA_FILE, JSON.stringify(data, null, 2));
}

// touched by AI 100000% sure - Noname 2026
// ALSO very bad / poorly coded..
// Merged old files into one single staff command-

// 1/4/2026 - Noname Sorry for huge af file.. I might sperate it eventually..
module.exports = {
	data: new SlashCommandBuilder()
		.setName('staff')
		.setDescription('Staff commands: moderation, tickets, XP, rewards')
		.addSubcommand(sub =>
			sub
				.setName('price')
				.setDescription('Create a payment prompt for a user')
				.addUserOption(opt => opt.setName('user').setDescription('Customer to charge').setRequired(true))
				.addNumberOption(opt => opt.setName('price').setDescription('Base price (e.g. 9.99)').setRequired(true))
				.addStringOption(opt => opt.setName('service').setDescription('Service description').setRequired(true))
				.addStringOption(opt => opt.setName('coupon').setDescription('Coupon code (optional)').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('coupon-add')
				.setDescription('Add a coupon')
				.addStringOption(opt => opt.setName('name').setDescription('Coupon code/name').setRequired(true))
				.addIntegerOption(opt =>
					opt
						.setName('discount')
						.setDescription('Discount percent (1-100)')
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(100)
				)
				.addIntegerOption(opt =>
					opt
						.setName('maxuses')
						.setDescription('Max uses (0 = unlimited)')
						.setRequired(true)
						.setMinValue(0)
				)
		)
		.addSubcommand(sub =>
			sub
				.setName('coupon-remove')
				.setDescription('Remove a coupon')
				.addStringOption(opt => opt.setName('name').setDescription('Coupon code/name').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('coupon-list')
				.setDescription('List coupons')
		)
		.addSubcommand(sub =>
			sub
				.setName('ticket')
				.setDescription('Create a ticket for a customer (customers server only)')
				.addStringOption(opt =>
					opt
						.setName('type')
						.setDescription('Ticket type')
						.setRequired(true)
						.addChoices(
							{ name: 'support', value: 'support' },
							{ name: 'costumer', value: 'costumer' }
						)
				)
				.addStringOption(opt => opt.setName('name').setDescription('Ticket name').setRequired(true))
				.addStringOption(opt => opt.setName('desc').setDescription('Ticket description').setRequired(true))
				.addUserOption(opt => opt.setName('costumer').setDescription('Primary costumer').setRequired(true))
				.addUserOption(opt => opt.setName('subuser1').setDescription('Additional user (optional)').setRequired(false))
				.addUserOption(opt => opt.setName('subuser2').setDescription('Additional user (optional)').setRequired(false))
				.addUserOption(opt => opt.setName('subuser3').setDescription('Additional user (optional)').setRequired(false))
				.addUserOption(opt => opt.setName('subuser4').setDescription('Additional user (optional)').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('givexp')
				.setDescription('Give XP to a user')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
				.addIntegerOption(opt => opt.setName('amount').setDescription('XP amount').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('removexp')
				.setDescription('Remove XP from a user')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
				.addIntegerOption(opt => opt.setName('amount').setDescription('XP amount').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('givebooster')
				.setDescription('Mark user as booster (for XP)')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('claim')
				.setDescription('Mark a user reward for a specific level as claimed')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
				.addIntegerOption(opt => opt.setName('level').setDescription('Level').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('check')
				.setDescription('Check if a user has claimed a reward for a specific level')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
				.addIntegerOption(opt => opt.setName('level').setDescription('Level').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('eligible')
				.setDescription('List all level rewards and claimed status for a user')
				.addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
		)
		.addSubcommand(sub =>
			sub
				.setName('ban')
				.setDescription('Ban a user by ID')
				.addStringOption(opt => opt.setName('user').setDescription('User ID to ban').setRequired(true))
				.addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('kick')
				.setDescription('Kick a member')
				.addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
				.addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('timeout')
				.setDescription('Timeout a member')
				.addUserOption(opt => opt.setName('user').setDescription('User to timeout').setRequired(true))
				.addIntegerOption(opt => opt.setName('time').setDescription('Time in minutes').setRequired(true))
				.addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('unban')
				.setDescription('Unban a user by ID')
				.addStringOption(opt => opt.setName('userid').setDescription('User ID to unban').setRequired(true))
				.addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('untimeout')
				.setDescription('Remove a member timeout')
				.addUserOption(opt => opt.setName('user').setDescription('User to untimeout').setRequired(true))
				.addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
		)
		.addSubcommand(sub =>
			sub
				.setName('close')
				.setDescription('Close ticket')
		)
		.addSubcommand(sub =>
			sub
				.setName('reopen')
				.setDescription('Reopen ticket')
		)
		.addSubcommand(sub =>
			sub
				.setName('delete')
				.setDescription('Delete ticket')
		)
		.addSubcommand(sub =>
			sub
				.setName('lock')
				.setDescription('Lock this channel: everyone can read, staff can write')
		)
		.addSubcommand(sub =>
			sub
				.setName('limit')
				.setDescription('Check your staff limits')
		),
	async execute(interaction, client) {
			if (!interaction.inGuild?.() || !interaction.guild) {
				return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
			}

			const sub = interaction.options.getSubcommand();

			let member;
			try {
				member =
					interaction.guild.members?.cache?.get?.(interaction.user.id) ||
					(await interaction.guild.members.fetch(interaction.user.id));
			} catch {
				member = null;
			}

				if (sub === 'ticket') {
					const customersGuildId = String(gconfig?.customersServerID || '').trim();
					const customersStaffRoleId = String(gconfig?.customersStaffRoleID || '').trim();
					if (!customersGuildId || !customersStaffRoleId) {
						return interaction.reply({
							content:
								'Customers ticket config is missing. Set gconfig.customersServerID and gconfig.customersStaffRoleID in config.json.',
							ephemeral: true
						});
					}
					if (interaction.guild.id !== customersGuildId) {
						return interaction.reply({ content: 'This command can only be used in the customers server.', ephemeral: true });
					}
					if (!member || !member.roles.cache.has(customersStaffRoleId)) {
						return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
					}

					await interaction.deferReply({ ephemeral: true });
					const type = interaction.options.getString('type', true);
					const ticketName = interaction.options.getString('name', true);
					const desc = interaction.options.getString('desc', true);
					const customerUser = interaction.options.getUser('costumer', true);
					let customerMember;
					try {
						customerMember = await interaction.guild.members.fetch(customerUser.id);
					} catch {
						return interaction.editReply({ content: 'Customer must be a member of this server.' });
					}

					const extraUsers = ['subuser1', 'subuser2', 'subuser3', 'subuser4']
						.map(k => interaction.options.getUser(k, false))
						.filter(Boolean)
						.filter(u => u.id !== customerUser.id);

					const sanitizeForChannelName = (value) => {
						const base = String(value || '')
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, '-')
							.replace(/^-+|-+$/g, '')
							.slice(0, 30);
						return base || 'ticket';
					};
					const channelBaseName = `ticket-${sanitizeForChannelName(type)}-${sanitizeForChannelName(ticketName)}`.slice(0, 90);

					const supportCategoryId = String(gconfig?.ticketSupportCategoryID || '').trim();
					const costumerCategoryId = String(gconfig?.ticketCostumerCategoryID || '').trim();
					const categoryId = type === 'support' ? supportCategoryId : costumerCategoryId;
					if (!categoryId) {
						return interaction.editReply({
							content:
								'Ticket category config is missing. Set gconfig.ticketSupportCategoryID and gconfig.ticketCostumerCategoryID in config.json.'
						});
					}

					const permissionOverwrites = [
						{
							id: interaction.guild.roles.everyone.id,
							deny: [PermissionsBitField.Flags.ViewChannel]
						},
						{
							id: customersStaffRoleId,
							allow: [
								PermissionsBitField.Flags.ViewChannel,
								PermissionsBitField.Flags.SendMessages,
								PermissionsBitField.Flags.ReadMessageHistory
							]
						},
						{
							id: customerMember.id,
							allow: [
								PermissionsBitField.Flags.ViewChannel,
								PermissionsBitField.Flags.SendMessages,
								PermissionsBitField.Flags.ReadMessageHistory
							]
						}
					];

					for (const u of extraUsers) {
						permissionOverwrites.push({
							id: u.id,
							allow: [
								PermissionsBitField.Flags.ViewChannel,
								PermissionsBitField.Flags.SendMessages,
								PermissionsBitField.Flags.ReadMessageHistory
							]
						});
					}

					let ticketChannel;
					try {
						ticketChannel = await interaction.guild.channels.create({
							name: channelBaseName,
							type: ChannelType.GuildText,
							parent: categoryId,
							reason: `Staff ticket created by ${interaction.user.tag} for ${customerUser.tag}`,
							permissionOverwrites
						});
					} catch (err) {
						return interaction.editReply({ content: `Failed to create ticket channel: ${String(err?.message || err)}` });
					}

					const embed = new EmbedBuilder()
						.setTitle('New Staff-Created Ticket')
						.addFields(
							{ name: 'Type', value: type, inline: true },
							{ name: 'Name', value: ticketName.slice(0, 256), inline: true },
							{ name: 'Customer', value: `<@${customerUser.id}>`, inline: false },
							{
								name: 'Subusers',
								value: extraUsers.length ? extraUsers.map(u => `<@${u.id}>`).join(' ') : 'None',
								inline: false
							},
							{ name: 'Created By', value: `<@${interaction.user.id}>`, inline: false },
							{ name: 'Description', value: desc.slice(0, 1024), inline: false }
						)
						.setTimestamp(Date.now());

					try {
						await ticketChannel.send({ content: `<@${customerUser.id}>`, embeds: [embed] });
					} catch {}

					return interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
				}

			const staffRoleIds = [
				String(gconfig?.staffAccessRoleID || '').trim(),
				String(gconfig?.supportStaffRoleID || '').trim(),
				String(gconfig?.customersStaffRoleID || '').trim(),
				String(STAFF_ROLE_ID || '').trim()
			].filter(Boolean);
			const heldStaffRoleId = !!member
				? staffRoleIds.find(roleId => member.roles.cache.has(roleId))
				: null;
			const hasStaffRole = !!heldStaffRoleId;
			const quotaRoleId = heldStaffRoleId || member?.roles?.highest?.id;

			let hasLegacyStaffRole = false;
			try {
				hasLegacyStaffRole = !!quotaRoleId && (await checkrole(quotaRoleId));
			} catch {
				hasLegacyStaffRole = false;
			}
			const staffAllowed = hasStaffRole || hasLegacyStaffRole;

			if (!staffAllowed) {
			return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
		}
		if (sub === 'coupon-add') {
			await interaction.deferReply({ ephemeral: true });
			const nameRaw = interaction.options.getString('name', true);
			const name = normalizeCouponName(nameRaw);
			const discount = interaction.options.getInteger('discount', true);
			const maxUsesRaw = interaction.options.getInteger('maxuses', true);
			if (!name) return interaction.editReply({ content: 'Coupon name cannot be empty.' });

			const coupons = loadJsonObject(COUPONS_FILE);
			coupons[name] = {
				name: nameRaw.trim(),
				discountPercent: discount,
				maxUses: maxUsesRaw === 0 ? null : maxUsesRaw,
				uses: coupons[name]?.uses ? Number(coupons[name].uses) : 0,
				createdBy: interaction.user.id,
				createdAt: Date.now()
			};
			saveJsonObject(COUPONS_FILE, coupons);
			return interaction.editReply({ content: `Coupon saved: ${nameRaw.trim()} (${discount}% off, ${maxUsesRaw === 0 ? 'unlimited' : `${maxUsesRaw} max uses`}).` });
		}

		if (sub === 'coupon-remove') {
			await interaction.deferReply({ ephemeral: true });
			const nameRaw = interaction.options.getString('name', true);
			const key = normalizeCouponName(nameRaw);
			const coupons = loadJsonObject(COUPONS_FILE);
			if (!coupons[key]) return interaction.editReply({ content: 'Coupon not found.' });
			delete coupons[key];
			saveJsonObject(COUPONS_FILE, coupons);
			return interaction.editReply({ content: `Coupon removed: ${nameRaw.trim()}` });
		}

		if (sub === 'coupon-list') {
			await interaction.deferReply({ ephemeral: true });
			const coupons = loadJsonObject(COUPONS_FILE);
			const entries = Object.values(coupons || {}).filter(Boolean);
			if (!entries.length) return interaction.editReply({ content: 'No coupons configured.' });
			entries.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
			let text = '';
			for (const c of entries.slice(0, 40)) {
				const maxUses = c.maxUses === null || typeof c.maxUses === 'undefined' ? null : Number(c.maxUses);
				const uses = Number(c.uses || 0);
				const remaining = maxUses === null ? 'unlimited' : String(Math.max(0, maxUses - uses));
				text += `\n• ${c.name} — ${Number(c.discountPercent || 0)}% off — remaining: ${remaining}`;
			}
			return interaction.editReply({ content: `Coupons:${text}` });
		}

		if (sub === 'price') {
			await interaction.deferReply({ ephemeral: true });
			const targetUser = interaction.options.getUser('user', true);
			const price = interaction.options.getNumber('price', true);
			const service = interaction.options.getString('service', true);
			const couponRaw = interaction.options.getString('coupon', false);

			const baseCents = priceToCents(price);
			if (baseCents === null) return interaction.editReply({ content: 'Invalid price.' });
			if (baseCents === 0) return interaction.editReply({ content: 'Price must be greater than 0.' });

			let coupon = null;
			let couponKey = null;
			let discountPercent = 0;
			if (couponRaw) {
				const coupons = loadJsonObject(COUPONS_FILE);
				const key = normalizeCouponName(couponRaw);
				const c = coupons[key];
				if (!c) return interaction.editReply({ content: 'Coupon not found.' });
				const maxUses = c.maxUses === null || typeof c.maxUses === 'undefined' ? null : Number(c.maxUses);
				const uses = Number(c.uses || 0);
				if (maxUses !== null && uses >= maxUses) {
					return interaction.editReply({ content: 'Coupon has reached max uses.' });
				}
				discountPercent = Math.max(0, Math.min(100, Number(c.discountPercent || 0)));
				coupon = c.name || couponRaw;
				couponKey = key;
			}

			const discountedCents = Math.round((baseCents * discountPercent) / 100);
			const finalCents = Math.max(0, baseCents - discountedCents);

			const embed = new EmbedBuilder()
				.setTitle('Payment Request')
				.setDescription(`**Service:** ${service.slice(0, 1000)}`)
				.addFields(
					{ name: 'Customer', value: `<@${targetUser.id}>`, inline: true },
					{ name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
					{ name: 'Base Price', value: `$${centsToPriceString(baseCents)}`, inline: true },
					{ name: 'Coupon', value: coupon ? `${coupon} (${discountPercent}% off)` : 'None', inline: true },
					{ name: 'Total', value: `$${centsToPriceString(finalCents)}`, inline: true },
					{ name: 'Status', value: 'Awaiting payment method', inline: true }
				)
				.setTimestamp(Date.now());

			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId('payreq:paypal').setLabel('PayPal').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId('payreq:crypto').setLabel('Crypto').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('payreq:coupon').setLabel('Use Coupon').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('payreq:paid').setLabel("I've Paid").setStyle(ButtonStyle.Success)
			);

			let msg;
			try {
				msg = await interaction.channel.send({ content: `<@${targetUser.id}>`, embeds: [embed], components: [row] });
			} catch (err) {
				return interaction.editReply({ content: `Failed to send payment request: ${String(err?.message || err)}` });
			}

			const store = loadJsonObject(PAYMENT_REQUESTS_FILE);
			store[msg.id] = {
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
				messageId: msg.id,
				createdByStaffId: interaction.user.id,
				customerId: targetUser.id,
				service,
				baseCents,
				discountPercent,
				coupon: coupon ? String(coupon) : null,
				couponKey: couponKey ? String(couponKey) : null,
				finalCents,
				status: 'awaiting_method',
				paymentMethod: null,
				email: null,
				note: null,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			saveJsonObject(PAYMENT_REQUESTS_FILE, store);

			return interaction.editReply({ content: `Payment prompt posted: ${msg.url}` });
		}


		const discordClient = client || interaction.client;

		// Old commands files merge starts here (2024 ones) - Noname 2026 
		const cooldownMs = 1 * 1000 * 60;
		if (!discordClient.limits) discordClient.limits = {};

		if (sub === 'ban') {
			await interaction.deferReply();
			const user = interaction.options.getString('user');
			if (interaction.guild.members.cache.some(x => x.id == user)) {
				if (!interaction.guild.members.cache.some(x => x.id == user).bannable) {
					return interaction.editReply({ content: `I cannot ban this user`, ephemeral: true });
				}
			}
			const reason = `${interaction.options.getString('reason') || 'No reason given'} | Banned by ${interaction.user.username}`;
			if (staffAllowed) {
				if (discordClient.limits[`${interaction.user.id}`] < Date.now()) delete discordClient.limits[`${interaction.user.id}`];
				if (Object.keys(discordClient.limits).includes(interaction.user.id)) {
					return interaction.editReply(
						`You have already kicked/banned/timeouted someone recently. You can use this again in <t:${Math.round(discordClient.limits[`${interaction.user.id}`] / 1000)}:R>`
					);
				}
				if (interaction.guild.members.cache.some(x => x.id == user)) {
					if (interaction.member.roles.highest.position <= interaction.guild.members.cache.some(x => x.id == user).roles.highest.position) {
						return interaction.editReply('You do not have permission to ban this person');
					}
				}
				const result = await checkjson(interaction.user.id, 'ban', quotaRoleId);
				if (result == true) return interaction.editReply('You used your "Highest Staff Role" limit for ban usage');
				try {
					await interaction.guild.bans.create(user, { reason });
					await interaction.editReply(`Banned <@${user}>\nReason: ${reason}`);
					await updatejson(interaction.user.id, 'ban', quotaRoleId, discordClient, user, reason);
					discordClient.limits[`${interaction.user.id}`] = Date.now() + cooldownMs;
				} catch (err) {
					return interaction.editReply(`There was an error:n ${err}`);
				}
				return;
			}
			return interaction.editReply('You do not have permission to run this command');
		}

		if (sub === 'kick') {
			await interaction.deferReply();
			const user = interaction.options.getUser('user');
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.kickable) return interaction.editReply({ content: `I cannot kick this user`, ephemeral: true });
			const reason = `${interaction.options.getString('reason') || 'No reason given'} | Kicked by ${interaction.user.username}`;
			if (staffAllowed) {
				if (discordClient.limits[`${interaction.user.id}`] < Date.now()) delete discordClient.limits[`${interaction.user.id}`];
				if (Object.keys(discordClient.limits).includes(interaction.user.id)) {
					return interaction.editReply(
						`You have already kicked/banned/timeouted someone recently. You can use this again in <t:${Math.round(discordClient.limits[`${interaction.user.id}`] / 1000)}:R>`
					);
				}
				if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply('You do not have permission to ban this person');
				const result = await checkjson(interaction.user.id, 'kick', quotaRoleId);
				if (result == true) return interaction.editReply('You used your "Highest Staff Role" limit for kick usage');
				try {
					await updatejson(interaction.user.id, 'kick', quotaRoleId, discordClient, member, reason);
					await member.kick({ reason });
					await interaction.editReply(`Kicked <@${user.id}>\nReason: ${reason}`);
					discordClient.limits[`${interaction.user.id}`] = Date.now() + cooldownMs;
				} catch (err) {
					return interaction.editReply(`There was an error:n ${err}`);
				}
				return;
			}
			return interaction.editReply('You do not have permission to run this command');
		}

		if (sub === 'timeout') {
			await interaction.deferReply();
			const user = interaction.options.getUser('user');
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.manageable) return interaction.editReply({ content: `I cannot timeout this user`, ephemeral: true });
			const reason = `${interaction.options.getString('reason') || 'No reason given'} | Timeouted by ${interaction.user.username}`;
			const timeouttime = interaction.options.getInteger('time');
			if (staffAllowed) {
				if (discordClient.limits[`${interaction.user.id}`] < Date.now()) delete discordClient.limits[`${interaction.user.id}`];
				if (Object.keys(discordClient.limits).includes(interaction.user.id)) {
					return interaction.editReply(
						`You have already kicked/banned/timeouted someone recently. You can use this again in <t:${Math.round(discordClient.limits[`${interaction.user.id}`] / 1000)}:R>`
					);
				}
				if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply('You do not have permission to timeout this person');
				const result = await checkjson(interaction.user.id, 'timeout', quotaRoleId);
				if (result == true) return interaction.editReply('You used your "Highest Staff Role" limit for timeout usage');
				try {
					await member.timeout(timeouttime * 60000, { reason });
					await updatejson(
						interaction.user.id,
						'timeout',
						quotaRoleId,
						discordClient,
						member,
						reason,
						timeouttime * 60000
					);
					await interaction.editReply(`Timeouted <@${user.id}> for ${timeouttime} minutes!\nReason: ${reason}`);
					discordClient.limits[`${interaction.user.id}`] = Date.now() + cooldownMs;
				} catch (err) {
					return interaction.editReply(`There was an error:n ${err}`);
				}
				return;
			}
			return interaction.editReply('You do not have permission to run this command');
		}

		if (sub === 'unban') {
			await interaction.deferReply();
			const user = interaction.options.getString('userid');
			const reason = `${interaction.options.getString('reason') || 'No reason given'} | Unbanned by ${interaction.user.username}`;
			if (staffAllowed) {
				if (discordClient.limits[`${interaction.user.id}`] < Date.now()) delete discordClient.limits[`${interaction.user.id}`];
				if (Object.keys(discordClient.limits).includes(interaction.user.id)) {
					return interaction.editReply(
						`You have already kicked/banned/timeouted someone recently. You can use this again in <t:${Math.round(discordClient.limits[`${interaction.user.id}`] / 1000)}:R>`
					);
				}
				const result = await checkjson(interaction.user.id, 'unban', quotaRoleId);
				if (result == true) return interaction.editReply('You used your "Highest Staff Role" limit for unban usage');
				try {
					await interaction.guild.members.unban(user);
					await updatejson(interaction.user.id, 'unban', quotaRoleId, discordClient, user, reason);
					discordClient.limits[`${interaction.user.id}`] = Date.now() + cooldownMs;
					await interaction.editReply(`Removed ban for <@${user}>\nReason: ${reason}`);
				} catch (err) {
					return interaction.editReply(`There was an error:n ${err}`);
				}
				return;
			}
			return interaction.editReply('You do not have permission to run this command');
		}

		if (sub === 'untimeout') {
			await interaction.deferReply();
			const user = interaction.options.getUser('user');
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.manageable) return interaction.editReply({ content: `I cannot untimeout this user`, ephemeral: true });
			const reason = `${interaction.options.getString('reason') || 'No reason given'} | UnTimedout by ${interaction.user.username}`;
			if (staffAllowed) {
				if (discordClient.limits[`${interaction.user.id}`] < Date.now()) delete discordClient.limits[`${interaction.user.id}`];
				if (Object.keys(discordClient.limits).includes(interaction.user.id)) {
					return interaction.editReply(
						`You have already kicked/banned/timeouted someone recently. You can use this again in <t:${Math.round(discordClient.limits[`${interaction.user.id}`] / 1000)}:R>`
					);
				}
				if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply('You do not have permission to untimeout this person');
				try {
					await member.timeout(10, { reason });
					discordClient.limits[`${interaction.user.id}`] = Date.now() + cooldownMs;
					return interaction.editReply(`Removed timeout for <@${user.id}>\nReason: ${reason}`);
				} catch (err) {
					return interaction.editReply(`There was an error:n ${err}`);
				}
			}
			return interaction.editReply('You do not have permission to run this command');
		}

		if (sub === 'lock') {
			if (!staffAllowed) {
				return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
			}
			if (!interaction.channel || interaction.channel.isThread?.()) {
				return interaction.reply({ content: 'This command can only be used in a normal channel.', ephemeral: true });
			}

			await interaction.deferReply({ ephemeral: true });

			const channel = interaction.channel;
			const staffRoleCandidates = [
				String(gconfig?.supportStaffRoleID || '').trim(),
				String(gconfig?.staffAccessRoleID || '').trim(),
				String(gconfig?.customersStaffRoleID || '').trim(),
				String(STAFF_ROLE_ID || '').trim()
			].filter(Boolean);
			const staffRoleId = staffRoleCandidates.find(id => interaction.guild.roles.cache.has(id));
			if (!staffRoleId) {
				return interaction.editReply({ content: 'No staff role is configured for this server.' });
			}

			try {
				await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
					ViewChannel: true,
					ReadMessageHistory: true,
					SendMessages: false
				});

				await channel.permissionOverwrites.edit(staffRoleId, {
					ViewChannel: true,
					ReadMessageHistory: true,
					SendMessages: true
				});
			} catch (err) {
				return interaction.editReply({ content: `Failed to lock channel: ${String(err?.message || err)}` });
			}

			return interaction.editReply({ content: 'Locked: everyone can read, staff can write.' });
		}

		if (sub === 'close' || sub === 'reopen' || sub === 'delete') {
			if (!staffAllowed) {
				return interaction.reply({
					content: `Please ping any avaliable staff to help you ${sub} ticket!`,
					ephemeral: true
				});
			}

			if (discordClient.ticketManager?.tickets?.get?.(interaction.channel.id)) {
				await interaction.reply({ content: `Processing ticket (${sub})..`, ephemeral: true });
				const channel = interaction.channel;
				try {
					const attachment = await discordTranscripts.createTranscript(channel);
					const channel2 = await discordClient.channels.fetch(gconfig.ticketlogID);
					channel2.send({ files: [attachment] });
				} catch {}
				const ticket = discordClient.ticketManager.tickets.get(interaction.channel.id);
				if (sub === 'close') await discordClient.ticketManager.closeTicket(ticket);
				if (sub === 'reopen') await discordClient.ticketManager.reOpenTicket(ticket);
				if (sub === 'delete') await discordClient.ticketManager.deleteTicket(ticket);
				return;
			}

			if (interaction.channel?.isThread?.() && interaction.channel?.type === ChannelType.PrivateThread) {
				const allowedParents = [
					String(gconfig?.ticketID || '').trim(),
					String(gconfig?.ticketPanelChannelID || '').trim()
				].filter(Boolean);
				if (!allowedParents.includes(interaction.channel.parentId)) {
					return interaction.reply({
						content: `Please ping any avaliable staff to help you ${sub} ticket!`,
						ephemeral: true
					});
				}

				await interaction.reply({ content: `Processing ticket (${sub})..`, ephemeral: true });
				const channel = interaction.channel;

				try {
					const attachment = await discordTranscripts.createTranscript(channel);
					const channel2 = await discordClient.channels.fetch(gconfig.ticketlogID);
					channel2.send({ files: [attachment] });
				} catch {}

				if (sub === 'delete') {
					try {
						await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
					} catch {}
					return;
				}

				if (sub === 'close') {
					try {
						await channel.setLocked(true);
						await channel.setArchived(true);
					} catch {}
					return;
				}

				if (sub === 'reopen') {
					try {
						await channel.setArchived(false);
						await channel.setLocked(false);
					} catch {}
					return;
				}
			}

			const supportCategoryId = String(gconfig?.ticketSupportCategoryID || '').trim();
			const costumerCategoryId = String(gconfig?.ticketCostumerCategoryID || '').trim();
			const isTicketChannel =
				interaction.channel?.type === ChannelType.GuildText &&
				[ supportCategoryId, costumerCategoryId ].filter(Boolean).includes(interaction.channel.parentId);

			if (!isTicketChannel) {
				return interaction.reply({
					content: `Please ping any avaliable staff to help you ${sub} ticket!`,
					ephemeral: true
				});
			}

			await interaction.reply({ content: `Processing ticket (${sub})..`, ephemeral: true });
			const channel = interaction.channel;

			try {
				const attachment = await discordTranscripts.createTranscript(channel);
				const channel2 = await discordClient.channels.fetch(gconfig.ticketlogID);
				channel2.send({ files: [attachment] });
			} catch {}

			if (sub === 'delete') {
				try {
					await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
				} catch {}
				return;
			}

			const staffRoleIdsForTicket = [
				String(gconfig?.staffAccessRoleID || '').trim(),
				String(gconfig?.supportStaffRoleID || '').trim(),
				String(gconfig?.customersStaffRoleID || '').trim(),
				String(STAFF_ROLE_ID || '').trim()
			].filter(Boolean);
			const staffRoleIdForTicket = staffRoleIdsForTicket.find(id => interaction.guild.roles.cache.has(id));

			for (const overwrite of channel.permissionOverwrites.cache.values()) {
				if (overwrite.id === interaction.guild.roles.everyone.id) continue;
				if (staffRoleIdForTicket && overwrite.id === staffRoleIdForTicket) continue;

				try {
					if (sub === 'close') {
						await channel.permissionOverwrites.edit(overwrite.id, {
							SendMessages: false
						});
					} else if (sub === 'reopen') {
						await channel.permissionOverwrites.edit(overwrite.id, {
							SendMessages: true
						});
					}
				} catch {}
			}

			try {
				const currentName = String(channel.name || 'ticket');
				if (sub === 'close' && !currentName.startsWith('closed-')) {
					await channel.setName(`closed-${currentName}`.slice(0, 100));
				}
				if (sub === 'reopen' && currentName.startsWith('closed-')) {
					await channel.setName(currentName.replace(/^closed-/, '').slice(0, 100));
				}
			} catch {}

			return;
		}

		if (sub === 'limit') {
			const object = require('../times.json');
			if (staffAllowed) {
				if (!object[interaction.user.id]) {
					const a = require('../config.json').rolecooldown[quotaRoleId];
					object[interaction.user.id] = {
						bansused: a.bansperday,
						kicksused: a.kicksperday,
						timeoutsused: a.timeoutsperday,
						unbansused: a.unbansperday
					};
				}
				return interaction.reply({
					content: `
						Your limits:
						Ban: ${object[interaction.user.id].bansused} left
						Kick: ${object[interaction.user.id].kicksused} left
						Timeout: ${object[interaction.user.id].timeoutsused} left
						UnBan: ${object[interaction.user.id].unbansused} left
						UnTimeout: Non Limited (for everyone from staff)\nLimit's resetting each 24hours after bot startup
						`
				});
			}
			return interaction.reply({ content: `You dont have any staff role or permission role!` });
		}
        // END MERGE :3
		if (sub === 'givexp') {
			const user = interaction.options.getUser('user');
			const amount = interaction.options.getInteger('amount');
			const { level, xp } = levelSystem.addXP(user.id, amount);
			return interaction.reply({ content: `Added ${amount} XP to ${user}. They now have ${xp} XP (level ${level}).` });
		}

		if (sub === 'removexp') {
			const user = interaction.options.getUser('user');
			const amount = interaction.options.getInteger('amount');
			const { level, xp } = levelSystem.addXP(user.id, -Math.abs(amount));
			return interaction.reply({ content: `Removed ${amount} XP from ${user}. They now have ${xp} XP (level ${level}).` });
		}

		if (sub === 'givebooster') {
			const user = interaction.options.getUser('user');
			setReceivedBoostXP(user.id);
			levelSystem.addXP(user.id, BOOST_XP);
			return interaction.reply({ content: `${user} is now marked as a booster and received ${BOOST_XP} XP.` });
		}

		const CLAIMS_FILE = path.join(__dirname, '..', 'data', 'rewards_claims.json');
		ensureJsonFile(CLAIMS_FILE);

		if (sub === 'claim') {
			const user = interaction.options.getUser('user');
			const level = interaction.options.getInteger('level');
			const data = JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
			if (!data[user.id]) data[user.id] = {};
			data[user.id][String(level)] = { claimed: true, claimedBy: interaction.user.id, claimedAt: Date.now() };
			fs.writeFileSync(CLAIMS_FILE, JSON.stringify(data, null, 2));
			return interaction.reply({ content: `Marked reward for level ${level} as claimed for ${user.tag}.` });
		}

		if (sub === 'check') {
			const user = interaction.options.getUser('user');
			const level = interaction.options.getInteger('level');
			let claimed = false;
			let claimedBy = null;
			let claimedAt = null;
			try {
				const data = JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
				if (data[user.id]?.[String(level)]?.claimed) {
					claimed = true;
					claimedBy = data[user.id][String(level)].claimedBy;
					claimedAt = data[user.id][String(level)].claimedAt;
				}
			} catch {}

			if (claimed) {
				return interaction.reply({
					content: `Reward for level ${level} for ${user.tag} was claimed by <@${claimedBy}> at <t:${Math.floor(claimedAt / 1000)}:f>.`
				});
			}
			return interaction.reply({ content: `Reward for level ${level} for ${user.tag} has not been claimed.` });
		}

		if (sub === 'eligible') {
			const user = interaction.options.getUser('user');
			let claims = {};
			try {
				claims = JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'))[user.id] || {};
			} catch {
				claims = {};
			}
			const userLevel = levelSystem.getUserLevel(user.id).level;
			const rewards = getAllRewards();
			let msg = `Eligibility for ${user.tag} (level ${userLevel}):`;
			for (const r of rewards) {
				const claimed = claims[String(r.level)]?.claimed;
				const eligible = userLevel >= r.level;
				msg += `\n• Level ${r.level}: ${r.description} - ${eligible ? (claimed ? '✅ Claimed' : '🟢 Eligible') : '🔴 Not eligible'}`;
			}
			return interaction.reply({ content: msg });
		}

		return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
	}
};
