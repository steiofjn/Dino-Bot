const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType,
  Partials
} = require('discord.js');

const fs = require("fs");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1490856953063280682";
const GUILD_ID = "1406383725142474883";

// ===== VERIFY SYSTEM =====
const UNVERIFIED_ROLE = "1453996795243003978";
const VERIFIED_ROLES = [
  "1475889110047785151",
  "1406393371710459969"
];
const VERIFY_CHANNEL_ID = "1416081113172152340";

// ===== CHANNELS =====
const FULL_LOG_CHANNEL_ID = "1414298902768779264";
const BAN_LOG_CHANNEL = "1414298902768779264";
const INVITE_LOG_CHANNEL = "1414298902768779264";
const WELCOME_CHANNEL_ID = "1406405817527435377";
const APPLICATION_LOG_CHANNEL = "1490870793599717426";
const REVIEW_CHANNEL_ID = "1490592890706198551";
const MIN_ACCOUNT_AGE_DAYS = 7;

// ===== ROLES =====
const MOD_ROLE_ID = [
  "1490205790450221138",
  "1449843929141739640",
  "1449851163167031558"
];
const DESIGNER_ROLE_ID = "1490110273267306496";
const REVIEWER_ROLE_ID = "1490110273267306496";
const STATUS_UPDATE_ROLE_ID = "1490110273267306496";

// ===== TICKET SYSTEM =====
const TICKET_PANEL_CHANNEL = "1449841354325889044";
const ORDER_TICKET_CATEGORY = "1490466043087556861";
const SUPPORT_TICKET_CATEGORY = "1490459151942418515";
const REFUND_TICKET_CATEGORY = "1456351478301327465";
const TICKET_SUPPORT_ROLE = "1490110273267306496";
const TICKET_SUPPORT_ROLE_2 = "1406384903591039017";
const TICKET_TRANSCRIPT_CHANNEL = "1490871983481553016";

// ===== PROMOTE / DEMOTE LOG CHANNELS =====
const PROMOTION_CHANNEL = FULL_LOG_CHANNEL_ID;
const DEMOTION_CHANNEL = FULL_LOG_CHANNEL_ID;

// ===== RAID PREVENTION =====
const RAID_JOIN_THRESHOLD = 5;
const RAID_TIME_WINDOW = 10000;
const AUTO_LOCKDOWN = true;

// ===== ANTI NUKE =====
const NUKER_THRESHOLD = 3;
const NUKER_TIME_WINDOW = 10000;
const AUTO_BAN_NUKERS = true;
const AUTO_LOCKDOWN_ON_NUKE = true;

// ===== DATABASES =====
const LOG_DB = "./playerlogs.json";
const STRIKE_DB = "./strikes.json";
const LEVEL_DB = "./levels.json";
const INVITE_DB = "./invites.json";
const STATUS_DB = "./statuses.json";

let strikeData = fs.existsSync(STRIKE_DB) ? JSON.parse(fs.readFileSync(STRIKE_DB)) : {};
let levelData = fs.existsSync(LEVEL_DB) ? JSON.parse(fs.readFileSync(LEVEL_DB)) : {};
let inviteData = fs.existsSync(INVITE_DB) ? JSON.parse(fs.readFileSync(INVITE_DB)) : {};
let playerLogs = fs.existsSync(LOG_DB) ? JSON.parse(fs.readFileSync(LOG_DB)) : {};
let statusData = fs.existsSync(STATUS_DB) ? JSON.parse(fs.readFileSync(STATUS_DB)) : {};

function saveStrikes() { fs.writeFileSync(STRIKE_DB, JSON.stringify(strikeData, null, 2)); }
function saveLevels() { fs.writeFileSync(LEVEL_DB, JSON.stringify(levelData, null, 2)); }
function saveInvites() { fs.writeFileSync(INVITE_DB, JSON.stringify(inviteData, null, 2)); }
function saveLogs() { fs.writeFileSync(LOG_DB, JSON.stringify(playerLogs, null, 2)); }
function saveStatuses() { fs.writeFileSync(STATUS_DB, JSON.stringify(statusData, null, 2)); }

function addLog(userId, type, moderator, reason) {
  if (!playerLogs[userId]) playerLogs[userId] = [];
  playerLogs[userId].push({ type, moderator, reason, date: new Date().toLocaleString() });
  saveLogs();
}

// ===== APPLICATION SESSION TRACKING =====
const applicationSessions = new Map();
const APPLICATION_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const applicationCooldowns = new Map();
const APPLICATION_TIMEOUT_MS = 45 * 60 * 1000;

function clearApplicationSession(userId, sendTimeoutMessage = false) {
  const session = applicationSessions.get(userId);
  if (!session) return;
  if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
  applicationSessions.delete(userId);
  if (sendTimeoutMessage) {
    client.users.fetch(userId).then(user => {
      user.send("Your application has been timed out because you took too long. If you wish to submit another you are free to do so.").catch(() => {});
    }).catch(() => {});
  }
}

function scheduleApplicationTimeout(userId) {
  const session = applicationSessions.get(userId);
  if (!session) return;
  if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
  session.timeoutTimer = setTimeout(() => {
    clearApplicationSession(userId, true);
  }, APPLICATION_TIMEOUT_MS);
  applicationSessions.set(userId, session);
}

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ===== RAID / NUKE TRACKING =====
let recentJoins = [];
let antiNukeTracker = new Map();
let raidMode = false;
let inviteCache = new Map();

