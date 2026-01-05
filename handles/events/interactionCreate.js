const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const COUPONS_FILE = path.join(__dirname, '..', '..', 'data', 'coupons.json');
const PAYMENT_REQUESTS_FILE = path.join(__dirname, '..', '..', 'data', 'payment_requests.json');

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

function centsToPriceString(cents) {
    const n = Number(cents);
    if (!Number.isFinite(n)) return '0.00';
    return (n / 100).toFixed(2);
}

function getStaffRoleIdForGuild(guild) {
    const candidates = [
        String(gconfig?.supportStaffRoleID || '').trim(),
        String(gconfig?.staffAccessRoleID || '').trim(),
        String(gconfig?.customersStaffRoleID || '').trim(),
        String(gconfig?.xp?.STAFF_ROLE_ID || '').trim()
    ].filter(Boolean);
    return candidates.find(id => guild?.roles?.cache?.has?.(id)) || null;
}

function buildPayRow(state) {
    const paypal = new ButtonBuilder()
        .setCustomId('payreq:paypal')
        .setLabel('PayPal')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!!state?.paypalDisabled);
    const crypto = new ButtonBuilder()
        .setCustomId('payreq:crypto')
        .setLabel('Crypto')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!state?.cryptoDisabled);
    const coupon = new ButtonBuilder()
        .setCustomId('payreq:coupon')
        .setLabel('Use Coupon')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!state?.couponDisabled);
    const paid = new ButtonBuilder()
        .setCustomId('payreq:paid')
        .setLabel("I've Paid")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!!state?.paidDisabled);
    return new ActionRowBuilder().addComponents(paypal, crypto, coupon, paid);
}

function buildVerifyRow(state) {
    const verify = new ButtonBuilder()
        .setCustomId('payreq:verify')
        .setLabel('Verify Paid')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!!state?.verifyDisabled);
    const reject = new ButtonBuilder()
        .setCustomId('payreq:reject')
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!!state?.rejectDisabled);
    return new ActionRowBuilder().addComponents(verify, reject);
}

