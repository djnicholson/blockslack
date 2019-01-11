blockslack.aggregation = (function(){
    
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

    var ChannelData = function() {
        var HISTORY_TYPE_MSG = "m";
        var HISTORY_TYPE_AUDIENCE = "a";

        this.channelHistory = [];

        this.messagesChecksum = 0;
        this.lastActivity = 0;
        this.messages = [];
        this.audiences = [];
        
        this.currentAudience = function() {
            if (this.audiences.length) {
                return this.audiences[this.audiences.length - 1][1];
            } else {
                return [];
            }
        };

        this.generateAudienceChangeMessage = function(ts, senderUserId, oldAudience, newAudience) {
            
            if (oldAudience.length == 0) {
                this.messages.push({
                    ts: ts,
                    from: senderUserId,
                    text: blockslack.strings.MEMBER_ADDED.replace("%1", blockslack.authentication.getUsername()),
                    meta: true,
                });
                return;
            }

            for (var i = 0; i < oldAudience.length; i++) {
                if (newAudience.indexOf(oldAudience[i]) == -1) {
                    this.messages.push({
                        ts: ts,
                        from: senderUserId,
                        text: blockslack.strings.MEMBER_REMOVED.replace("%1", oldAudience[i]),
                        meta: true,
                    });
                }
            }

            for (var i = 0; i < newAudience.length; i++) {
                if (oldAudience.indexOf(newAudience[i]) == -1) {
                    this.messages.push({
                        ts: ts,
                        from: senderUserId,
                        text: blockslack.strings.MEMBER_ADDED.replace("%1", newAudience[i]),
                        meta: true,
                    });
                }
            }
        };

        this.isMember = function(ts, username) {
            var i = this.audiences.length - 1;
            while ((i >= 0) && (this.audiences[i][0] > ts)) {
                i--;
            }

            var audience = (i < 0) ? [] : this.audiences[i][1];
            return audience.indexOf(username) != -1;
        };

        this.pushMessage = function(ts, senderUserId, audience, text) {
            this.channelHistory.push([ts, HISTORY_TYPE_MSG, senderUserId, audience, text]);
            this.refresh();
        };

        this.pushAudienceChange = function(ts, senderUserId, newAudience) {
            this.channelHistory.push([ts, HISTORY_TYPE_AUDIENCE, senderUserId, newAudience]);
            this.refresh();  
        };

        this.refresh = function() {
            this.channelHistory.sort(function(a, b) { return a[0] - b[0]; });

            this.messagesChecksum = 0;
            this.lastActivity = 0;
            this.messages = [];
            this.audiences = [];

            for (var i = 0; i < this.channelHistory.length; i++) {
                var historyEntry = this.channelHistory[i];
                var ts = historyEntry[0];
                var historyType = historyEntry[1];
                var senderUserId = historyEntry[2];
                var audience = historyEntry[3];
                var text = historyEntry[4];

                if ((this.audiences.length == 0) || 
                    ((historyType == HISTORY_TYPE_AUDIENCE) && this.isMember(ts, senderUserId))) {
                    
                    var oldAudience = [];
                    if (this.audiences.length > 0) {
                        oldAudience = this.audiences[this.audiences.length - 1][1];
                    }

                    this.generateAudienceChangeMessage(ts, senderUserId, oldAudience, audience);

                    this.audiences.push([ ts, audience ]);
                }

                if ((historyType == HISTORY_TYPE_MSG) && this.isMember(ts, senderUserId)) {
                    this.messages.push({
                        ts: ts,
                        from: senderUserId,
                        text: text,
                        meta: false,
                    });
                    this.lastActivity = ts;
                    this.updateChecksum(ts);
                }
            }
        };

        this.updateChecksum = function(ts) {
            var maxChecksum = Math.round(Number.MAX_SAFE_INTEGER / 2);
            var existingChecksum = this.messagesChecksum || 0;
            var newChecksum = (existingChecksum + ts) % maxChecksum;
            this.messagesChecksum = newChecksum;
        };
    };

    var GroupData = function(groupId) {
        this.groupId = groupId;
        this.channels = {};
        this.titleHistory = [];
        this.currentTitle = blockslack.strings.FALLBACK_GROUP_NAME;
        this.lastActivity = 0;
        
        this.allMembers = function() {
            var result = [];
            for (var channelName in this.channels) {
                var channelData = this.channels[channelName];
                var audience = channelData.currentAudience();
                for (var i = 0; i < audience.length; i++) {
                    (result.indexOf(audience[i]) == -1) && result.push(audience[i]);
                }
            }

            return result;
        };

        this.hasUnread = function() {
            var result = false;
            for (var channelName in this.channels) {
                result = result || blockslack.readstatus.hasUnread(this.groupId, channelName);
            }

            return result;
        };

        this.isMember = function(ts, username) {
            for (var channelName in this.channels) {
                var channelData = this.channels[channelName];
                if (channelData.isMember(ts, username)) {
                    return true;
                }
            }

            return false;
        };

        this.pushTitleChange = function(ts, senderUserId, newTitle) {
            this.titleHistory.push([ts, senderUserId, newTitle]);
            this.refresh();
        };

        this.refresh = function() {
            this.titleHistory.sort(function(a, b) { return a[0] - b[0]; });

            this.currentTitle = undefined;
            for (var i = 0; i < this.titleHistory.length; i++) {
                var historyEntry = this.titleHistory[i];
                var ts = historyEntry[0];
                var senderUserId = historyEntry[1];
                var newTitle = historyEntry[2];
                if (!this.currentTitle || this.isMember(ts, senderUserId)) {
                    this.currentTitle = newTitle;
                }
            }

            this.currentTitle = this.currentTitle || blockslack.strings.FALLBACK_GROUP_NAME;

            for (var channel in this.channels) {
                this.lastActivity = Math.max(this.lastActivity, this.channels[channel].lastActivity);
            }
        };
    };

    var logMalformed = function(senderUserId, audience, message, reason) {
        var message = "Malformed message from " + senderUserId + " to " + JSON.stringify(audience) + 
            ": " + JSON.stringify(message) + " (" + reason + ")";
        console.log(message);
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

        newMessage: function(senderUserId, audience, message, suppressAudio) {
            var allData = blockslack.aggregation.getAllData();

            var ts = message[FIELD_TIMESTAMP];
            var groupId = message[FIELD_GROUP_ID];
            var kind = message[FIELD_KIND];
            if (!ts || !groupId || !kind) {
                logMalformed(senderUserId, audience, message, "Mandatory field missing");
                return;
            }

            allData[groupId] = allData[groupId] || new GroupData(groupId);
            var groupData = allData[groupId];

            if (kind == KIND_TITLE_CHANGE) {
                var newTitle = message[FIELD_GROUP_TITLE];
                groupData.pushTitleChange(ts, senderUserId, newTitle);
            } else {
                var channelName = message[FIELD_CHANNEL_NAME];
                if (!channelName) {
                    logMalformed(senderUserId, audience, message, "Channel missing");
                    return;
                }

                groupData.channels[channelName] = groupData.channels[channelName] || new ChannelData();
                var channelData = groupData.channels[channelName];

                if (kind == KIND_AUDIENCE_CHANGE) {
                    var newAudience = message[FIELD_MEMBER_LIST];
                    channelData.pushAudienceChange(ts, senderUserId, newAudience);
                } else if (kind == KIND_MESSAGE) {
                    var text = message[FIELD_MESSAGE];
                    channelData.pushMessage(ts, senderUserId, audience, text);
                    if (!suppressAudio && (senderUserId != blockslack.authentication.getUsername())) {
                        blockslack.sound.beep();
                    }
                } else {
                    logMalformed(senderUserId, audience, message, "Unknown message type: " + kind);
                }

                groupData.refresh();
            }
        },

    };

})();