// ===== READY =====
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "Powering Dino Designs", type: 3 }],
    status: "online"
  });

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  const invites = await guild.invites.fetch().catch(() => null);
  if (invites) inviteCache.set(guild.id, invites);

  const panelChannel = await guild.channels.fetch(TICKET_PANEL_CHANNEL).catch(() => null);
  if (!panelChannel) return;

  const ticketEmbed = new EmbedBuilder()
    .setColor("#2A5CFF")
    .setTitle("🎫 Support Center")
    .setDescription(
      "> Welcome to the Support Center! Select a ticket type below to get started.\n" +
      "> Please provide as much detail as possible when opening a ticket.\n\n" +
      "📦 **Order**\n" +
      "> • Questions about your order\n" +
      "> • Order status inquiries\n" +
      "> • Order issues\n\n" +
      "💬 **Support**\n" +
      "> • General inquiries\n" +
      "> • General concerns\n" +
      "> • Member/Staff reports\n\n" +
      "💸 **Refund**\n" +
      "> • Refund requests\n" +
      "> • Payment disputes\n" +
      "> • Billing issues\n\n" +
      "**⚠️ Important**\n" +
      "> • Do not spam tickets\n" +
      "> • Provide detailed information\n" +
      "> • Be patient while waiting"
    )
    .setFooter({ text: "Support System • Open a ticket below" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Select a ticket type...")
      .addOptions([
        { label: "Order", description: "Questions, issues, or status updates about your order", value: "order_ticket" },
        { label: "Support", description: "General inquiries, concerns, or member reports", value: "support_ticket" },
        { label: "Refund", description: "Refund requests, payment disputes, or billing issues", value: "refund_ticket" }
      ])
  );

  const messages = await panelChannel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id);
  if (!existing) await panelChannel.send({ embeds: [ticketEmbed], components: [row] });
});

// ===== ANTI-NUKE FUNCTIONS =====
async function punishNuker(guild, userId, reason) {
  if (!userId) return;
  if (userId === client.user.id) return;
  if (userId === guild.ownerId) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && AUTO_BAN_NUKERS) await member.ban({ reason: `Anti-Nuke: ${reason}` }).catch(() => {});
    const logChannel = guild.channels.cache.get(FULL_LOG_CHANNEL_ID);
    logChannel?.send(`🚨 **Anti-Nuke triggered** on <@${userId}> — ${reason}`);
    if (AUTO_LOCKDOWN_ON_NUKE) {
      guild.channels.cache.forEach(ch => {
        if (ch.type === ChannelType.GuildText)
          ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
      });
    }
  } catch (err) {
    console.error("Anti-nuke error:", err);
  }
}

function trackNukeAction(guild, userId, reason) {
  if (!userId) return;
  const now = Date.now();
  if (!antiNukeTracker.has(userId)) {
    antiNukeTracker.set(userId, { count: 1, first: now });
    return;
  }
  const data = antiNukeTracker.get(userId);
  if (now - data.first > NUKER_TIME_WINDOW) { data.count = 1; data.first = now; return; }
  data.count++;
  if (data.count >= NUKER_THRESHOLD) {
    punishNuker(guild, userId, reason);
    antiNukeTracker.delete(userId);
    return;
  }
  antiNukeTracker.set(userId, data);
}

// ===== GUILD MEMBER ADD =====
client.on("guildMemberAdd", async member => {
  if (raidMode) {
    await member.kick("Server is in raid lockdown.").catch(() => {});
    await member.send("The server is currently under raid lockdown. Please try again later.").catch(() => {});
    return;
  }

  recentJoins.push(Date.now());
  recentJoins = recentJoins.filter(t => Date.now() - t < RAID_TIME_WINDOW);

  if (recentJoins.length >= RAID_JOIN_THRESHOLD && !raidMode) {
    raidMode = true;
    const logChannel = member.guild.channels.cache.get(FULL_LOG_CHANNEL_ID);
    logChannel?.send("🚨 **RAID DETECTED — LOCKDOWN INITIATED**");
    const invites = await member.guild.invites.fetch().catch(() => []);
    for (const inv of invites.values()) await inv.delete().catch(() => {});
    if (AUTO_LOCKDOWN) {
      member.guild.channels.cache.forEach(ch => {
        if (ch.type === ChannelType.GuildText)
          ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      });
    }
    const recentMembers = member.guild.members.cache
      .filter(m => Date.now() - m.joinedTimestamp < RAID_TIME_WINDOW).values();
    for (const raider of recentMembers) await raider.ban({ reason: "Raid detection - auto ban" }).catch(() => {});
    setTimeout(() => {
      raidMode = false;
      member.guild.channels.cache.forEach(ch => {
        if (ch.type === ChannelType.GuildText)
          ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: true }).catch(() => {});
      });
      logChannel?.send("✅ Raid mode disabled. Server unlocked.");
    }, 10 * 60 * 1000);
  }

  const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAge < MIN_ACCOUNT_AGE_DAYS) {
    await member.kick("Account too new (alt detection)").catch(() => {});
    member.guild.channels.cache.get(FULL_LOG_CHANNEL_ID)
      ?.send(`🚫 Kicked new account: ${member.user.tag} (${accountAge.toFixed(1)} days old)`);
    return;
  }

  await member.roles.add(UNVERIFIED_ROLE).catch(err => console.error("Failed to add unverified role:", err));

  if (member.user.bot) {
    const logChannel = member.guild.channels.cache.get(FULL_LOG_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setTitle("🤖 Bot Joined")
      .setDescription(`Bot: ${member}\nTag: ${member.user.tag}\n\nApprove or deny this bot.`)
      .setColor("#ff9900").setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bot_deny_${member.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`bot_confirm_${member.id}`).setLabel("Confirm").setStyle(ButtonStyle.Success)
    );
    logChannel?.send({ embeds: [embed], components: [row] });
    return;
  }

  const newInvites = await member.guild.invites.fetch().catch(() => null);
  if (newInvites) {
    const oldInvites = inviteCache.get(member.guild.id);
    const usedInvite = newInvites.find(inv => oldInvites?.get(inv.code)?.uses < inv.uses);
    if (usedInvite?.inviter) {
      const inviterId = usedInvite.inviter.id;
      if (!inviteData[inviterId]) inviteData[inviterId] = { invites: 0, users: [] };
      inviteData[inviterId].invites += 1;
      inviteData[inviterId].users.push(member.id);
      saveInvites();
      member.guild.channels.cache.get(INVITE_LOG_CHANNEL)?.send(`📈 ${usedInvite.inviter.tag} invited ${member.user.tag}`);
    }
    inviteCache.set(member.guild.id, newInvites);
  }

  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) welcomeChannel.send(`Welcome ${member} to the server! We now have **${member.guild.memberCount}** members.`);
});

