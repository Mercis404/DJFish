const { Client, Util } = require('discord.js');
const YouTube = require('simple-youtube-api');
const client = new Client({ disableEveryone: true })
const ytdl = require('ytdl-core');
const {PREFIX} = require("./config.json")

const youtube = new YouTube(process.env.YOUTUBE_API_KEY)
const queue = new Map()


client.on('ready', () => console.log('Online'))
require('http').createServer((req, res) => res.end('Bot is alive!')).listen(3000)
client.on("ready", async message => {
  console.log(`${client.user.username} is now online`);
  await client.user.setActivity("-play for music | 10/09/2020", {
    type: 'STREAMING',
    url: 'https://www.twitch.tv/Mercisffnf'
  })
})
client.on('message', async message => {
  if (message.author.bot) return
  if (!message.content.startsWith(PREFIX)) return

  const args = message.content.substring(PREFIX.length).split(" ")
  const searchString = args.slice(1).join(' ')
  const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : ""
  const serverQueue = queue.get(message.guild.id)

  if (message.content.startsWith(`${PREFIX}play`)) {
    const voiceChannel = message.member.voice.channel
    if (!voiceChannel) return message.channel.send("You need to be in a voice channel to play music")
    const permissions = voiceChannel.permissionsFor(message.client.user)
    if (!permissions.has('CONNECT')) return message.channel.send("I don\'t have permissions to connect to the voice channel")
    if (!permissions.has('SPEAK')) return message.channel.send("I don\'t have permissions to speak in the voice channel")

    if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
      const playlist = await youtube.getPlaylist(url)
      const videos = await playlist.getVideos()
      for (const video of Object.values(videos)) {
        const video2 = await youtube.getVideoByID(video.id)
        await handleVideo(video2, message, voiceChannel, true)
      }
      message.channel.send(`Playlist **${playlist.title}** has been added to the queue`)
      return undefined
    } else {
      try {
        var video = await youtube.getVideo(url)
      } catch {
        try {
          var videos = await youtube.searchVideos(searchString, 10)
          var index = 0
          message.channel.send(`
__**Song Selections**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}

Please select one of the songs ranging from 1-10
                    `)
          try {
            var responce = await message.channel.awaitMessages(msg => msg.content > 0 && msg.content < 11, {
              max: 1,
              time: 30000,
              errors: ['time']
            })
          } catch {
            message.channel.send('No or invalid song selection was provided')
          }
          const videoIndex = parseInt(responce.first().content)
          var video = await youtube.getVideoByID(videos[videoIndex - 1].id)
        } catch {
          return message.channel.send("I couldn\'t find any search results")
        }
      }
      return handleVideo(video, message, voiceChannel)
    }
  } else if (message.content.startsWith(`${PREFIX}stop`)) {
    if (!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to stop the music")
    if (!serverQueue) return message.channel.send("There is nothing playing")
    serverQueue.songs = []
    serverQueue.connection.dispatcher.end()
    message.channel.send("I have stopped the music for you")
    return undefined
  } else if (message.content.startsWith(`${PREFIX}skip`)) {
    if (!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to skip the music")
    if (!serverQueue) return message.channel.send("There is nothing playing")
    serverQueue.connection.dispatcher.end()
    message.channel.send("I have skipped the song for you")
    return undefined
  } else if (message.content.startsWith(`${PREFIX}volume`)) {
    if (!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to use the music commands")
    if (!serverQueue) return message.channel.send("There is nothing playing")
    if (!args[1]) return message.channel.send(`The volume is: **${serverQueue.volume}**`)
    if (isNaN(args[1])) return message.channel.send("That is not a valid amount to change the volume to")
    serverQueue.volume = args[1]
    serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5)
    message.channel.send(`I have changed the volume to: **${args[1]}**`)
    return undefined
  } else if (message.content.startsWith(`${PREFIX}np`)) {
    if (!serverQueue) return message.channel.send("There is nothing playing")
    message.channel.send(`Now Playing: **${serverQueue.songs[0].title}**`)
    return undefined
  } else if (message.content.startsWith(`${PREFIX}queue`)) {
    if (!serverQueue) return message.channel.send("There is nothing playing")
    message.channel.send(`
 __**Song Queue:**__
 ${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
 **Now Playing:** ${serverQueue.songs[0].title}       
        `, { split: true })
    return undefined
  } else if (message.content.startsWith(`${PREFIX}pause`)) {
    if (!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to use the pause command")
    if (!serverQueue) return message.channel.send("There is nothing playing")
    if (!serverQueue.playing) return message.channel.send("The music is already paused")
    serverQueue.playing = false
    serverQueue.connection.dispatcher.pause()
    message.channel.send("I have now paused the music for you")
    return undefined
  } else if (message.content.startsWith(`${PREFIX}resume`)) {
    if (!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to use the resume command")
    if (!serverQueue) return message.channel.send("There is nothing playing")
    if (serverQueue.playing) return message.channel.send("The music is already playing")
    serverQueue.playing = true
    serverQueue.connection.dispatcher.resume()
    message.channel.send("I have resumed the music for you")
    return undefined
  }
  return undefined
})

async function handleVideo(video, message, voiceChannel, playlist = false) {
  const serverQueue = queue.get(message.guild.id)

  const song = {
    id: video.id,
    title: Util.escapeMarkdown(video.title),
    url: `https:www.youtube.com/watch?v=${video.id}`
  }

  if (!serverQueue) {
    const queueConstruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    }
    queue.set(message.guild.id, queueConstruct)

    queueConstruct.songs.push(song)

    try {
      var connection = await voiceChannel.join()
      queueConstruct.connection = connection
      play(message.guild, queueConstruct.songs[0])
    } catch (error) {
      console.log(`There was an error connecting to the voice channel: ${error}`)
      queue.delete(message.guild.id),
        message.channel.send(`There was an error connecting to the voice channel: ${error}`)
    }
  } else {
    serverQueue.songs.push(song)
    if (playlist) return undefined
    else return message.channel.send(`**${song.title}** has been added to the queue`)
  }
  return undefined
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id)

  if (!song) {
    serverQueue.voiceChannel.leave()
    queue.delete(guild.id)
    return
  }

  const dispatcher = serverQueue.connection.play(ytdl(song.url))
    .on('finish', () => {
      serverQueue.songs.shift()
      play(guild, serverQueue.songs[0])
    })
    .on('error', error => {
      console.log(error)
    })
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5)

  serverQueue.textChannel.send(`Start Playing: **${song.title}**`)

}

client.login(process.env.TOKEN)