/** First-party Discord.js starters. They are written into the customer's bot container, not run here. */
export const DISCORD_TEMPLATES: Record<string, { packageJson: string; index: string; note: string }> = {
  moderation: {
    note: 'Deletes messages that match a small word list and logs the reason.',
    packageJson: JSON.stringify({ name: 'moderation-bot', private: true, main: 'index.js', dependencies: { 'discord.js': '^14.16.3' } }, null, 2),
    index: `const { Client, GatewayIntentBits } = require('discord.js');

async function start() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const blocked = ['slur-placeholder'];
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (blocked.some((word) => message.content.toLowerCase().includes(word))) {
      await message.delete().catch(() => undefined);
    }
  });
  client.once('ready', () => console.log('moderation bot ready'));
  await client.login(process.env.DISCORD_TOKEN);
}

module.exports = { start };
if (require.main === module) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
`,
  },
  welcome: {
    note: 'Sends a welcome message when a member joins.',
    packageJson: JSON.stringify({ name: 'welcome-bot', private: true, main: 'index.js', dependencies: { 'discord.js': '^14.16.3' } }, null, 2),
    index: `const { Client, GatewayIntentBits } = require('discord.js');

async function start() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.systemChannel;
    if (channel) await channel.send('Welcome, ' + member.user.username).catch(() => undefined);
  });
  client.once('ready', () => console.log('welcome bot ready'));
  await client.login(process.env.DISCORD_TOKEN);
}

module.exports = { start };
if (require.main === module) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
`,
  },
  tickets: {
    note: 'Opens a private channel when someone uses /ticket.',
    packageJson: JSON.stringify({ name: 'ticket-bot', private: true, main: 'index.js', dependencies: { 'discord.js': '^14.16.3' } }, null, 2),
    index: `const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

function ticketChannelOptions(guild, user) {
  return {
    name: ('ticket-' + user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')).slice(0, 80) || 'ticket',
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ],
  };
}

async function start() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: [new SlashCommandBuilder().setName('ticket').setDescription('Open a private ticket').toJSON()] });
    console.log('ticket bot ready');
  });
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'ticket' || !interaction.guild) return;
    const channel = await interaction.guild.channels.create(ticketChannelOptions(interaction.guild, interaction.user));
    await interaction.reply({ content: 'Opened ' + channel.toString(), ephemeral: true });
  });
  await client.login(process.env.DISCORD_TOKEN);
}

module.exports = { start, ticketChannelOptions };
if (require.main === module) {
  start().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
`,
  },
};
