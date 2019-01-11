blockslack.pubsub = (function(){
    
    var DEFAULT_SERVER = "wss://server.blockslack.io/";

    var WARMUP_DELAY = 5000;
    var MAX_ATTEMPTS = 10;
    var PUBLISH_DELAY = 2000; // retrieving a file from GAIA immeadietely after publish soemtimes returns the old version

    var Connection = function(serverUrl) {
        this.serverUrl = serverUrl;
        this.connection = undefined;
        this.subscribed = undefined;
        
        (this.ensureConnected = function() {
            if (!this.connection || this.connection.readyState > 1) {
                try {
                    this.connection = new WebSocket(serverUrl);
                    this.connection.onmessage = handleUpdate;
                } catch(e) {
                    console.warn("Websocket connection to " + this.serverUrl + " not possible (" + e + ")");
                }

                this.subscribed = { };
            }
        })();

        this.publish = function(feedId) {
            this.send({ t: "p", f: feedId });
        };

        this.send = function(messageObject, then) {
            this.ensureConnected();
            var that = this;
            var failCount = 0;
            
            var onError = function() {
                if (failCount < MAX_ATTEMPTS) {
                    failCount++;
                    console.warn("Delay (" + failCount + ") in sending " + JSON.stringify(messageObject) + " to " + that.serverUrl);
                    setTimeout(action, WARMUP_DELAY);
                }
            };

            var action = function() {
                that.ensureConnected();
                if (that.connection) {
                    if (that.connection.readyState == 1) {
                        var ok = false;
                        try {
                            that.connection.send(JSON.stringify(messageObject));
                            ok = true;
                        } catch (e) {
                            onError();
                        }

                        ok && then && then();
                    } else {
                        onError();
                    }
                }
            };

            action();
        };
        
        this.subscribe = function(feedId) {
            if (!this.subscribed || !this.subscribed[feedId]) {
                var that = this;
                this.send(
                    { t: "s", f: feedId },
                    function() { that.subscribed[feedId] = true; });
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
        return blockslack.authentication.state("pubsubLookup") || 
            blockslack.authentication.state("pubsubLookup", { });
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
            //
            // TODO: Allow users to choose their own URL
            //
            return DEFAULT_SERVER;
        },

        notifyPublish: function(filename, keyId, serverUrl) {
            setTimeout(function() {
                var hostUserId = blockslack.authentication.getUsername();
                var connection = getConnection(serverUrl);
                connection.publish(encodeFeedId(hostUserId, filename, keyId));
            }, PUBLISH_DELAY);
        },

    };

})();
