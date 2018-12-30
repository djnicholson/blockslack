blockslack.aggregation = (function(){
    
    // privates:
    
    var FIELD_CHANNEL_NAME = "c";
    var FIELD_TIMESTAMP = "ts";
    var FIELD_GROUP_ID = "g";
    var FIELD_GROUP_TITLE = "t";
    var FIELD_KIND = "k";
    var FIELD_MESSAGE = "m";
    var FIELD_MEMBER_LIST = "a";

    var KIND_TITLE_CHANGE = "t";
    var KIND_AUDIENCE_CHANGE = "a";
    var KIND_MESSAGE = "m";

    var audienceAtTime = function(channelData, ts) {
        var audience = channelData.audience;
        if (audience) {
            var relevantMemberList = [];
            for (var i in audience.history) {
                if (audience.history[i][0] <= ts) {
                    relevantMemberList = audience.history[i][1];
                }
            }

            if (audience.ts <= ts) {
                relevantMemberList = audience.members;
            }

            return relevantMemberList;
        } else {
            return [];
        }
    };

    var getChannelData = function(groupData, channelName) {
        var channelData = groupData.channels[channelName] || { messages: [] };
        groupData.channels[channelName] = channelData;
        return channelData;
    };

    var pushMessage = function(channelData, ts, from, text, meta) {
        var allMessages = channelData.messages;
        allMessages.push({ ts: ts, from: from, text: text, meta: meta });
        updateChannelChecksum(channelData, ts);
        allMessages.sort(function(a, b) { return a.ts - b.ts; });
    };

    var updateChannelChecksum = function(channelData, ts) {
        var maxChecksum = Math.round(Number.MAX_SAFE_INTEGER / 2);
        var existingChecksum = channelData.messagesChecksum || 0;
        var newChecksum = (existingChecksum + ts) % maxChecksum;
        channelData.messagesChecksum = newChecksum;
    };

    var updateGroupTitle = function(groupData, message, senderUserId) {
        if (!groupData.title) {
            groupData.title = {
                title: message[FIELD_GROUP_TITLE],
                ts: 0,
            }; 
        } else {
            var isMember = false;
            for (var channelName in groupData.channels) {
                var audience = groupData.channels[channelName].audience;
                isMember = isMember || wasMemberOfChannelAtTime(senderUserId, groupData.channels[channelName], message[FIELD_TIMESTAMP]);
            }

            if (!isMember) {
                console.log(senderUserId + " tried to update the title of a group they are not a member of");
                return;
            }

            if ((message[FIELD_KIND] == KIND_TITLE_CHANGE) &&
                (message[FIELD_TIMESTAMP] > groupData.title.ts)) {
                groupData.title.title = message[FIELD_GROUP_TITLE];
                groupData.title.ts = message[FIELD_TIMESTAMP];
            }
        }
    };

    var updateMemberList = function(groupData, message, senderUserId, latestRecipients) {
        if (message[FIELD_CHANNEL_NAME]) {
            var channelData = getChannelData(groupData, message[FIELD_CHANNEL_NAME]);
            if (!channelData.audience) {
                channelData.audience = {
                    members: latestRecipients,
                    history: [],
                    ts: 0,
                };
            } else {
                var ts = message[FIELD_TIMESTAMP];

                if (!wasMemberOfChannelAtTime(senderUserId, channelData, ts)) {
                    console.log(senderUserId + " tried to update audience of a channel they are not a member of");
                    return;
                }

                if (validate(senderUserId, latestRecipients, message, true)) {
                    if (message[FIELD_KIND] == KIND_AUDIENCE_CHANGE) {
                        var newAudience = message[FIELD_MEMBER_LIST];
                        var oldAudience = audienceAtTime(channelData, ts - 1);

                        for (var i in newAudience) {
                            (oldAudience.indexOf(newAudience[i]) == -1) && 
                                pushMessage(
                                    channelData, 
                                    ts, 
                                    senderUserId, 
                                    blockslack.strings.MEMBER_ADDED.replace("%1", newAudience[i]), 
                                    true);
                        }

                        for (var i in oldAudience) {
                            (newAudience.indexOf(oldAudience[i]) == -1) &&
                                pushMessage(
                                    channelData, 
                                    ts, 
                                    senderUserId, 
                                    blockslack.strings.MEMBER_REMOVED.replace("%1", oldAudience[i]), 
                                    true);
                        }

                        channelData.audience.history.push([channelData.audience.ts, oldAudience]);
                        channelData.audience.members = newAudience;
                        channelData.audience.ts = ts;
                    }
                }
            }
        }
    };

    var updateMessages = function(groupData, message, senderUserId, audience) {
        if ((message[FIELD_KIND] == KIND_MESSAGE) && validate(senderUserId, audience, message, true)) {
            var channelData = getChannelData(groupData, message[FIELD_CHANNEL_NAME]);
            if (!wasMemberOfChannelAtTime(senderUserId, channelData, message[FIELD_TIMESTAMP])) {
                console.log(senderUserId + " tried to send a message to a channel they are not a member of");
            } else {
                pushMessage(channelData, message[FIELD_TIMESTAMP], senderUserId, message[FIELD_MESSAGE], false);
            }
        }
    };

    var validate = function(senderUserId, audience, message, channelRequired) {
        if (!message[FIELD_TIMESTAMP] || !message[FIELD_GROUP_ID] || (channelRequired && !message[FIELD_CHANNEL_NAME])) {
            console.log("Malformed message from " + senderUserId + " to " + JSON.stringify(audience) + ": " + JSON.stringify(message));
            return false;
        } else {
            return true;
        }
    };

    var wasMemberOfChannelAtTime = function(username, channelData, ts) {
        var relevantMemberList = audienceAtTime(channelData, ts);
        var found = false;
        for (var i in relevantMemberList) {
            found = found || (relevantMemberList[i] == username);
        }

        return found;
    };

    return {

        // publics:

        generateAudienceChangeMessage(groupId, channelName, newAudience) {
            result = {};
            result[FIELD_GROUP_ID] = groupId;
            result[FIELD_CHANNEL_NAME] = channelName;
            result[FIELD_KIND] = KIND_AUDIENCE_CHANGE;
            result[FIELD_MEMBER_LIST] = newAudience;
            return result;
        },

        generateTextMessage(groupId, channelName, text) {
            result = {};
            result[FIELD_GROUP_ID] = groupId;
            result[FIELD_CHANNEL_NAME] = channelName;
            result[FIELD_KIND] = KIND_MESSAGE;
            result[FIELD_MESSAGE] = text;
            return result;
        },

        generateTitleChangeMessage(groupId, newTitle) {
            result = {};
            result[FIELD_GROUP_ID] = groupId;
            result[FIELD_KIND] = KIND_TITLE_CHANGE;
            result[FIELD_GROUP_TITLE] = newTitle;
            return result;
        },
        
        getAllData: function() {
            var allData = blockslack.authentication.state("allData") || {};
            blockslack.authentication.state("allData", allData);
            return allData;
        },

        newMessage: function(senderUserId, audience, message) {
            if (validate(senderUserId, audience, message, false)) {
                var allData = blockslack.aggregation.getAllData();
                var groupId = message[FIELD_GROUP_ID];
                allData[groupId] = allData[groupId] || { channels: {} };
                updateGroupTitle(allData[groupId], message, senderUserId);
                updateMemberList(allData[groupId], message, senderUserId, audience);
                updateMessages(allData[groupId], message, senderUserId, audience);
            }
        },

    };

})();
