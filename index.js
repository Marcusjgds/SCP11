const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType
} = require('discord.js');
const fs = require('fs');

const DATA_FILE = './data.json';
function loadData() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ tickets: {}, services: {}, rapports: [], ticketSetup: {}, setupSession: {} }));
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!d.setupSession) d.setupSession = {};
  return d;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder().setName('setup').setDescription('Configure le système de tickets').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('pds').setDescription('Prise de service'),
  new SlashCommandBuilder().setName('fds').setDescription('Fin de service'),
  new SlashCommandBuilder().setName('rapport').setDescription('Rapports PDS/FDS').addIntegerOption(o => o.setName('page').setDescription('Page').setMinValue(1)),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands.map(c => c.toJSON()) });
  console.log(`✅ Commandes enregistrées pour ${guildId}`);
}

client.once('ready', () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  client.guilds.cache.forEach(g => registerCommands(g.id).catch(console.error));
});
client.on('guildCreate', g => registerCommands(g.id).catch(console.error));

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup')   return handleSetup(interaction);
      if (interaction.commandName === 'pds')     return handlePDS(interaction);
      if (interaction.commandName === 'fds')     return handleFDS(interaction);
      if (interaction.commandName === 'rapport') return handleRapport(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'setup_select_roles')   return handleSetupRolesSelected(interaction);
      if (interaction.customId === 'setup_select_staff')   return handleSetupStaffSelected(interaction);
      if (interaction.customId === 'setup_select_channel') return handleSetupChannelSelected(interaction);
    }
    if (interaction.isButton()) {
      if (interaction.customId === 'setup_confirm')         return handleSetupConfirm(interaction);
      if (interaction.customId.startsWith('ticket_role_'))  return handleTicketRoleClick(interaction);
      if (interaction.customId.startsWith('claim_ticket_')) return handleClaimTicket(interaction);
      if (interaction.customId.startsWith('close_ticket_')) return handleCloseTicket(interaction);
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('ticket_form_')) return handleTicketForm(interaction);
    }
  } catch (err) {
    console.error('Erreur:', err);
    const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

// ── SETUP étape 1 : choisir les rôles boutons ──────────────────────────────
async function handleSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const roles = interaction.guild.roles.cache
    .filter(r => r.id !== interaction.guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .first(25);

  if (!roles.length) return interaction.editReply('❌ Aucun rôle trouvé.');

  const select = new StringSelectMenuBuilder()
    .setCustomId('setup_select_roles')
    .setPlaceholder('Sélectionne les rôles pour les boutons du panel...')
    .setMinValues(1)
    .setMaxValues(Math.min(roles.length, 5))
    .addOptions(roles.map(r => ({ label: r.name, value: r.id, description: `ID: ${r.id}` })));

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Setup — Étape 1/3')
    .setDescription('**Quels rôles veux-tu comme boutons dans le panel ?**\n\nEx: Marshal, Chef Garde, Directeur Sécuritaire…\n> Maximum **5** rôles.')
    .setColor(0x5865F2);

  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
}

// ── SETUP étape 2 : choisir le rôle staff ──────────────────────────────────
async function handleSetupRolesSelected(interaction) {
  await interaction.deferUpdate();
  const selectedRoles = interaction.values.map(id => {
    const r = interaction.guild.roles.cache.get(id);
    return { id, name: r?.name || id };
  });

  const data = loadData();
  data.setupSession[interaction.user.id] = { guildId: interaction.guild.id, selectedRoles };
  saveData(data);

  const roles = interaction.guild.roles.cache
    .filter(r => r.id !== interaction.guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .first(25);

  const select = new StringSelectMenuBuilder()
    .setCustomId('setup_select_staff')
    .setPlaceholder('Sélectionne le rôle STAFF (claim & fermeture)...')
    .setMinValues(1).setMaxValues(1)
    .addOptions(roles.map(r => ({ label: r.name, value: r.id, description: `ID: ${r.id}` })));

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Setup — Étape 2/3')
    .setDescription(`✅ Boutons : ${selectedRoles.map(r => `**${r.name}**`).join(', ')}\n\n**Quel rôle peut réclamer et fermer les tickets ?**\n> Ton rôle Staff / Modérateur`)
    .setColor(0x5865F2);

  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
}

// ── SETUP étape 3 : choisir le salon du panel ──────────────────────────────
async function handleSetupStaffSelected(interaction) {
  await interaction.deferUpdate();
  const staffRoleId = interaction.values[0];
  const staffRole = interaction.guild.roles.cache.get(staffRoleId);

  const data = loadData();
  data.setupSession[interaction.user.id].staffRoleId = staffRoleId;
  data.setupSession[interaction.user.id].staffRoleName = staffRole?.name || staffRoleId;
  saveData(data);

  const channels = interaction.guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position)
    .first(25);

  const select = new StringSelectMenuBuilder()
    .setCustomId('setup_select_channel')
    .setPlaceholder('Sélectionne le salon pour le panel...')
    .setMinValues(1).setMaxValues(1)
    .addOptions(channels.map(c => ({ label: `#${c.name}`, value: c.id, description: c.parent?.name || 'Sans catégorie' })));

  const session = data.setupSession[interaction.user.id];
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Setup — Étape 3/3')
    .setDescription(`✅ Boutons : ${session.selectedRoles.map(r => `**${r.name}**`).join(', ')}\n✅ Staff : **${staffRole?.name}**\n\n**Dans quel salon envoyer le panel ?**`)
    .setColor(0x5865F2);

  await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
}

// ── SETUP confirmation ──────────────────────────────────────────────────────
async function handleSetupChannelSelected(interaction) {
  await interaction.deferUpdate();
  const channelId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelId);

  const data = loadData();
  data.setupSession[interaction.user.id].panelChannelId = channelId;
  saveData(data);

  const session = data.setupSession[interaction.user.id];
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Setup — Récapitulatif')
    .setColor(0x57F287)
    .addFields(
      { name: '🎫 Boutons', value: session.selectedRoles.map(r => `• **${r.name}**`).join('\n') },
      { name: '👮 Rôle Staff', value: `<@&${session.staffRoleId}>`, inline: true },
      { name: '📢 Salon', value: `<#${channelId}>`, inline: true },
    )
    .setFooter({ text: 'Clique Confirmer pour lancer' });

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup_confirm').setLabel('✅ Confirmer').setStyle(ButtonStyle.Success)
    )]
  });
}