function updateEmbedForRecord(oldEmbed, record) {
    const embed = oldEmbed ? EmbedBuilder.from(oldEmbed) : new EmbedBuilder().setTitle('Payment Request');

    const statusRaw = String(record.status || 'unknown');
    const statusMap = {
        awaiting_method: 'Awaiting payment method',
        awaiting_payment: 'Awaiting payment',
        paid_marked: 'Paid (awaiting staff verification)',
        verified: 'Verified paid',
        rejected: 'Rejected'
    };
    const prettyFromCode = (value) =>
        String(value || '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    const statusLabel = statusMap[statusRaw] || prettyFromCode(statusRaw) || 'Unknown';

    const keep = [];
    for (const f of embed.data.fields || []) {
        if (!f?.name) continue;
        if (['Base Price', 'Coupon', 'Total', 'Status', 'Payment Method', 'Email'].includes(f.name)) continue;
        keep.push(f);
    }

    const fields = [
        ...keep,
        { name: 'Base Price', value: `$${centsToPriceString(record.baseCents)}`, inline: true },
        {
            name: 'Coupon',
            value: record.coupon ? `${record.coupon} (${Number(record.discountPercent || 0)}% off)` : 'None',
            inline: true
        },
        { name: 'Total', value: `$${centsToPriceString(record.finalCents)}`, inline: true },
        { name: 'Status', value: statusLabel, inline: true }
    ];

    if (record.paymentMethod) fields.push({ name: 'Payment Method', value: String(record.paymentMethod), inline: true });
    if (record.email) fields.push({ name: 'Email', value: String(record.email).slice(0, 1024), inline: false });

    embed.setFields(fields);
    embed.setTimestamp(Date.now());
    return embed;
}

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.log(error);
                try {
                    await interaction.followUp({ content: 'There was an error executing this command.' });
                } catch {}
            }
            return;
        }

        if (interaction.isButton()) {
            const customId = String(interaction.customId || '');
            if (!customId.startsWith('payreq:')) return;

            const store = loadJsonObject(PAYMENT_REQUESTS_FILE);
            const record = store[interaction.message?.id];
            if (!record) {
                return interaction.reply({ content: 'This payment request is no longer tracked.', ephemeral: true });
            }

            const guild = interaction.guild;
            if (!guild) return interaction.reply({ content: 'This can only be used in a server.', ephemeral: true });

            const staffRoleId = getStaffRoleIdForGuild(guild);
            const isStaff = !!staffRoleId && interaction.member?.roles?.cache?.has?.(staffRoleId);
            const isCustomer = String(interaction.user.id) === String(record.customerId);

            const action = customId.split(':')[1];
            const paypalAddress = String(gconfig?.paypalAddress || '').trim();

            if (action === 'verify' || action === 'reject') {
                if (!isStaff) {
                    return interaction.reply({ content: 'Only staff can do that.', ephemeral: true });
                }

                if (action === 'verify') {
                    if (record.coupon) {
                        const coupons = loadJsonObject(COUPONS_FILE);
                        const key = String(record.couponKey || '').trim() || normalizeCouponName(record.coupon);
                        const c = coupons[key];
                        if (c) {
                            const maxUses = c.maxUses === null || typeof c.maxUses === 'undefined' ? null : Number(c.maxUses);
                            const uses = Number(c.uses || 0);
                            if (maxUses !== null && uses >= maxUses) {
                                return interaction.reply({ content: 'Coupon is out of uses; cannot verify with this coupon.', ephemeral: true });
                            }
                            c.uses = uses + 1;
                            coupons[key] = c;
                            saveJsonObject(COUPONS_FILE, coupons);
                        }
                    }

                    record.status = 'verified';
                    record.verifiedBy = interaction.user.id;
                    record.verifiedAt = Date.now();
                    record.updatedAt = Date.now();
                    store[record.messageId] = record;
                    saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                    const oldEmbed = interaction.message?.embeds?.[0];
                    const newEmbed = updateEmbedForRecord(oldEmbed, record);
                    await interaction.message.edit({
                        embeds: [newEmbed],
                        components: [buildPayRow({ paypalDisabled: true, cryptoDisabled: true, couponDisabled: true, paidDisabled: true }), buildVerifyRow({ verifyDisabled: true, rejectDisabled: true })]
                    }).catch(() => null);

                    return interaction.reply({ content: `Verified as paid for <@${record.customerId}>.`, ephemeral: false });
                }

                record.status = 'rejected';
                record.rejectedBy = interaction.user.id;
                record.rejectedAt = Date.now();
                record.updatedAt = Date.now();
                store[record.messageId] = record;
                saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                const oldEmbed = interaction.message?.embeds?.[0];
                const newEmbed = updateEmbedForRecord(oldEmbed, record);
                await interaction.message.edit({
                    embeds: [newEmbed],
                    components: [buildPayRow({ paypalDisabled: false, cryptoDisabled: false, couponDisabled: false, paidDisabled: false }), buildVerifyRow({ verifyDisabled: false, rejectDisabled: false })]
                }).catch(() => null);

                return interaction.reply({ content: `Rejected payment for <@${record.customerId}>.`, ephemeral: false });
            }

            if (!isCustomer) {
                return interaction.reply({ content: 'Only the customer for this payment can use these buttons.', ephemeral: true });
            }

            if (action === 'coupon') {
                if (record.status === 'paid_marked' || record.status === 'verified') {
                    return interaction.reply({ content: 'Coupon can no longer be changed for this request.', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`payreqmodal:coupon:${record.messageId}`)
                    .setTitle('Apply Coupon');
                const couponInput = new TextInputBuilder()
                    .setCustomId('coupon')
                    .setLabel('Coupon code')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(couponInput));
                return interaction.showModal(modal);
            }

            if (action === 'paypal') {
                if (!paypalAddress) {
                    return interaction.reply({ content: 'PayPal address is not configured yet (config.json: paypalAddress).', ephemeral: true });
                }
                const modal = new ModalBuilder()
                    .setCustomId(`payreqmodal:paypal:${record.messageId}`)
                    .setTitle('PayPal Payment');
                const email = new TextInputBuilder()
                    .setCustomId('email')
                    .setLabel('Your email')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                const note = new TextInputBuilder()
                    .setCustomId('note')
                    .setLabel('Optional note (invoice ID, etc)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(email), new ActionRowBuilder().addComponents(note));
                return interaction.showModal(modal);
            }

            if (action === 'crypto') {
                const modal = new ModalBuilder()
                    .setCustomId(`payreqmodal:crypto:${record.messageId}`)
                    .setTitle('Crypto Payment');
                const email = new TextInputBuilder()
                    .setCustomId('email')
                    .setLabel('Your email')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                const note = new TextInputBuilder()
                    .setCustomId('note')
                    .setLabel('Optional note (coin/network preference)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(email), new ActionRowBuilder().addComponents(note));
                return interaction.showModal(modal);
            }

            if (action === 'paid') {
                const modal = new ModalBuilder()
                    .setCustomId(`payreqmodal:paid:${record.messageId}`)
                    .setTitle("Mark as Paid");
                const email = new TextInputBuilder()
                    .setCustomId('email')
                    .setLabel('Your email')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                const note = new TextInputBuilder()
                    .setCustomId('note')
                    .setLabel('Optional note (transaction ID)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(email), new ActionRowBuilder().addComponents(note));
                return interaction.showModal(modal);
            }

            return;
        }

        if (interaction.isModalSubmit()) {
            const customId = String(interaction.customId || '');
            if (!customId.startsWith('payreqmodal:')) return;

            const parts = customId.split(':');
            const kind = parts[1];
            const messageId = parts[2];
            if (!kind || !messageId) return;

            const store = loadJsonObject(PAYMENT_REQUESTS_FILE);
            const record = store[messageId];
            if (!record) {
                return interaction.reply({ content: 'This payment request is no longer tracked.', ephemeral: true });
            }

            if (String(interaction.user.id) !== String(record.customerId)) {
                return interaction.reply({ content: 'Only the customer can submit this.', ephemeral: true });
            }

            if (kind === 'coupon') {
                if (record.status === 'paid_marked' || record.status === 'verified') {
                    return interaction.reply({ content: 'Coupon can no longer be changed for this request.', ephemeral: true });
                }

                const couponCodeRaw = String(interaction.fields.getTextInputValue('coupon') || '').trim();
                if (!couponCodeRaw) return interaction.reply({ content: 'Coupon code is required.', ephemeral: true });

                const coupons = loadJsonObject(COUPONS_FILE);
                const key = normalizeCouponName(couponCodeRaw);
                const c = coupons[key];
                if (!c) return interaction.reply({ content: 'Coupon not found.', ephemeral: true });
                const maxUses = c.maxUses === null || typeof c.maxUses === 'undefined' ? null : Number(c.maxUses);
                const uses = Number(c.uses || 0);
                if (maxUses !== null && uses >= maxUses) {
                    return interaction.reply({ content: 'Coupon has reached max uses.', ephemeral: true });
                }

                const discountPercent = Math.max(0, Math.min(100, Number(c.discountPercent || 0)));
                const baseCents = Number(record.baseCents || 0);
                const discountedCents = Math.round((baseCents * discountPercent) / 100);
                const finalCents = Math.max(0, baseCents - discountedCents);

                record.coupon = String(c.name || couponCodeRaw);
                record.couponKey = key;
                record.discountPercent = discountPercent;
                record.finalCents = finalCents;
                record.updatedAt = Date.now();
                store[messageId] = record;
                saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                try {
                    const msg = await interaction.channel.messages.fetch(messageId);
                    const oldEmbed = msg?.embeds?.[0];
                    const newEmbed = updateEmbedForRecord(oldEmbed, record);
                    const couponDisabled = record.status === 'paid_marked' || record.status === 'verified';
                    await msg.edit({ embeds: [newEmbed], components: [buildPayRow({ paypalDisabled: false, cryptoDisabled: false, couponDisabled, paidDisabled: false })] });
                } catch {}

                return interaction.reply({ content: `Coupon applied: ${record.coupon} (${discountPercent}% off). New total: $${centsToPriceString(finalCents)}.`, ephemeral: true });
            }

            const email = String(interaction.fields.getTextInputValue('email') || '').trim();
            const note = String(interaction.fields.getTextInputValue('note') || '').trim();
            if (!email) return interaction.reply({ content: 'Email is required.', ephemeral: true });

            const guild = interaction.guild;
            const channel = interaction.channel;
            if (!guild || !channel) return interaction.reply({ content: 'This can only be used in a server channel.', ephemeral: true });

            const staffRoleId = getStaffRoleIdForGuild(guild);

            record.email = email;
            record.note = note || null;
            record.updatedAt = Date.now();

            if (kind === 'paypal') {
                record.paymentMethod = 'paypal';
                record.status = 'awaiting_payment';
                store[messageId] = record;
                saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                try {
                    const msg = await channel.messages.fetch(messageId);
                    const oldEmbed = msg?.embeds?.[0];
                    const newEmbed = updateEmbedForRecord(oldEmbed, record);
                    const couponDisabled = record.status === 'paid_marked' || record.status === 'verified';
                    await msg.edit({ embeds: [newEmbed], components: [buildPayRow({ paypalDisabled: true, cryptoDisabled: true, couponDisabled, paidDisabled: false })] });
                } catch {}

                const paypalAddress = String(gconfig?.paypalAddress || '').trim();
                if (!paypalAddress) {
                    return interaction.reply({ content: 'PayPal address is not configured yet (config.json: paypalAddress).', ephemeral: true });
                }

                return interaction.reply({
                    content: `PayPal: **${paypalAddress}**\nSend as **Friends & Family**.\nTotal: **$${centsToPriceString(record.finalCents)}**`,
                    ephemeral: true
                });
            }

            if (kind === 'crypto') {
                record.paymentMethod = 'crypto';
                record.status = 'awaiting_payment';
                store[messageId] = record;
                saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                try {
                    const msg = await channel.messages.fetch(messageId);
                    const oldEmbed = msg?.embeds?.[0];
                    const newEmbed = updateEmbedForRecord(oldEmbed, record);
                    const couponDisabled = record.status === 'paid_marked' || record.status === 'verified';
                    await msg.edit({ embeds: [newEmbed], components: [buildPayRow({ paypalDisabled: true, cryptoDisabled: true, couponDisabled, paidDisabled: false })] });
                } catch {}

                if (staffRoleId) {
                    try {
                        await channel.send({
                            content: `<@&${staffRoleId}> Crypto payment requested by <@${record.customerId}> for **$${centsToPriceString(record.finalCents)}** (email: ${email}).`
                        });
                    } catch {}
                }

                return interaction.reply({
                    content: 'Staff has been notified for crypto. Please wait for payment details.',
                    ephemeral: true
                });
            }

            if (kind === 'paid') {
                record.status = 'paid_marked';
                store[messageId] = record;
                saveJsonObject(PAYMENT_REQUESTS_FILE, store);

                try {
                    const msg = await channel.messages.fetch(messageId);
                    const oldEmbed = msg?.embeds?.[0];
                    const newEmbed = updateEmbedForRecord(oldEmbed, record);
                    await msg.edit({
                        embeds: [newEmbed],
                        components: [
                            buildPayRow({ paypalDisabled: true, cryptoDisabled: true, couponDisabled: true, paidDisabled: true }),
                            buildVerifyRow({ verifyDisabled: false, rejectDisabled: false })
                        ]
                    });
                } catch {}

                if (staffRoleId) {
                    try {
                        await channel.send({
                            content: `<@&${staffRoleId}> <@${record.customerId}> marked as paid. Please verify. (email: ${email})`
                        });
                    } catch {}
                }

                return interaction.reply({ content: 'Marked as paid. Staff has been pinged to verify.', ephemeral: true });
            }

            return interaction.reply({ content: 'Unknown payment action.', ephemeral: true });
        }
    }
};
