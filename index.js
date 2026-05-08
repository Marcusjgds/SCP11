const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DATA_FILE = './data.json';

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ tickets: {}, services: {}, rapports: [], ticketSetup: {} }));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── CLIENT ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure le système de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('pds')
    .setDescription('Prise de service — déclare que tu es en service'),

  new SlashCommandBuilder()
    .setName('fds')
    .setDescription('Fin de service — termine ta session de service'),

  new SlashCommandBuilder()
    .setName('rapport')
    .setDescription('Affiche tous les rapports PDS/FDS')
    .addIntegerOption(opt =>
      opt.setName('page').setDescription('Numéro de page').setMinValue(1)
    ),
];

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────
async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), {
    body: commands.map(c => c.toJSON()),
  });
  console.log(`✅ Commandes enregistrées pour ${guildId}`);
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  client.guilds.cache.forEach(guild => registerCommands(guild.id).catch(console.error));
});

client.on('guildCreate', guild => registerCommands(guild.id).catch(console.error));

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function getRoleNames(guild, roleIds) {
  return roleIds.map(id => {
    const role = guild.roles.cache.get(id);
    return role ? role.name : id;
  }).join(', ');
}

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  try {
    // ── SLASH COMMANDS ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      // /setup
      if (interaction.commandName === 'setup') {
        await handleSetup(interaction);
      }
      // /pds
      else if (interaction.commandName === 'pds') {
        await handlePDS(interaction);
      }
      // /fds
      else if (interaction.commandName === 'fds') {
        await handleFDS(interaction);
      }
      // /rapport
      else if (interaction.commandName === 'rapport') {
        await handleRapport(interaction);
      }
    }

    // ── BUTTONS ─────────────────────────────────────────────────────────────
    else if (interaction.isButton()) {
      if (interaction.customId === 'setup_add_role') {
        await handleSetupAddRole(interaction);
      } else if (interaction.customId === 'setup_confirm') {
        await handleSetupConfirm(interaction);
      } else if (interaction.customId.startsWith('ticket_role_')) {
        await handleTicketRoleSelect(interaction);
      } else if (interaction.customId.startsWith('claim_ticket_')) {
        await handleClaimTicket(interaction);
      } else if (interaction.customId.startsWith('close_ticket_')) {
        await handleCloseTicket(interaction);
      }
    }

    // ── SELECT MENUS ─────────────────────────────────────────────────────────
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'setup_role_select') {
        await handleSetupRoleSelect(interaction);
      }
    }

    // ── MODALS ──────────────────────────────────────────────────────────────
    else if (interaction.isModalSubmit()) {
      if (interaction.customId === 'setup_modal') {
        await handleSetupModal(interaction);
      } else if (interaction.customId.startsWith('ticket_form_')) {
        await handleTicketForm(interaction);
      }
    }
  } catch (err) {
    console.error('Erreur interaction:', err);
    const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════════════════════════════════════════
async function handleSetup(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('setup_modal')
    .setTitle('⚙️ Configuration des tickets');

  const categoryInput = new TextInputBuilder()
    .setCustomId('category_name')
    .setLabel('Nom de la catégorie pour les tickets')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ex: 📋 Tickets')
    .setRequired(true);

  const staffRoleInput = new TextInputBuilder()
    .setCustomId('staff_role_id')
    .setLabel('ID du rôle STAFF (claim/close tickets)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ex: 123456789012345678')
    .setRequired(true);

  const rolesInput = new TextInputBuilder()
    .setCustomId('roles_input')
    .setLabel('IDs des rôles à mentionner (séparés par des virgules)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ex: 111111111111111111, 222222222222222222')
    .setRequired(true);

  const channelInput = new TextInputBuilder()
    .setCustomId('panel_channel')
    .setLabel('ID du salon pour le panneau de tickets')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ex: 123456789012345678')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(categoryInput),
    new ActionRowBuilder().addComponents(staffRoleInput),
    new ActionRowBuilder().addComponents(rolesInput),
    new ActionRowBuilder().addComponents(channelInput),
  );

  await interaction.showModal(modal);
}