// ── SETUP : créer le panel ──────────────────────────────────────────────────
async function handleSetupConfirm(interaction) {
  await interaction.deferUpdate();
  const data = loadData();
  const session = data.setupSession[interaction.user.id];
  if (!session) return interaction.editReply({ content: '❌ Session expirée. Relance /setup.', embeds: [], components: [] });

  const guild = interaction.guild;
  const panelChannel = guild.channels.cache.get(session.panelChannelId);
  if (!panelChannel) return interaction.editReply({ content: '❌ Salon introuvable.', embeds: [], components: [] });

  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '📋 Tickets');
  if (!category) category = await guild.channels.create({ name: '📋 Tickets', type: ChannelType.GuildCategory });

  data.ticketSetup[guild.id] = {
    categoryId: category.id,
    staffRoleId: session.staffRoleId,
    roles: session.selectedRoles,
    panelChannelId: session.panelChannelId,
    ticketCounter: data.ticketSetup[guild.id]?.ticketCounter || 0,
  };
  delete data.setupSession[interaction.user.id];
  saveData(data);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ouvrir un Ticket')
    .setDescription('Clique sur le bouton correspondant à ton besoin.\nUn membre du staff prendra en charge ta demande.')
    .setColor(0x5865F2)
    .setFooter({ text: 'Système de tickets' })
    .setTimestamp();

  session.selectedRoles.forEach(r => embed.addFields({ name: `🏷️ ${r.name}`, value: `Ping <@&${r.id}>`, inline: true }));

  const rows = [];
  for (let i = 0; i < session.selectedRoles.length; i += 5) {
    const row = new ActionRowBuilder();
    session.selectedRoles.slice(i, i + 5).forEach(r =>
      row.addComponents(new ButtonBuilder().setCustomId(`ticket_role_${r.id}`).setLabel(r.name).setStyle(ButtonStyle.Primary).setEmoji('🎫'))
    );
    rows.push(row);
  }

  await panelChannel.send({ embeds: [embed], components: rows });
  await interaction.editReply({ embeds: [], components: [], content: `✅ Panel envoyé dans <#${session.panelChannelId}> avec les boutons : ${session.selectedRoles.map(r => `**${r.name}**`).join(', ')}` });
}