// ===== GUILD MEMBER REMOVE =====
client.on("guildMemberRemove", async member => {
  for (const inviterId in inviteData) {
    const data = inviteData[inviterId];
    if (data.users?.includes(member.id)) {
      data.users = data.users.filter(id => id !== member.id);
      data.invites = Math.max(0, data.invites - 1);
      saveInvites();
      member.guild.channels.cache.get(INVITE_LOG_CHANNEL)?.send(`📉 Invite removed from <@${inviterId}> (user left)`);
      break;
    }
  }
  const logs = await member.guild.fetchAuditLogs({ type: 20, limit: 1 }).catch(() => null);
  if (!logs) return;
  const entry = logs.entries.first();
  if (!entry || entry.target?.id !== member.id) return;
  if (entry.executor?.id) trackNukeAction(member.guild, entry.executor.id, "Mass Kick Activity");
});

// ===== MESSAGE CREATE — DMs (Application System) =====
client.on("messageCreate", async message => {
  if (message.guild) return;
  if (message.author.bot) return;

  const userId = message.author.id;
  const session = applicationSessions.get(userId);
  const content = message.content.trim();
  const contentLower = content.toLowerCase();

  if (session && contentLower === "cancel") {
    clearApplicationSession(userId, false);
    await message.author.send("Your application has been cancelled! Feel free to apply again whenever.").catch(() => {});
    return;
  }

  if (!session && contentLower === "apply") {
    const cooldown = applicationCooldowns.get(userId);
    if (cooldown) {
      const elapsed = Date.now() - cooldown.deniedAt;
      const remaining = APPLICATION_COOLDOWN_MS - elapsed;
      if (remaining > 0) {
        const hoursLeft = Math.ceil(remaining / (1000 * 60 * 60));
        await message.author.send(`Sorry, due to your recent application denial you are unable to apply again. You have **${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}** left until you are able to apply again.`).catch(() => {});
        return;
      } else {
        applicationCooldowns.delete(userId);
      }
    }
    applicationSessions.set(userId, { state: "instructions", answers: [], timeoutTimer: null });
    scheduleApplicationTimeout(userId);
    const instructionsEmbed = new EmbedBuilder()
      .setTitle("Designer Application")
      .setDescription(
        "Thank you for applying to become a designer! Please follow these instructions so you can submit and finish the application.\n\n" +
        "When you finish reading this please say **ready** to start the application.\n\n" +
        "Once done those questions say **done** and then follow the instructions that you are given. If you feel like canceling at any point please just say **cancel**. Good luck!"
      ).setColor("#2A5CFF").setTimestamp();
    await message.author.send({ embeds: [instructionsEmbed] }).catch(() => {});
    return;
  }

  if (session && session.state === "instructions" && contentLower === "ready") {
    session.state = "awaiting_answers";
    session.answers = [];
    applicationSessions.set(userId, session);
    scheduleApplicationTimeout(userId);
    const questionsEmbed = new EmbedBuilder()
      .setTitle("Designer Application")
      .setDescription(
        "Thank you for taking your time to apply for our designer application! Please answer the following questions in this personal message and they will be forwarded to our applications team. Without further ado lets begin.\n\n" +
        "**Q1 -** What is your Roblox Username?\n**Q2 -** What do you focus on? (GFX, Clothing, etc)\n**Q3 -** How old are you?\n**Q4 -** What design tools do you use?\n**Q5 -** Do you have any previous experience designing for Roblox groups or communities? If yes, explain.\n**Q6 -** How would you handle a request from a client that you disagree with or find difficult?\n**Q7 -** How do you ensure your designs are high quality and meet requirements?\n**Q8 -** Are you able to meet deadlines and work under pressure? Explain your approach.\n**Q9 -** How do you handle feedback or criticism on your designs?\n**Q10 -** Is there anything else we should know about you or your design experience?\n\n" +
        "***Once you are finished answering these questions please say **\"done\"** and we will continue with the application.***"
      ).setColor("#2A5CFF").setTimestamp();
    await message.author.send({ embeds: [questionsEmbed] }).catch(() => {});
    return;
  }

  if (session && session.state === "awaiting_answers" && contentLower !== "done") {
    session.answers.push(content);
    applicationSessions.set(userId, session);
    scheduleApplicationTimeout(userId);
    return;
  }

  if (session && session.state === "awaiting_answers" && contentLower === "done") {
    session.state = "awaiting_images";
    applicationSessions.set(userId, session);
    scheduleApplicationTimeout(userId);
    await message.author.send({ embeds: [new EmbedBuilder().setTitle("Almost there!").setDescription("Please finish by providing images of your previous work.").setColor("#2A5CFF").setTimestamp()] }).catch(() => {});
    return;
  }

  if (session && session.state === "awaiting_images") {
    if (message.attachments.size === 0) {
      await message.author.send("Please send at least one image to complete your application.").catch(() => {});
      return;
    }
    clearApplicationSession(userId, false);
    await message.author.send("Thank you for providing those images — your application will now be forwarded to the applications team where they will review and discuss your application.").catch(() => {});
    const appChannel = client.channels.cache.get(APPLICATION_LOG_CHANNEL);
    if (appChannel) {
      const answersText = session.answers.length > 0 ? session.answers.map((a, i) => `**Q${i + 1}:** ${a}`).join("\n") : "No answers recorded.";
      const appEmbed = new EmbedBuilder()
        .setTitle(`Designer Application — ${message.author.tag}`)
        .setDescription(answersText).setColor("#2A5CFF")
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: `User ID: ${message.author.id}` }).setTimestamp();
      const approveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appv2_deny_${message.author.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`appv2_approve_${message.author.id}`).setLabel("Approve").setStyle(ButtonStyle.Success)
      );
      await appChannel.send({ embeds: [appEmbed], components: [approveRow] });
      await appChannel.send(`**Designer Application — ${message.author.tag}**\n${message.attachments.map(a => a.url).join("\n")}`);
    }
    return;
  }
});

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('verify').setDescription('Verify yourself'),
  new SlashCommandBuilder().setName('ban').setDescription('Permanently ban a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('tban').setDescription('Temporarily ban a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('logs').setDescription('View moderation logs for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('clearlogs').setDescription('Clear all logs for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('promote').setDescription('Promote a staff member')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('demote').setDescription('Demote a staff member')
    .addUserOption(o => o.setName('user').setDescription('User to demote').setRequired(true))
    .addRoleOption(o => o.setName('demoted_to').setDescription('Role they are being demoted to').setRequired(true))
    .addRoleOption(o => o.setName('remove_role').setDescription('Role being removed').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true)),
  new SlashCommandBuilder().setName('strike').setDescription('Strike a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('strikes').setDescription('Check strikes for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('clearstrikes').setDescription('Clear all strikes for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode in current channel')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 to disable)').setRequired(true)),
  new SlashCommandBuilder().setName('lockdown').setDescription('Lock the entire server'),
  new SlashCommandBuilder().setName('unlockdown').setDescription('Unlock the server'),
  new SlashCommandBuilder().setName('mylevel').setDescription('Check your current level'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the XP leaderboard'),
  new SlashCommandBuilder().setName('setlevel').setDescription("Set a user's level (Mods only)")
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('Level (1-50)').setRequired(true).setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder().setName('myinvites').setDescription('Check how many users you have invited'),
  new SlashCommandBuilder().setName('recruitleaderboard').setDescription('View the recruitment leaderboard'),
  new SlashCommandBuilder().setName('claim').setDescription('Claim a ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close a ticket')
    .addStringOption(o => o.setName('reason').setDescription('Reason for closing').setRequired(true)),
  new SlashCommandBuilder().setName('closereq').setDescription('Ask the user if they want to close the ticket'),

  // ===== REVIEW =====
  new SlashCommandBuilder().setName('review').setDescription('Submit a product review')
    .addStringOption(o => o.setName('product').setDescription('Name of the product').setRequired(true))
    .addStringOption(o => o.setName('designer').setDescription('Name of the designer').setRequired(true))
    .addStringOption(o => o.setName('rating').setDescription('Star rating').setRequired(true)
      .addChoices(
        { name: '⭐', value: '⭐' },
        { name: '⭐⭐', value: '⭐⭐' },
        { name: '⭐⭐⭐', value: '⭐⭐⭐' },
        { name: '⭐⭐⭐⭐', value: '⭐⭐⭐⭐' },
        { name: '⭐⭐⭐⭐⭐', value: '⭐⭐⭐⭐⭐' }
      ))
    .addAttachmentOption(o => o.setName('image').setDescription('Image of the product (optional)').setRequired(false)),

  // ===== STATUS =====
  new SlashCommandBuilder().setName('status').setDescription('Check the status of your order'),
  new SlashCommandBuilder().setName('statusupdate').setDescription('Update the order status for a user')
    .addUserOption(o => o.setName('user').setDescription('User whose status to update').setRequired(true))
    .addStringOption(o => o.setName('status').setDescription('New status').setRequired(true)
      .addChoices(
        { name: '🟡 Pending', value: 'pending' },
        { name: '🔵 In Progress', value: 'inprogress' },
        { name: '✅ Completed', value: 'completed' }
      ))
];

// ===== INTERACTION HANDLER =====
client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {

    // VERIFY
    if (interaction.commandName === "verify") {
      if (interaction.channelId !== VERIFY_CHANNEL_ID)
        return interaction.reply({ content: "❌ Please use the verify channel.", flags: 64 });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.has(UNVERIFIED_ROLE))
        return interaction.reply({ content: "❌ You are already verified.", flags: 64 });
      await member.roles.remove(UNVERIFIED_ROLE);
      for (const role of VERIFIED_ROLES) await member.roles.add(role);
      return interaction.reply({ content: "✅ You have been verified!", flags: 64 });
    }

    // BAN
    if (interaction.commandName === "ban") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ User not found in server.", flags: 64 });
      addLog(user.id, "Permanent Ban", interaction.user.tag, reason);
      await member.ban({ reason });
      const embed = new EmbedBuilder().setTitle("🔨 User Banned")
        .addFields({ name: "User", value: user.tag, inline: true }, { name: "Moderator", value: interaction.user.tag, inline: true }, { name: "Reason", value: reason })
        .setColor("#ff0000").setTimestamp();
      interaction.guild.channels.cache.get(BAN_LOG_CHANNEL)?.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ ${user.tag} has been permanently banned.` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    }

    // TEMP BAN
    if (interaction.commandName === "tban") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const hours = interaction.options.getInteger("hours");
      const reason = interaction.options.getString("reason");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ User not found.", flags: 64 });
      await member.ban({ reason: `${reason} (${hours}h temp ban)` });
      addLog(user.id, "Temp Ban", interaction.user.tag, `${reason} (${hours}h)`);
      setTimeout(async () => { await interaction.guild.members.unban(user.id).catch(() => {}); }, hours * 60 * 60 * 1000);
      await interaction.reply({ content: `✅ ${user.tag} banned for ${hours} hour(s).` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    }

    // WARN
    if (interaction.commandName === "warn") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      addLog(user.id, "Warning", interaction.user.tag, reason);
      await user.send(`⚠️ You have been warned in **${interaction.guild.name}** for: ${reason}`).catch(() => {});
      await interaction.reply({ content: `⚠️ ${user.tag} has been warned.` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    }

    // LOGS
    if (interaction.commandName === "logs") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const logs = playerLogs[user.id];
      if (!logs || logs.length === 0) return interaction.reply({ content: `No logs found for ${user.tag}.`, flags: 64 });
      const formatted = logs.map(l => `• [${l.date}] **${l.type}** | By: ${l.moderator} | ${l.reason}`).join("\n");
      return interaction.reply({ content: `📋 **Logs for ${user.tag}:**\n\n${formatted}`, flags: 64 });
    }

    // CLEAR LOGS
    if (interaction.commandName === "clearlogs") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      playerLogs[user.id] = [];
      saveLogs();
      await interaction.reply({ content: `🧹 Logs cleared for ${user.tag}.` });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    }

    // PROMOTE
    if (interaction.commandName === "promote") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const reason = interaction.options.getString("reason");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ User not found.", flags: 64 });
      await member.roles.add(role).catch(() => {});
      addLog(member.id, "Promotion", interaction.user.tag, reason);
      const embed = new EmbedBuilder().setTitle("🎉 Staff Promotion").setDescription(`Congratulations! ${member} has been promoted.`)
        .addFields({ name: "Staff Member", value: `${member}`, inline: true }, { name: "New Rank", value: `${role}`, inline: true }, { name: "Reason", value: reason })
        .setColor("#f1c40f").setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Promoted by ${interaction.user.tag}` }).setTimestamp();
      interaction.guild.channels.cache.get(PROMOTION_CHANNEL)?.send({ content: `${member}`, embeds: [embed] });
      return interaction.reply({ content: "✅ Promotion sent.", flags: 64 });
    }

    // DEMOTE
    if (interaction.commandName === "demote") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const member = interaction.options.getMember("user");
      const demotedRole = interaction.options.getRole("demoted_to");
      const removeRole = interaction.options.getRole("remove_role");
      const reason = interaction.options.getString("reason");
      await member.roles.remove(removeRole).catch(() => {});
      await member.roles.add(demotedRole).catch(() => {});
      addLog(member.id, "Demotion", interaction.user.tag, reason);
      const embed = new EmbedBuilder().setTitle("📉 Staff Demotion").setDescription(`${member} has been demoted.`)
        .addFields({ name: "Staff Member", value: `${member}`, inline: true }, { name: "New Role", value: `${demotedRole}`, inline: true }, { name: "Reason", value: reason })
        .setColor("#2b2d31").setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Demoted by ${interaction.user.tag}` }).setTimestamp();
      interaction.guild.channels.cache.get(DEMOTION_CHANNEL)?.send({ content: `${member}`, embeds: [embed] });
      return interaction.reply({ content: "✅ Demotion sent.", flags: 64 });
    }

    // MUTE
    if (interaction.commandName === "mute") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const member = interaction.options.getMember("user");
      const minutes = interaction.options.getInteger("minutes");
      await member.timeout(minutes * 60 * 1000);
      addLog(member.id, "Mute", interaction.user.tag, `${minutes} minute timeout`);
      return interaction.reply({ content: `🔇 ${member.user.tag} muted for ${minutes} minute(s).` });
    }

    // STRIKE
    if (interaction.commandName === "strike") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!strikeData[user.id]) strikeData[user.id] = 0;
      strikeData[user.id]++;
      saveStrikes();
      const strikes = strikeData[user.id];
      addLog(user.id, `Strike ${strikes}`, interaction.user.tag, reason);
      const embed = new EmbedBuilder().setTitle("⚠️ Strike Issued")
        .addFields({ name: "User", value: `${user}`, inline: true }, { name: "Strike Count", value: `${strikes}`, inline: true }, { name: "Reason", value: reason })
        .setColor("#ff9900").setThumbnail(user.displayAvatarURL()).setFooter({ text: `Issued by ${interaction.user.tag}` }).setTimestamp();
      interaction.guild.channels.cache.get(DEMOTION_CHANNEL)?.send({ content: `${user}`, embeds: [embed] });
      await interaction.reply({ content: `✅ Strike ${strikes} issued to ${user.tag}.`, flags: 64 });
      if (strikes >= 5 && member) {
        await member.ban({ reason: "5 Strikes - Auto 48h Ban" }).catch(() => {});
        setTimeout(() => interaction.guild.members.unban(user.id).catch(() => {}), 48 * 60 * 60 * 1000);
      }
    }

    // CHECK STRIKES
    if (interaction.commandName === "strikes") {
      const user = interaction.options.getUser("user");
      return interaction.reply({ content: `⚠️ ${user.tag} has **${strikeData[user.id] || 0}** strike(s).`, flags: 64 });
    }

    // CLEAR STRIKES
    if (interaction.commandName === "clearstrikes") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      strikeData[user.id] = 0;
      saveStrikes();
      return interaction.reply({ content: `✅ Cleared all strikes for ${user.tag}.`, flags: 64 });
    }

    // SLOWMODE
    if (interaction.commandName === "slowmode") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const seconds = interaction.options.getInteger("seconds");
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({ content: `🐌 Slowmode set to ${seconds} second(s).` });
    }

    // LOCKDOWN
    if (interaction.commandName === "lockdown") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      interaction.guild.channels.cache.forEach(ch => {
        if (ch.type === ChannelType.GuildText) ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      });
      return interaction.reply("🔒 Server lockdown **enabled**.");
    }

    // UNLOCKDOWN
    if (interaction.commandName === "unlockdown") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      interaction.guild.channels.cache.forEach(ch => {
        if (ch.type === ChannelType.GuildText) ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: true }).catch(() => {});
      });
      return interaction.reply("🔓 Server lockdown **removed**.");
    }

    // MY LEVEL
    if (interaction.commandName === "mylevel") {
      const data = levelData[interaction.user.id];
      if (!data) return interaction.reply({ content: "You have no XP yet. Start chatting!", flags: 64 });
      const lvl = data.level;
      const req = lvl <= 10 ? 450 : lvl <= 20 ? 800 : lvl <= 30 ? 960 : lvl <= 40 ? 1200 : 1500;
      return interaction.reply({ content: `📊 **Level:** ${data.level}\n**XP:** ${data.xp}/${req}`, flags: 64 });
    }

    // LEADERBOARD
    if (interaction.commandName === "leaderboard") {
      const sorted = Object.entries(levelData).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp).slice(0, 10);
      if (sorted.length === 0) return interaction.reply("No data yet.");
      const list = sorted.map((u, i) => { const m = interaction.guild.members.cache.get(u[0]); return `${i + 1}. ${m ? m.user.tag : "Unknown"} — Level ${u[1].level}`; }).join("\n");
      return interaction.reply({ content: `🏆 **XP Leaderboard**\n\n${list}` });
    }

    // SET LEVEL
    if (interaction.commandName === "setlevel") {
      if (!interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id)))
        return interaction.reply({ content: "❌ No permission.", flags: 64 });
      const user = interaction.options.getUser("user");
      const newLevel = interaction.options.getInteger("level");
      if (!levelData[user.id]) levelData[user.id] = { xp: 0, level: 1 };
      levelData[user.id].level = newLevel;
      levelData[user.id].xp = 0;
      saveLevels();
      return interaction.reply({ content: `✅ Set ${user.tag}'s level to **${newLevel}**.`, flags: 64 });
    }

    // MY INVITES
    if (interaction.commandName === "myinvites") {
      const data = inviteData[interaction.user.id];
      return interaction.reply({ content: `📊 You have invited **${data?.invites || 0}** member(s).`, flags: 64 });
    }

    // RECRUIT LEADERBOARD
    if (interaction.commandName === "recruitleaderboard") {
      const sorted = Object.entries(inviteData).sort((a, b) => b[1].invites - a[1].invites).slice(0, 10);
      if (sorted.length === 0) return interaction.reply("No recruitment data yet.");
      const list = sorted.map((u, i) => { const m = interaction.guild.members.cache.get(u[0]); return `${i + 1}. ${m ? m.user.tag : "Unknown"} — ${u[1].invites} invite(s)`; }).join("\n");
      return interaction.reply({ content: `📈 **Recruitment Leaderboard**\n\n${list}` });
    }

    // CLAIM
    if (interaction.commandName === "claim") {
      if (!interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE) && !interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE_2))
        return interaction.reply({ content: "❌ Only ticket staff can use this.", flags: 64 });
      await interaction.channel.setName(interaction.channel.name.replace("🔴-", "🟢-")).catch(() => {});
      const embed = new EmbedBuilder().setTitle("Ticket Claimed").setDescription(`${interaction.user} has claimed this ticket.`).setColor("#2A5CFF").setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    // CLOSE
    if (interaction.commandName === "close") {
      if (!interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE) && !interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE_2))
        return interaction.reply({ content: "❌ Only ticket staff can use this.", flags: 64 });
      const reason = interaction.options.getString("reason");
      await closeTicket(interaction.channel, interaction.user, reason, interaction);
    }

    // CLOSEREQ
    if (interaction.commandName === "closereq") {
      if (!interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE) && !interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE_2))
        return interaction.reply({ content: "❌ Only ticket staff can use this.", flags: 64 });
      const embed = new EmbedBuilder().setTitle("Close Request").setDescription("The support team is requesting to close this ticket. Do you want to close it?").setColor("#2A5CFF").setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`closereq_yes_${interaction.user.id}`).setLabel("Yes, close it").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`closereq_no_${interaction.user.id}`).setLabel("No, keep it open").setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ===== REVIEW =====
    if (interaction.commandName === "review") {
      if (!interaction.member.roles.cache.has(REVIEWER_ROLE_ID))
        return interaction.reply({ content: "❌ You do not have permission to submit reviews.", flags: 64 });

      const product = interaction.options.getString("product");
      const designer = interaction.options.getString("designer");
      const rating = interaction.options.getString("rating");
      const image = interaction.options.getAttachment("image");

      const reviewEmbed = new EmbedBuilder()
        .setTitle(`New Review by ${interaction.user.username}`)
        .setDescription(`**${product}**\nDesigner: ${designer}`)
        .addFields({ name: "Rating", value: rating })
        .setColor("#2A5CFF")
        .setFooter({ text: `Reviewed by ${interaction.user.tag}` })
        .setTimestamp();

      if (image) reviewEmbed.setThumbnail(image.url);

      const reviewChannel = interaction.guild.channels.cache.get(REVIEW_CHANNEL_ID);
      if (!reviewChannel) return interaction.reply({ content: "❌ Review channel not found.", flags: 64 });
      await reviewChannel.send({ embeds: [reviewEmbed] });
      return interaction.reply({ content: "✅ Your review has been submitted!", flags: 64 });
    }

    // ===== STATUS =====
    if (interaction.commandName === "status") {
      const entry = statusData[interaction.user.id];
      if (!entry) return interaction.reply({ content: "You don't have an order status set yet. Please open a ticket if you have an active order.", flags: 64 });

      const statusMap = { pending: "🟡 Pending", inprogress: "🔵 In Progress", completed: "✅ Completed" };
      const embed = new EmbedBuilder()
        .setTitle("Order Status")
        .addFields({ name: "Status", value: statusMap[entry.status] || "Unknown" }, { name: "Last Updated", value: entry.updatedAt })
        .setColor("#2A5CFF").setTimestamp();
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ===== STATUS UPDATE =====
    if (interaction.commandName === "statusupdate") {
      if (!interaction.member.roles.cache.has(STATUS_UPDATE_ROLE_ID))
        return interaction.reply({ content: "❌ You do not have permission to update statuses.", flags: 64 });

      const targetUser = interaction.options.getUser("user");
      const newStatus = interaction.options.getString("status");
      const statusMap = { pending: "🟡 Pending", inprogress: "🔵 In Progress", completed: "✅ Completed" };

      statusData[targetUser.id] = { status: newStatus, updatedAt: new Date().toLocaleString() };
      saveStatuses();

      await targetUser.send(`📦 Your order status has been updated!\n\n**Status:** ${statusMap[newStatus]}\n\nUse **/status** in the server to check it at any time.`).catch(() => {});
      return interaction.reply({ content: `✅ Updated ${targetUser.tag}'s status to **${statusMap[newStatus]}**.`, flags: 64 });
    }

    return;
  }

  // ===== BUTTONS & SELECT MENUS =====
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  // APPLICATION APPROVE/DENY
  if (interaction.isButton() && interaction.customId.startsWith("appv2_")) {
    const isMod = interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id));
    if (!isMod) return interaction.reply({ content: "❌ No permission.", flags: 64 });
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const userId = parts[2];
    const targetUser = await client.users.fetch(userId).catch(() => null);
    if (action === "approve") {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.roles.add(DESIGNER_ROLE_ID).catch(() => {});
        await targetUser?.send("Congratulations on passing the Designer Application! Welcome to our team and we can't wait for you to start. You can view all information in the staff channel and if you have any questions please ask a senior member of the team.").catch(() => {});
      }
      return interaction.update({ content: `✅ Approved by ${interaction.user.tag}`, components: [] });
    }
    if (action === "deny") {
      applicationCooldowns.set(userId, { deniedAt: Date.now() });
      await targetUser?.send("Unfortunately you have not been selected to join the Designer Team. You can re-apply in 48 hours if you would like.").catch(() => {});
      return interaction.update({ content: `❌ Denied by ${interaction.user.tag}`, components: [] });
    }
  }

  // BOT APPROVAL
  if (interaction.isButton() && interaction.customId.startsWith("bot_")) {
    const isMod = interaction.member.roles.cache.some(r => MOD_ROLE_ID.includes(r.id));
    if (!isMod) return interaction.reply({ content: "❌ Only moderators can use this.", flags: 64 });
    const parts = interaction.customId.split("_");
    const type = parts[1];
    const userId = parts[2];
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: "Bot not found.", flags: 64 });
    if (type === "deny") {
      await member.kick("Bot denied by moderator").catch(() => {});
      return interaction.update({ content: `❌ Bot **${member.user.tag}** denied and kicked by ${interaction.user.tag}`, embeds: [], components: [] });
    }
    if (type === "confirm") {
      return interaction.update({ content: `✅ Bot **${member.user.tag}** approved by ${interaction.user.tag}`, embeds: [], components: [] });
    }
  }

  // CLAIM TICKET (button)
  if (interaction.customId === "claim_ticket") {
    if (!interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE) && !interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE_2))
      return interaction.reply({ content: "❌ Only ticket staff can claim tickets.", flags: 64 });
    const claimEmbed = new EmbedBuilder().setTitle("Ticket Claimed").setDescription(`This ticket has been claimed by ${interaction.user}.`).setColor("#2A5CFF").setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("Close").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claimed").setStyle(ButtonStyle.Success).setDisabled(true)
    );
    await interaction.message.edit({ embeds: [claimEmbed], components: [row] });
    await interaction.channel.setName(`🟢-${interaction.channel.name.replace("🔴-", "")}`).catch(() => {});
    await interaction.deferUpdate();
  }

  // OPEN TICKET (select menu)
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
    const user = interaction.user;
    const guild = interaction.guild;
    const type = interaction.values[0];
    const cleanName = user.username.toLowerCase().replace(/[^a-z0-9]/g, "");

    let name, title, ticketDescription, category;

    if (type === "order_ticket") {
      name = `🔴-order-${cleanName}`; title = "Order";
      ticketDescription = "Thank you for opening a ticket! A staff member will be with you shortly. Please provide your order details while you wait.";
      category = ORDER_TICKET_CATEGORY;
    } else if (type === "support_ticket") {
      name = `🔴-support-${cleanName}`; title = "Support";
      ticketDescription = "Thank you for opening a ticket! A staff member will be with you shortly. Please explain your issue while you wait.";
      category = SUPPORT_TICKET_CATEGORY;
    } else if (type === "refund_ticket") {
      name = `🔴-refund-${cleanName}`; title = "Refund";
      ticketDescription = "Thank you for opening a ticket! A staff member will be with you shortly. Please provide your order details and reason for the refund request while you wait.";
      category = REFUND_TICKET_CATEGORY;
    } else { return; }

    const channel = await guild.channels.create({
      name, type: ChannelType.GuildText, parent: category,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: TICKET_SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: TICKET_SUPPORT_ROLE_2, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const embed = new EmbedBuilder().setTitle(title).setDescription(ticketDescription).setColor("#2A5CFF").setTimestamp();
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setLabel("Close").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim").setStyle(ButtonStyle.Success)
    );
    await channel.send(`<@&${TICKET_SUPPORT_ROLE}> <@&${TICKET_SUPPORT_ROLE_2}>`);
    await channel.send({ embeds: [embed], components: [buttons] });
    return interaction.reply({ content: `✅ Ticket created: ${channel}`, flags: 64 });
  }

  // CLOSE TICKET (button)
  if (interaction.customId === "close_ticket") {
    if (!interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE) && !interaction.member.roles.cache.has(TICKET_SUPPORT_ROLE_2))
      return interaction.reply({ content: "❌ Only ticket staff can close tickets.", flags: 64 });
    await closeTicket(interaction.channel, interaction.user, "Button close", interaction);
  }

  // CLOSE REQUEST BUTTONS
  if (interaction.isButton() && interaction.customId.startsWith("closereq_")) {
    const parts = interaction.customId.split("_");
    const answer = parts[1];
    const staffId = parts[2];
    if (answer === "yes") {
      await interaction.update({ components: [] });
      await interaction.channel.send(`<@${staffId}> ${interaction.user.username} has agreed to close the ticket. Please proceed.`);
    }
    if (answer === "no") {
      await interaction.update({ components: [] });
      await interaction.channel.send(`<@${staffId}> ${interaction.user.username} would like to keep the ticket open.`);
    }
  }
});

