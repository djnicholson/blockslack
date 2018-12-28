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
    var KIND_RX = "rx";

    var getChannelData = function(groupData, channelName) {
        var channelData = groupData.channels[channelName] || { messages: [] };
        groupData.channels[channelName] = channelData;
        return channelData;
    };

    var updateGroupTitle = function(groupData, message) {
        if (!groupData.title) {
            groupData.title = {
                title: message[FIELD_GROUP_TITLE],
                ts: 0,
            }; 
        }

        if ((message[FIELD_KIND] == KIND_TITLE_CHANGE) &&
            (message[FIELD_TIMESTAMP] > groupData.title.ts)) {
            groupData.title.title = message[FIELD_GROUP_TITLE];
            groupData.title.ts = message[FIELD_TIMESTAMP];
        }
    };

    var updateMemberList = function(groupData, message, senderUserId, latestRecipients) {
        if (message[FIELD_CHANNEL_NAME]) {
            var channelData = getChannelData(groupData, message[FIELD_CHANNEL_NAME]);
            if (!channelData.audience) {
                channelData.audience = {
                    members: latestRecipients,
                    ts: 0,
                };
            }
            
            if (validate(senderUserId, latestRecipients, message, true)) {
                if ((message[FIELD_KIND] == KIND_AUDIENCE_CHANGE) &&
                    (message[FIELD_TIMESTAMP] > channelData.audience.ts)) {
                    channelData.audience.members = message[FIELD_MEMBER_LIST];
                    channelData.audience.ts = message[FIELD_TIMESTAMP];
                }
            }
        }
    };

    var updateMessages = function(groupData, message, senderUserId, audience) {
        if ((message[FIELD_KIND] == KIND_MESSAGE) && validate(senderUserId, audience, message, true)) {
            var channelData = getChannelData(groupData, message[FIELD_CHANNEL_NAME]);
            if (channelData.audience.members.indexOf(senderUserId) === -1) {
                console.log(senderUserId + " tried to send a message to a channel they are not a member of");
            } else {
                var allMessages = channelData.messages;
                allMessages.push({
                    ts: message[FIELD_TIMESTAMP],
                    from: senderUserId,
                    text: message[FIELD_MESSAGE],
                });
                allMessages.sort(function(a, b) { return a.ts - b.ts; });
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

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

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
            if (message[FIELD_KIND] != KIND_RX) {
                if (validate(senderUserId, audience, message, false)) {
                    var allData = blockslack.aggregation.getAllData();
                    var groupId = message[FIELD_GROUP_ID];
                    allData[groupId] = allData[groupId] || { channels: {} };
                    updateGroupTitle(allData[groupId], message);
                    updateMemberList(allData[groupId], message, senderUserId, audience);
                    updateMessages(allData[groupId], message, senderUserId, audience);
                }
            }
        },

    };

})();