// ── TICKET : clic bouton → modal ────────────────────────────────────────────
async function handleTicketRoleClick(interaction) {
  const roleId = interaction.customId.replace('ticket_role_', '');
  const role = interaction.guild.roles.cache.get(roleId);
  const modal = new ModalBuilder().setCustomId(`ticket_form_${roleId}`).setTitle(`🎫 Ticket — ${role?.name || roleId}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pseudo_roblox').setLabel('Ton pseudo Roblox').setStyle(TextInputStyle.Short).setPlaceholder('ex: Player123').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('grade').setLabel('Ton grade / rang').setStyle(TextInputStyle.Short).setPlaceholder('ex: Sergent, Lieutenant...').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('preuve').setLabel('Preuve — lien ou description (optionnel)').setStyle(TextInputStyle.Paragraph).setPlaceholder('https://imgur.com/... ou laissez vide').setRequired(false)),
  );
  await interaction.showModal(modal);
}

// ── TICKET : traitement formulaire ──────────────────────────────────────────
async function handleTicketForm(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const roleId = interaction.customId.replace('ticket_form_', '');
  const pseudo = interaction.fields.getTextInputValue('pseudo_roblox');
  const grade  = interaction.fields.getTextInputValue('grade');
  const preuve = interaction.fields.getTextInputValue('preuve') || null;

  const data  = loadData();
  const setup = data.ticketSetup[interaction.guild.id];
  if (!setup) return interaction.editReply('❌ Bot non configuré. Utilise /setup.');

  setup.ticketCounter = (setup.ticketCounter || 0) + 1;
  const ticketNum = String(setup.ticketCounter).padStart(4, '0');
  saveData(data);

  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketNum}-${pseudo.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15)}`,
    type: ChannelType.GuildText,
    parent: setup.categoryId,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
      { id: setup.staffRoleId,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
      ...(roleId !== setup.staffRoleId ? [{ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNum}`)
    .setColor(0x5865F2)
    .setDescription(`Bienvenue <@${interaction.user.id}> ! Un membre du staff va prendre en charge ta demande.`)
    .addFields(
      { name: '👤 Pseudo Roblox', value: pseudo, inline: true },
      { name: '🏅 Grade', value: grade, inline: true },
      { name: '🎯 Rôle concerné', value: `<@&${roleId}>`, inline: true },
      { name: '📎 Preuve', value: preuve || '*Aucune preuve fournie*' },
      { name: '📅 Ouvert le', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
      { name: '👤 Par', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setFooter({ text: `Ticket #${ticketNum}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`claim_ticket_${channel.id}`).setLabel('✋ Réclamer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`close_ticket_${channel.id}`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@&${roleId}>`, embeds: [embed], components: [row] });
  data.tickets[channel.id] = { ticketNum, userId: interaction.user.id, pseudo, grade, preuve, roleId, guildId: interaction.guild.id, openedAt: Date.now(), claimed: false, claimedBy: null };
  saveData(data);
  await interaction.editReply(`✅ Ticket créé : <#${channel.id}>`);
}

// ── TICKET : claim ──────────────────────────────────────────────────────────
async function handleClaimTicket(interaction) {
  const channelId = interaction.customId.replace('claim_ticket_', '');
  const data = loadData();
  const setup = data.ticketSetup[interaction.guild.id];
  const ticket = data.tickets[channelId];
  const isStaff = interaction.member.roles.cache.has(setup?.staffRoleId);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isStaff && !isAdmin) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
  if (ticket.claimed) return interaction.reply({ content: `❌ Déjà réclamé par <@${ticket.claimedBy}>.`, ephemeral: true });
  ticket.claimed = true; ticket.claimedBy = interaction.user.id;
  saveData(data);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✋ **Réclamé** par <@${interaction.user.id}>`).setTimestamp()] });
}

// ── TICKET : close ──────────────────────────────────────────────────────────
async function handleCloseTicket(interaction) {
  const channelId = interaction.customId.replace('close_ticket_', '');
  const data = loadData();
  const setup = data.ticketSetup[interaction.guild.id];
  const ticket = data.tickets[channelId];
  const isStaff = interaction.member.roles.cache.has(setup?.staffRoleId);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isStaff && !isAdmin) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🔒 **Fermé** par <@${interaction.user.id}>\n> Suppression dans 5 secondes.`).setTimestamp()] });
  ticket.closed = true; ticket.closedBy = interaction.user.id; ticket.closedAt = Date.now();
  saveData(data);
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ── PDS ─────────────────────────────────────────────────────────────────────
async function handlePDS(interaction) {
  const data = loadData();
  const userId = interaction.user.id;
  if (data.services[userId]?.active) return interaction.reply({ content: '❌ Déjà en service ! Utilise `/fds` d\'abord.', ephemeral: true });
  const topRole = interaction.member.roles.cache.filter(r => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position).first();
  const now = Date.now();
  data.services[userId] = { active: true, startTime: now, guildId: interaction.guild.id, roleName: topRole?.name || 'Aucun rôle', roleId: topRole?.id || null, username: interaction.user.tag, displayName: interaction.member.displayName };
  saveData(data);
  await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🟢 Prise de Service').setColor(0x57F287).setThumbnail(interaction.user.displayAvatarURL()).addFields({ name: '👤 Agent', value: `<@${userId}>`, inline: true }, { name: '🏅 Grade', value: topRole ? `<@&${topRole.id}>` : 'Aucun rôle', inline: true }, { name: '⏰ Début', value: `<t:${Math.floor(now/1000)}:F>` }).setFooter({ text: 'Utilisez /fds pour terminer' }).setTimestamp()] });
}

