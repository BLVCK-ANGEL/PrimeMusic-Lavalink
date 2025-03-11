const { ApplicationCommandOptionType, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config.js');
const musicIcons = require('../UI/icons/musicicons.js');
const SpotifyWebApi = require('spotify-web-api-node');
const { getData } = require('spotify-url-info')(require('node-fetch'));
const requesters = new Map();

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotifyClientId, 
    clientSecret: config.spotifyClientSecret,
});

async function suggestTracks(client, interaction, query) {
    try {
        const resolve = await client.riffy.resolve({ query, requester: interaction.user.username });

        if (!resolve || !resolve.tracks || resolve.tracks.length === 0) {
            return null;  // No tracks found
        }

        const tracks = resolve.tracks.slice(0, 5); // Suggest up to 5 tracks
        const trackSuggestions = tracks.map((track, index) => {
            return {
                name: `${track.info.title} - ${track.info.author}`,
                trackUri: track.info.uri,
                button: new ButtonBuilder()
                    .setCustomId(`track_${index}`)
                    .setLabel(`${index + 1}. ${track.info.title}`)
                    .setStyle(ButtonStyle.Primary)
            };
        });

        return trackSuggestions;
    } catch (error) {
        console.error("Error suggesting tracks:", error);
        return null;
    }
}

async function play(client, interaction, lang) {
    try {
        const query = interaction.options.getString('name');

        if (!interaction.member.voice.channelId) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setAuthor({
                    name: lang.play.embed.error,
                    iconURL: musicIcons.alertIcon,
                    url: config.SupportServer
                })
                .setFooter({ text: 'Developed by Ryuu', iconURL: musicIcons.heartIcon })
                .setDescription(lang.play.embed.noVoiceChannel);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (!client.riffy.nodes || client.riffy.nodes.size === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setAuthor({
                    name: lang.play.embed.error,
                    iconURL: musicIcons.alertIcon,
                    url: config.SupportServer
                })
                .setFooter({ text: 'Developed by Ryuu', iconURL: musicIcons.heartIcon })
                .setDescription(lang.play.embed.noLavalinkNodes);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const player = client.riffy.createConnection({
            guildId: interaction.guildId,
            voiceChannel: interaction.member.voice.channelId,
            textChannel: interaction.channelId,
            deaf: true
        });

        await interaction.deferReply();

        let tracksToQueue = [];
        let isPlaylist = false;

        if (query.includes('spotify.com')) {
            try {
                const spotifyData = await getData(query);

                if (spotifyData.type === 'track') {
                    const trackName = `${spotifyData.name} - ${spotifyData.artists.map(a => a.name).join(', ')}`;
                    tracksToQueue.push(trackName);
                } else if (spotifyData.type === 'playlist') {
                    isPlaylist = true;
                    const playlistId = query.split('/playlist/')[1].split('?')[0]; 
                    tracksToQueue = await getSpotifyPlaylistTracks(playlistId);
                }
            } catch (err) {
                console.error('Error fetching Spotify data:', err);
                await interaction.followUp({ content: "❌ Failed to fetch Spotify data." });
                return;
            }
        } else {
            // Suggest tracks based on the search query
            const trackSuggestions = await suggestTracks(client, interaction, query);
            if (!trackSuggestions) {
                await interaction.followUp({ content: "❌ No tracks found for your query." });
                return;
            }

            // Create a row of buttons with the track suggestions
            const row = new ActionRowBuilder().addComponents(
                trackSuggestions.map(track => track.button)
            );

            // Send the track suggestions as buttons
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🎶 Track Suggestions')
                .setDescription('Please select a track by clicking on a button below.')
                .setFooter({ text: 'Developed by Ryuu', iconURL: musicIcons.heartIcon });

            const message = await interaction.followUp({ embeds: [embed], components: [row] });

            // Handle button interaction
            const filter = i => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({
                filter,
                time: 30000 // 30 seconds to select
            });

            collector.on('collect', async (buttonInteraction) => {
                const selectedTrackIndex = parseInt(buttonInteraction.customId.split('_')[1]);
                const selectedTrack = trackSuggestions[selectedTrackIndex];

                // Add the selected track to the queue
                const resolve = await client.riffy.resolve({ query: selectedTrack.trackUri, requester: interaction.user.username });
                if (resolve.tracks.length > 0) {
                    const trackInfo = resolve.tracks[0];
                    player.queue.add(trackInfo);
                    requesters.set(trackInfo.uri, interaction.user.username);
                }

                if (!player.playing && !player.paused) player.play();

                await buttonInteraction.update({
                    content: `You selected: ${selectedTrack.name}`,
                    embeds: [],
                    components: []
                });

                collector.stop();
            });

            collector.on('end', () => {
                message.edit({ components: [] }); // Disable buttons after the time expires
            });
        }
    } catch (error) {
        console.error('Error processing play command:', error);
        await interaction.followUp({ content: "❌ An error occurred while processing the request." });
    }
}

module.exports = {
    name: "play",
    description: "Play a song from a name or link",
    permissions: "0x0000000000000800",
    options: [{
        name: 'name',
        description: 'Enter song name / link or playlist',
        type: ApplicationCommandOptionType.String,
        required: true
    }],
    run: play,
    requesters: requesters,
};
