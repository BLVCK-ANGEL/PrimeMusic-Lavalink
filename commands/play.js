const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const musicIcons = require('../UI/icons/musicicons.js');
const SpotifyWebApi = require('spotify-web-api-node');
const { getData } = require('spotify-url-info')(require('node-fetch'));
const requesters = new Map();

const spotifyApi = new SpotifyWebApi({
    clientId: config.spotifyClientId,
    clientSecret: config.spotifyClientSecret,
});

// Fetch an access token once and reuse it
let accessToken = null;

async function fetchAccessToken() {
    if (!accessToken) {
        try {
            const data = await spotifyApi.clientCredentialsGrant();
            accessToken = data.body.access_token;
            spotifyApi.setAccessToken(accessToken);
        } catch (error) {
            console.error('Error fetching Spotify access token:', error);
            accessToken = null; // Reset token in case of error
        }
    }
}

// Autocomplete function for song search
async function handleAutocomplete(interaction) {
    const query = interaction.options.getString('name');

    if (!query || query.length < 3) return; // Only trigger autocomplete if the query is at least 3 characters

    try {
        await fetchAccessToken(); // Ensure the access token is set

        // Perform Spotify search for tracks, albums, and artists
        const response = await spotifyApi.search(query, ['track', 'album', 'artist'], { limit: 5 });

        if (response.body.error) {
            console.error('Spotify search error:', response.body.error);
            await interaction.respond([]);
            return;
        }

        const tracks = response.body.tracks.items.map(item => {
            return {
                name: `${item.name} - ${item.artists.map(a => a.name).join(', ')}`,
                value: item.uri,
            };
        });

        const artists = response.body.artists.items.map(item => {
            return {
                name: item.name,
                value: item.uri,
            };
        });

        // Combining tracks and artists suggestions
        const suggestions = [...tracks, ...artists].slice(0, 25); // Limit to 25 suggestions

        await interaction.respond(suggestions);
    } catch (error) {
        console.error('Error fetching Spotify search results:', error);
        await interaction.respond([]);
    }
}

// Modified play function with dynamic fallback suggestion
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
                .setFooter({ text: `Developed by Ryuu `, iconURL: musicIcons.heartIcon })
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
                .setFooter({ text: `Developed by Ryuu `, iconURL: musicIcons.heartIcon })
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
            const resolve = await client.riffy.resolve({ query, requester: interaction.user.username });

            if (!resolve || typeof resolve !== 'object' || !Array.isArray(resolve.tracks)) {
                throw new TypeError('Invalid response from Riffy');
            }

            if (resolve.loadType === 'playlist') {
                isPlaylist = true;
                for (const track of resolve.tracks) {
                    track.info.requester = interaction.user.username;
                    player.queue.add(track);
                    requesters.set(track.info.uri, interaction.user.username);
                }
            } else if (resolve.loadType === 'search' || resolve.loadType === 'track') {
                const track = resolve.tracks.shift();
                track.info.requester = interaction.user.username;
                player.queue.add(track);
                requesters.set(track.info.uri, interaction.user.username);
            } else {
                const errorEmbed = new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setAuthor({ 
                        name: lang.play.embed.error,
                        iconURL: musicIcons.alertIcon,
                        url: config.SupportServer
                    })
                    .setFooter({ text: `Developed by Ryuu `, iconURL: musicIcons.heartIcon })
                    .setDescription(lang.play.embed.noResults);

                await interaction.followUp({ embeds: [errorEmbed] });

                // Show dynamic fallback suggestions if no results found
                await fetchAccessToken(); // Ensure the access token is set

                // Get related tracks for the search query
                const response = await spotifyApi.search(query, ['track'], { limit: 5 });

                if (response.body.error) {
                    console.error('Error fetching related tracks:', response.body.error);
                    await interaction.followUp({ content: "❌ Could not fetch related tracks." });
                    return;
                }

                const relatedTracks = response.body.tracks.items.map(item => {
                    return {
                        name: `${item.name} - ${item.artists.map(a => a.name).join(', ')}`,
                        value: item.uri,
                    };
                });

                // Create an embed with related tracks suggestions
                const suggestionEmbed = new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setAuthor({
                        name: lang.play.embed.suggestion,
                        iconURL: musicIcons.musicNoteIcon,
                        url: config.SupportServer
                    })
                    .setDescription('Here are some related tracks based on your search:')
                    .addFields(
                        relatedTracks.slice(0, 5).map(track => ({
                            name: track.name,
                            value: `[Listen here](${track.value})`
                        }))
                    )
                    .setFooter({ text: `Developed by Ryuu `, iconURL: musicIcons.heartIcon });

                await interaction.followUp({ embeds: [suggestionEmbed] });
                return;
            }
        }

        let queuedTracks = 0;

        for (const trackQuery of tracksToQueue) {
            const resolve = await client.riffy.resolve({ query: trackQuery, requester: interaction.user.username });
            if (resolve.tracks.length > 0) {
                const trackInfo = resolve.tracks[0];
                player.queue.add(trackInfo);
                requesters.set(trackInfo.uri, interaction.user.username);
                queuedTracks++;
            }
        }

        if (!player.playing && !player.paused) player.play();

        const randomEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setAuthor({
                name: lang.play.embed.requestUpdated,
                iconURL: musicIcons.beats2Icon,
                url: config.SupportServer
            })
            .setDescription(lang.play.embed.successProcessed)
            .setFooter({ text: `Developed by Ryuu `, iconURL: musicIcons.heartIcon });

        const message = await interaction.followUp({ embeds: [randomEmbed] });

        setTimeout(() => {
            message.delete().catch(() => {});
        }, 3000);

    } catch (error) {
        console.error('Error processing play command:', error);
        await interaction.followUp({ content: "❌ An error occurred while processing the request." });
    }
}

// Helper function to get Spotify playlist tracks
async function getSpotifyPlaylistTracks(playlistId) {
    try {
        await fetchAccessToken(); // Ensure the access token is set

        let tracks = [];
        let offset = 0;
        let limit = 100;
        let total = 0;

        do {
            const response = await spotifyApi.getPlaylistTracks(playlistId, { limit, offset });
            total = response.body.total;
            offset += limit;

            for (const item of response.body.items) {
                if (item.track && item.track.name && item.track.artists) {
                    const trackName = `${item.track.name} - ${item.track.artists.map(a => a.name).join(', ')}`;
                    tracks.push(trackName);
                }
            }
        } while (tracks.length < total);

        return tracks;
    } catch (error) {
        console.error("Error fetching Spotify playlist tracks:", error);
        return [];
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
    autocomplete: handleAutocomplete, // Attach autocomplete function
    requesters: requesters,
};