// ── FDS ─────────────────────────────────────────────────────────────────────
async function handleFDS(interaction) {
  const data = loadData();
  const userId = interaction.user.id;
  if (!data.services[userId]?.active) return interaction.reply({ content: '❌ Pas en service ! Utilise `/pds` d\'abord.', ephemeral: true });
  const service = data.services[userId];
  const now = Date.now();
  const duration = now - service.startTime;
  if (!data.rapports) data.rapports = [];
  data.rapports.push({ userId, username: service.username, displayName: service.displayName, roleName: service.roleName, roleId: service.roleId, guildId: service.guildId, startTime: service.startTime, endTime: now, duration });
  data.services[userId] = { active: false };
  saveData(data);
  await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔴 Fin de Service').setColor(0xED4245).setThumbnail(interaction.user.displayAvatarURL()).addFields({ name: '👤 Agent', value: `<@${userId}>`, inline: true }, { name: '🏅 Grade', value: service.roleId ? `<@&${service.roleId}>` : service.roleName, inline: true }, { name: '⏰ Début', value: `<t:${Math.floor(service.startTime/1000)}:F>` }, { name: '⏰ Fin', value: `<t:${Math.floor(now/1000)}:F>` }, { name: '⏱️ Durée', value: `**${formatDuration(duration)}**` }).setTimestamp()] });
}

// ── RAPPORT ─────────────────────────────────────────────────────────────────
async function handleRapport(interaction) {
  const data = loadData();
  const page = interaction.options.getInteger('page') || 1;
  const perPage = 5;
  const all = (data.rapports || []).filter(r => r.guildId === interaction.guild.id).sort((a, b) => b.endTime - a.endTime);
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * perPage, currentPage * perPage);
  const totalTime = all.reduce((acc, r) => acc + r.duration, 0);
  const embed = new EmbedBuilder().setTitle('📊 Rapport PDS / FDS').setColor(0x5865F2).setDescription(`**${all.length}** session(s) • Temps total : **${formatDuration(totalTime)}** • Page **${currentPage}/${totalPages}**`).setTimestamp();
  if (!items.length) { embed.addFields({ name: 'Aucune donnée', value: 'Aucun service enregistré.' }); }
  else items.forEach((r, i) => embed.addFields({ name: `#${(currentPage-1)*perPage+i+1} — ${r.displayName || r.username}`, value: `👤 <@${r.userId}> • 🏅 ${r.roleName}\n🟢 <t:${Math.floor(r.startTime/1000)}:F>\n🔴 <t:${Math.floor(r.endTime/1000)}:F>\n⏱️ **${formatDuration(r.duration)}**` }));
  const active = Object.entries(data.services || {}).filter(([,s]) => s.active && s.guildId === interaction.guild.id);
  if (active.length) embed.addFields({ name: '🟢 En service', value: active.map(([uid,s]) => `<@${uid}> (${s.roleName}) — **${formatDuration(Date.now()-s.startTime)}**`).join('\n') });
  await interaction.reply({ embeds: [embed] });
}

client.login(process.env.TOKEN);
