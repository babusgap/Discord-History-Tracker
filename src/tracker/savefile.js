/*
 * SAVEFILE STRUCTURE
 * ==================
 *
 * {
 *   meta: {
 *     users: {
 *       <discord user id>: {
 *         name: <user name>
 *       }, ...
 *     },
 *
 *     // the user index is an array of discord user ids,
 *     // these indexes are used in the message objects to save space
 *     userindex: [
 *       <discord user id>, ...
 *     ],
 *
 *     servers: [
 *       {
 *         name: <server name>,
 *         type: <"SERVER"|"GROUP"|DM">
 *       }, ...
 *     ],
 *
 *     channels: {
 *       <discord channel id>: {
 *         server: <server index in the meta.servers array>,
 *         name: <channel name>
 *       }, ...
 *     }
 *   },
 *
 *   data: {
 *     <discord channel id>: {
 *       <discord message id>: {
 *         u: <user index of the sender>,
 *         t: <message timestamp>,
 *         m: <message content>,
 *         f: <message flags>, // bit 1 = edited, bit 2 = has user mentions (omit for no flags),
 *         e: [ // omit for no embeds
 *           {
 *             url: <embed url>,
 *             type: <embed type>
 *           }, ...
 *         ],
 *         a: [ // omit for no attachments
 *           {
 *             url: <attachment url>
 *           }, ...
 *         ]
 *       }, ...
 *     }, ...
 *   }
 * }
 *
 *
 * TEMPORARY OBJECT STRUCTURE
 * ==========================
 *
 * {
 *   userlookup: {
 *     <discord user id>: <user index in the meta.userindex array>
 *   }
 * }
 */

var SAVEFILE = function(parsedObj){
  if (SAVEFILE.isValid(parsedObj)){
    this.meta = parsedObj.meta;
    this.meta.users = this.meta.users || {};
    this.meta.userindex = this.meta.userindex || [];
    this.meta.servers = this.meta.servers || [];
    this.meta.channels = this.meta.channels || {};
    
    this.data = parsedObj.data;
  }
  else{
    this.meta = {};
    this.meta.users = {};
    this.meta.userindex = [];
    this.meta.servers = [];
    this.meta.channels = {};

    this.data = {};
  }
  
  this.tmp = {};
  this.tmp.userlookup = {};
};

SAVEFILE.isValid = function(parsedObj){
  return parsedObj && typeof parsedObj.meta === "object" && typeof parsedObj.data === "object";
};

SAVEFILE.prototype.findOrRegisterUser = function(userId, userName){
  if (!(userId in this.meta.users)){
    this.meta.users[userId] = {
      name: userName
    };
    
    this.meta.userindex.push(userId);
    return this.tmp.userlookup[userId] = this.meta.userindex.length-1;
  }
  else if (!(userId in this.tmp.userlookup)){
    return this.tmp.userlookup[userId] = this.meta.userindex.findIndex(id => id == userId);
  }
  else{
    return this.tmp.userlookup[userId];
  }
};

SAVEFILE.prototype.findOrRegisterServer = function(serverName, serverType){
  var index = this.meta.servers.findIndex(server => server.name === serverName && server.type === serverType);
  
  if (index === -1){
    this.meta.servers.push({
      name: serverName,
      type: serverType
    });
    
    return this.meta.servers.length-1;
  }
  else{
    return index;
  }
};

SAVEFILE.prototype.tryRegisterChannel = function(serverIndex, channelId, channelName){
  if (!this.meta.servers[serverIndex]){
    return undefined;
  }
  else if (channelId in this.meta.channels){
    return false;
  }
  else{
    this.meta.channels[channelId] = {
      server: serverIndex,
      name: channelName
    };
    
    return true;
  }
};

SAVEFILE.prototype.addMessage = function(channelId, messageId, messageObject){
  var container = this.data[channelId] || (this.data[channelId] = {});
  var wasUpdated = messageId in container;
  
  container[messageId] = messageObject;
  return wasUpdated;
};

SAVEFILE.prototype.convertToMessageObject = function(discordMessage){
  var obj = {
    u: this.findOrRegisterUser(discordMessage.author.id, discordMessage.author.username),
    t: +Date.parse(discordMessage.timestamp),
    m: discordMessage.content
  };
  
  var flags = 0;
  
  if (discordMessage.edited_timestamp !== null){
    flags |= 1;
  }
  
  if (discordMessage.mentions.length > 0){
    flags |= 2;
  }
  
  if (flags !== 0){
    obj.f = flags;
  }
  
  if (discordMessage.embeds.length > 0){
    obj.e = discordMessage.embeds.map(embed => ({
      url: embed.url,
      type: embed.type
    }));
  }
  
  if (discordMessage.attachments.length > 0){
    obj.a = discordMessage.attachments.map(attachment => ({
      url: attachment.url
    }));
  }
  
  return obj;
};

SAVEFILE.prototype.addMessagesFromDiscord = function(channelId, discordMessageArray){
  var wasUpdated = false;
  
  for(var discordMessage of discordMessageArray){
    wasUpdated |= this.addMessage(channelId, discordMessage.id, this.convertToMessageObject(discordMessage));
  }
  
  return wasUpdated;
};

SAVEFILE.prototype.combineWith = function(obj){
  for(var userId in obj.meta.users){
    this.findOrRegisterUser(userId, obj.meta.users[userId].name);
  }
  
  for(var channelId in obj.meta.channels){
    var oldServer = obj.meta.servers[obj.meta.channels[channelId].server];
    var serverIndex = this.findOrRegisterServer(oldServer.name, oldServer.type);
    this.tryRegisterChannel(serverIndex, channelId, obj.meta.channels[channelId].name);
  }
  
  for(var channelId in obj.data){
    for(var messageId in obj.data[channelId]){
      this.addMessage(channelId, messageId, obj.data[channelId][messageId]);
    }
  }
};

SAVEFILE.prototype.toJson = function(){
  return JSON.stringify({
    meta: this.meta,
    data: this.data
  });
};