// ===== CLOSE TICKET HELPER =====
async function closeTicket(channel, closer, reason, interaction) {
  const channelName = channel.name;
  const fetched = await channel.messages.fetch({ limit: 100 });
  const transcript = fetched.reverse()
    .map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join("\n");

  let ticketType = "Ticket";
  if (channelName.includes("order")) ticketType = "Order";
  else if (channelName.includes("support")) ticketType = "Support";
  else if (channelName.includes("refund")) ticketType = "Refund";

  const opener = fetched.last()?.author ?? closer;
  const transcriptEmbed = new EmbedBuilder()
    .setTitle(`${ticketType} — ${opener.tag}`)
    .setDescription(`**Closed by:** ${closer}\n**Reason:** ${reason}\n\n**Transcript:**\n\`\`\`${transcript.slice(0, 3500) || "No messages."}\`\`\``)
    .setColor("#2A5CFF").setTimestamp();

  const transcriptChannel = channel.guild.channels.cache.get(TICKET_TRANSCRIPT_CHANNEL);
  if (transcriptChannel) await transcriptChannel.send({ embeds: [transcriptEmbed] });

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: "🗑️ Closing ticket...", flags: 64 }).catch(() => {});
  } else {
    await interaction.reply({ content: "🗑️ Closing ticket...", flags: 64 }).catch(() => {});
  }
  setTimeout(() => channel.delete().catch(() => {}), 2000);
}

