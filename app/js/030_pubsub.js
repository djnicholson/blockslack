blockslack.pubsub = (function(){
    
    var Connection = function(serverUrl) {
        this.serverUrl = serverUrl;
        this.connection = undefined;
        this.subscribed = undefined;
        
        (this.ensureConnected = function() {
            if (!this.connection || this.connection.readyState > 1) {
                this.connection = new WebSocket(serverUrl);
                this.subscribed = { };
                this.connection.onmessage = handleUpdate;
            }
        })();
        
        this.subscribe = function(feedId) {
            this.ensureConnected();
            if (!this.subscribed[feedId]) {
                try {
                    this.connection.send(JSON.stringify({ t: "s", f: feedId }));
                    this.subscribed[feedId] = true;
                } catch(e) {
                    console.log("Error subscribing to " + feedId + " on " + this.serverUrl);
                }
            }
        };

        this.publish = function(feedId) {
            this.ensureConnected();
            try {
                this.connection.send(JSON.stringify({ t: "p", f: feedId }));
            } catch(e) {
                console.log("Error publishing to " + feedId + " on " + this.serverUrl);
            }
        };
    };

    var connections = { }

    var decodeFeedId = function(feedId) {
        var lookupTable = getLookupTable();
        return lookupTable[feedId];
    };

    var encodeFeedId = function(hostUserId, filename, keyId) {
        var lookupTable = getLookupTable();
        var key = sha256(hostUserId + "_" + filename + "_" + keyId);
        lookupTable[key] = { hostUserId: hostUserId, filename: filename, keyId: keyId };
        return key;
    };

    var getConnection = function(serverUrl) {
        return connections[serverUrl] || (connections[serverUrl] = new Connection(serverUrl));
    };

    var getLookupTable = function() {
        return blockslack.authentication.state("pubsubLookup") || blockslack.authentication.state("pubsubLookup", { });
    };

    var handleUpdate = function(feedId) {
        var feedDetails = feedId && decodeFeedId(feedId.data);
        if (feedDetails) {
            var hostUserId = feedDetails.hostUserId;
            var filename = feedDetails.filename;
            var keyId = feedDetails.keyId;
            blockslack.feedpub.read(hostUserId, filename, keyId).then(function(feedRoot) {
                blockslack.polling.consumeFeed(hostUserId, filename, feedRoot);
            });
        }
    };

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    };

    return {

        ensureMonitored: function(hostUserId, filename, keyId, serverUrl) {
            var connection = getConnection(serverUrl);
            connection.subscribe(encodeFeedId(hostUserId, filename, keyId));
        },

        getServerUrl: function() {
            // TODO: Allow users to choose their own URL
            return "ws://127.0.0.1:80";
        },

        notifyPublish: function(filename, keyId, serverUrl) {
            var hostUserId = blockslack.authentication.getUsername();
            var connection = getConnection(serverUrl);
            connection.publish(encodeFeedId(hostUserId, filename, keyId));
        },

    };

})();
