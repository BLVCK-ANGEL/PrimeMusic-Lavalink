

module.exports = {
  TOKEN: "",
  language: "en",
  ownerID: ["818920751444393994", ""], 
  mongodbUri : "mongodb+srv://PHV-CLUSTER:PHV04@phv-cloud.1bg1tl8.mongodb.net/?retryWrites=true&w=majority",
  spotifyClientId : "f71a3da30e254962965ca2a89d6f74b9",
  spotifyClientSecret : "199a619d22dd4e55a4a2c1a7a3d70e63",
  setupFilePath: './commands/setup.json',
  commandsDir: './commands',  
  embedColor: "#ff2e05",
  activityName: "YouTube Music", 
  activityType: "LISTENING",  // Available activity types : LISTENING , PLAYING
  SupportServer: "https://discord.gg/xQF9f9yUEM",
  embedTimeout: 5, 
  errorLog: "", 
  nodes: [
     {
      name: "Public Lavalink v4",
      password: "https://dsc.gg/ajidevserver",
      host: "lava-v4.ajieblogs.eu.org",
      port:  443,
      secure: true
    }
  ]
}