// ===== REGISTER SLASH COMMANDS =====
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    console.log("🔄 Refreshing slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("✅ Slash commands registered.");
  } catch (error) {
    console.error("❌ Failed to register slash commands:", error.message);
  }
})();

// ===== ANTI NUKE EVENTS =====
client.on("channelDelete", async channel => {
  const guild = channel.guild; if (!guild) return;
  const logs = await guild.fetchAuditLogs({ type: 12, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  trackNukeAction(guild, entry.executor?.id, "Channel Deletion");
});
client.on("channelCreate", async channel => {
  const guild = channel.guild; if (!guild) return;
  const logs = await guild.fetchAuditLogs({ type: 10, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  trackNukeAction(guild, entry.executor?.id, "Mass Channel Creation");
});
client.on("guildBanAdd", async ban => {
  const guild = ban.guild;
  const logs = await guild.fetchAuditLogs({ type: 22, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  trackNukeAction(guild, entry.executor?.id, "Mass Ban Activity");
});
client.on("roleDelete", async role => {
  const guild = role.guild; if (!guild) return;
  const logs = await guild.fetchAuditLogs({ type: 32, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  trackNukeAction(guild, entry.executor?.id, "Role Deletion");
});
client.on("roleCreate", async role => {
  const guild = role.guild; if (!guild) return;
  const logs = await guild.fetchAuditLogs({ type: 30, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  trackNukeAction(guild, entry.executor?.id, "Mass Role Creation");
});
client.on("webhookUpdate", async channel => {
  const guild = channel.guild; if (!guild) return;
  const logs = await guild.fetchAuditLogs({ type: 50, limit: 1 }).catch(() => null); if (!logs) return;
  const entry = logs.entries.first(); if (!entry) return;
  const webhooks = await channel.fetchWebhooks().catch(() => null);
  if (webhooks) webhooks.forEach(wh => wh.delete("Anti-nuke: unauthorized webhook").catch(() => {}));
  trackNukeAction(guild, entry.executor?.id, "Webhook Creation");
});

client.login(TOKEN);
