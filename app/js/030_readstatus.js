blockslack.readstatus = (function(){
    
    var READ_STATUS_FILE = "readstatus/state.json";

    var getCurrentChecksum = function(groupId, channelName) {
        var allData = blockslack.aggregation.getAllData();
        var groupData = allData[groupId];
        if (groupData) {
            var channelData = groupData.channels[channelName];
            if (channelData) {
                return channelData.messagesChecksum || 0;
            }
        }
    };

    var getReadStatus = function() {
        var readStatus = blockslack.authentication.state("readStatus") || {};
        blockslack.authentication.state("readStatus", readStatus);
        return readStatus;
    };

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    };

    return {

        markRead: function(groupId, channelName) {
            var readStatus = getReadStatus();
            var key = sha256(groupId + "_" + channelName);
            readStatus[key] = getCurrentChecksum(groupId, channelName);
        },

        hasUnread: function(groupId, channelName) {
            var readStatus = getReadStatus();
            var key = sha256(groupId + "_" + channelName);
            return readStatus[key] != getCurrentChecksum(groupId, channelName);
        },

        sync: function() {
            if (!blockslack.authentication.isSignedIn()) {
                return;
            }

            var localReadStatus = getReadStatus();
            return blockstack.getFile(READ_STATUS_FILE).then(function(remoteJson) {
                var remoteReadStatus = remoteJson ? (JSON.parse(remoteJson) || {}) : {};
                var updated = false;
                
                for (var key in localReadStatus) {
                    if (remoteReadStatus[key] != localReadStatus[key]) {
                        remoteReadStatus[key] = localReadStatus[key];
                        updated = true;
                    }
                }

                if (JSON.stringify(remoteReadStatus) != JSON.stringify(localReadStatus)) {
                    blockslack.authentication.state("readStatus", remoteReadStatus);
                    blockslack.chatui.updateUi();
                }

                if (!updated) {
                    return Promise.resolve();
                } else {
                    return blockstack.putFile(READ_STATUS_FILE, JSON.stringify(remoteReadStatus));
                }
            });
        },

    };

})();