async function handleSetupModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const categoryName = interaction.fields.getTextInputValue('category_name');
  const staffRoleId = interaction.fields.getTextInputValue('staff_role_id').trim();
  const rolesRaw = interaction.fields.getTextInputValue('roles_input');
  const panelChannelId = interaction.fields.getTextInputValue('panel_channel').trim();

  const roleIds = rolesRaw.split(',').map(r => r.trim()).filter(r => r.length > 10);

  // Validate roles
  const validRoles = [];
  for (const id of roleIds) {
    const role = interaction.guild.roles.cache.get(id);
    if (role) validRoles.push({ id: role.id, name: role.name });
  }

  if (validRoles.length === 0) {
    return interaction.editReply('❌ Aucun rôle valide trouvé. Vérifie les IDs.');
  }

  const staffRole = interaction.guild.roles.cache.get(staffRoleId);
  if (!staffRole) {
    return interaction.editReply('❌ Rôle staff introuvable. Vérifie l\'ID.');
  }

  const panelChannel = interaction.guild.channels.cache.get(panelChannelId);
  if (!panelChannel) {
    return interaction.editReply('❌ Salon introuvable. Vérifie l\'ID.');
  }

  // Create or find category
  let category = interaction.guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === categoryName
  );
  if (!category) {
    category = await interaction.guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
    });
  }

  // Save config
  const data = loadData();
  data.ticketSetup[interaction.guild.id] = {
    categoryId: category.id,
    staffRoleId: staffRole.id,
    roles: validRoles,
    panelChannelId: panelChannel.id,
    ticketCounter: data.ticketSetup[interaction.guild.id]?.ticketCounter || 0,
  };
  saveData(data);

  // Build panel embed
  const embed = new EmbedBuilder()
    .setTitle('🎫 Système de Tickets')
    .setDescription('Cliquez sur le bouton correspondant à votre besoin pour ouvrir un ticket.')
    .setColor(0x5865F2)
    .setFooter({ text: 'Système de tickets • Cliquez pour ouvrir' })
    .setTimestamp();

  validRoles.forEach(r => {
    embed.addFields({ name: `🏷️ ${r.name}`, value: `Ouvrir un ticket pour @${r.name}`, inline: true });
  });

  // Build buttons (max 5 per row)
  const rows = [];
  for (let i = 0; i < validRoles.length; i += 5) {
    const chunk = validRoles.slice(i, i + 5);
    const row = new ActionRowBuilder();
    chunk.forEach(r => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_role_${r.id}`)
          .setLabel(r.name)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎫')
      );
    });
    rows.push(row);
  }

  await panelChannel.send({ embeds: [embed], components: rows });
  await interaction.editReply(`✅ Panneau de tickets envoyé dans <#${panelChannel.id}> !\n**${validRoles.length} rôle(s)** configuré(s) : ${validRoles.map(r => r.name).join(', ')}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET — Sélection du rôle → Modal formulaire
// ══════════════════════════════════════════════════════════════════════════════
async function handleTicketRoleSelect(interaction) {
  const roleId = interaction.customId.replace('ticket_role_', '');
  const role = interaction.guild.roles.cache.get(roleId);

  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_${roleId}`)
    .setTitle(`🎫 Ticket — ${role?.name || roleId}`);

  const pseudoInput = new TextInputBuilder()
    .setCustomId('pseudo_roblox')
    .setLabel('Votre pseudo Roblox')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ex: Player123')
    .setRequired(true);

  const gradeInput = new TextInputBuilder()
    .setCustomId('grade')
    .setLabel('Votre grade / rang')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('ex: Sergent, Lieutenant...')
    .setRequired(true);

  const preuveInput = new TextInputBuilder()
    .setCustomId('preuve')
    .setLabel('Preuve (lien ou description — optionnel)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('https://imgur.com/... ou laissez vide')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(pseudoInput),
    new ActionRowBuilder().addComponents(gradeInput),
    new ActionRowBuilder().addComponents(preuveInput),
  );

  await interaction.showModal(modal);
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET — Traitement formulaire → Créer le salon
// ══════════════════════════════════════════════════════════════════════════════
async function handleTicketForm(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const roleId = interaction.customId.replace('ticket_form_', '');
  const pseudo = interaction.fields.getTextInputValue('pseudo_roblox');
  const grade = interaction.fields.getTextInputValue('grade');
  const preuve = interaction.fields.getTextInputValue('preuve') || null;

  const data = loadData();
  const setup = data.ticketSetup[interaction.guild.id];
  if (!setup) {
    return interaction.editReply('❌ Le système de tickets n\'est pas configuré. Utilisez /setup.');
  }

  // Incrémenter le compteur
  setup.ticketCounter = (setup.ticketCounter || 0) + 1;
  const ticketNum = String(setup.ticketCounter).padStart(4, '0');
  saveData(data);

  const role = interaction.guild.roles.cache.get(roleId);
  const staffRole = interaction.guild.roles.cache.get(setup.staffRoleId);

  // Créer le salon ticket
  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketNum}-${pseudo.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    type: ChannelType.GuildText,
    parent: setup.categoryId,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
      },
      {
        id: setup.staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
      },
      ...(roleId !== setup.staffRoleId ? [{
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      }] : []),
    ],
  });

  // Embed du ticket
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNum}`)
    .setColor(0x5865F2)
    .setDescription(`Bienvenue <@${interaction.user.id}> !\nUn membre du staff va prendre en charge votre ticket.`)
    .addFields(
      { name: '👤 Pseudo Roblox', value: pseudo, inline: true },
      { name: '🏅 Grade', value: grade, inline: true },
      { name: '🎯 Rôle concerné', value: `<@&${roleId}>`, inline: true },
      { name: '📎 Preuve', value: preuve || '*Aucune preuve fournie*', inline: false },
      { name: '📅 Ouvert le', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      { name: '👤 Ouvert par', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setFooter({ text: `Ticket #${ticketNum}` })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_ticket_${channel.id}`)
      .setLabel('✋ Réclamer')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`close_ticket_${channel.id}`)
      .setLabel('🔒 Fermer')
      .setStyle(ButtonStyle.Danger),
  );

  // Ping le rôle concerné + staff
  const pingMsg = `<@&${roleId}>${staffRole && roleId !== setup.staffRoleId ? ` | <@&${setup.staffRoleId}>` : ''}`;
  await channel.send({ content: pingMsg, embeds: [embed], components: [actionRow] });

  // Sauvegarder le ticket
  data.tickets[channel.id] = {
    ticketNum,
    userId: interaction.user.id,
    pseudo,
    grade,
    preuve,
    roleId,
    guildId: interaction.guild.id,
    openedAt: Date.now(),
    claimed: false,
    claimedBy: null,
    closed: false,
  };
  saveData(data);

  await interaction.editReply(`✅ Ton ticket a été créé : <#${channel.id}>`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET — Claim
// ══════════════════════════════════════════════════════════════════════════════
async function handleClaimTicket(interaction) {
  const channelId = interaction.customId.replace('claim_ticket_', '');
  const data = loadData();
  const setup = data.ticketSetup[interaction.guild.id];

  if (!setup) return interaction.reply({ content: '❌ Configuration introuvable.', ephemeral: true });

  // Vérifier rôle staff
  const member = interaction.member;
  const hasStaffRole = member.roles.cache.has(setup.staffRoleId);
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasStaffRole && !isAdmin) {
    return interaction.reply({ content: '❌ Seuls les membres du staff peuvent réclamer un ticket.', ephemeral: true });
  }

  const ticket = data.tickets[channelId];
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
  if (ticket.claimed) {
    return interaction.reply({ content: `❌ Ce ticket est déjà réclamé par <@${ticket.claimedBy}>.`, ephemeral: true });
  }

  ticket.claimed = true;
  ticket.claimedBy = interaction.user.id;
  saveData(data);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setDescription(`✋ **Ticket réclamé** par <@${interaction.user.id}>\n> Ce ticket est maintenant pris en charge.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKET — Close
// ══════════════════════════════════════════════════════════════════════════════
async function handleCloseTicket(interaction) {
  const channelId = interaction.customId.replace('close_ticket_', '');
  const data = loadData();
  const setup = data.ticketSetup[interaction.guild.id];

  if (!setup) return interaction.reply({ content: '❌ Configuration introuvable.', ephemeral: true });

  const member = interaction.member;
  const hasStaffRole = member.roles.cache.has(setup.staffRoleId);
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasStaffRole && !isAdmin) {
    return interaction.reply({ content: '❌ Seuls les membres du staff peuvent fermer un ticket.', ephemeral: true });
  }

  const ticket = data.tickets[channelId];
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setDescription(`🔒 **Ticket fermé** par <@${interaction.user.id}>\n> Ce salon sera supprimé dans **5 secondes**.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  ticket.closed = true;
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = Date.now();
  saveData(data);

  setTimeout(async () => {
    await interaction.channel.delete().catch(() => {});
  }, 5000);
}

// ══════════════════════════════════════════════════════════════════════════════
// PDS — Prise de service
// ══════════════════════════════════════════════════════════════════════════════
async function handlePDS(interaction) {
  const data = loadData();
  const userId = interaction.user.id;

  if (data.services[userId]?.active) {
    return interaction.reply({
      content: '❌ Tu es déjà en service ! Utilise `/fds` pour terminer ton service actuel.',
      ephemeral: true,
    });
  }

  // Récupérer les rôles du membre (filtre les rôles non @everyone)
  const memberRoles = interaction.member.roles.cache
    .filter(r => r.id !== interaction.guild.id)
    .sort((a, b) => b.position - a.position);

  const topRole = memberRoles.first();
  const roleName = topRole ? topRole.name : 'Aucun rôle';
  const roleId = topRole ? topRole.id : null;

  const now = Date.now();
  data.services[userId] = {
    active: true,
    startTime: now,
    guildId: interaction.guild.id,
    roleName,
    roleId,
    username: interaction.user.tag,
    displayName: interaction.member.displayName,
  };
  saveData(data);

  const embed = new EmbedBuilder()
    .setTitle('🟢 Prise de Service')
    .setColor(0x57F287)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '👤 Agent', value: `<@${userId}>`, inline: true },
      { name: '🏅 Grade', value: roleId ? `<@&${roleId}>` : roleName, inline: true },
      { name: '⏰ Début de service', value: `<t:${Math.floor(now / 1000)}:F>`, inline: false },
      { name: '⏱️ Timestamp', value: `<t:${Math.floor(now / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'Utilisez /fds pour terminer votre service' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ══════════════════════════════════════════════════════════════════════════════
// FDS — Fin de service
// ══════════════════════════════════════════════════════════════════════════════
async function handleFDS(interaction) {
  const data = loadData();
  const userId = interaction.user.id;

  if (!data.services[userId]?.active) {
    return interaction.reply({
      content: '❌ Tu n\'es pas en service ! Utilise `/pds` pour commencer.',
      ephemeral: true,
    });
  }

  const service = data.services[userId];
  const now = Date.now();
  const duration = now - service.startTime;

  // Sauvegarder dans les rapports
  if (!data.rapports) data.rapports = [];
  data.rapports.push({
    userId,
    username: service.username,
    displayName: service.displayName,
    roleName: service.roleName,
    roleId: service.roleId,
    guildId: service.guildId,
    startTime: service.startTime,
    endTime: now,
    duration,
    type: 'service',
  });

  data.services[userId] = { active: false };
  saveData(data);

  const embed = new EmbedBuilder()
    .setTitle('🔴 Fin de Service')
    .setColor(0xED4245)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '👤 Agent', value: `<@${userId}>`, inline: true },
      { name: '🏅 Grade', value: service.roleId ? `<@&${service.roleId}>` : service.roleName, inline: true },
      { name: '⏰ Début', value: `<t:${Math.floor(service.startTime / 1000)}:F>`, inline: false },
      { name: '⏰ Fin', value: `<t:${Math.floor(now / 1000)}:F>`, inline: false },
      { name: '⏱️ Durée totale', value: `**${formatDuration(duration)}**`, inline: false },
    )
    .setFooter({ text: 'Service terminé' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ══════════════════════════════════════════════════════════════════════════════
// RAPPORT
// ══════════════════════════════════════════════════════════════════════════════
async function handleRapport(interaction) {
  const data = loadData();
  const page = interaction.options.getInteger('page') || 1;
  const perPage = 5;

  const guildRapports = (data.rapports || [])
    .filter(r => r.guildId === interaction.guild.id)
    .sort((a, b) => b.endTime - a.endTime);

  const totalPages = Math.max(1, Math.ceil(guildRapports.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * perPage;
  const items = guildRapports.slice(start, start + perPage);

  // Stats globales
  const totalTime = guildRapports.reduce((acc, r) => acc + r.duration, 0);
  const uniqueUsers = [...new Set(guildRapports.map(r => r.userId))];

  const embed = new EmbedBuilder()
    .setTitle('📊 Rapport des Services PDS/FDS')
    .setColor(0x5865F2)
    .setDescription(
      `**${guildRapports.length}** session(s) enregistrée(s) • **${uniqueUsers.length}** agent(s) • Temps total : **${formatDuration(totalTime)}**\n` +
      `Page **${currentPage}/${totalPages}**`
    )
    .setTimestamp();

  if (items.length === 0) {
    embed.addFields({ name: 'Aucune donnée', value: 'Aucun service enregistré pour ce serveur.' });
  } else {
    items.forEach((r, i) => {
      embed.addFields({
        name: `#${start + i + 1} — ${r.displayName || r.username}`,
        value: [
          `👤 <@${r.userId}> • 🏅 ${r.roleName}`,
          `🟢 PDS : <t:${Math.floor(r.startTime / 1000)}:F>`,
          `🔴 FDS : <t:${Math.floor(r.endTime / 1000)}:F>`,
          `⏱️ Durée : **${formatDuration(r.duration)}**`,
        ].join('\n'),
        inline: false,
      });
    });
  }

  // Boutons services actifs
  const activeServices = Object.entries(data.services || {})
    .filter(([uid, s]) => s.active && s.guildId === interaction.guild.id);

  if (activeServices.length > 0) {
    const activeText = activeServices.map(([uid, s]) => {
      const elapsed = Date.now() - s.startTime;
      return `🟢 <@${uid}> (${s.roleName}) — en service depuis **${formatDuration(elapsed)}**`;
    }).join('\n');
    embed.addFields({ name: '🟢 Agents actuellement en service', value: activeText, inline: false });
  }

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
