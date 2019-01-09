blockslack.discovery = (function(){

    var PERSISTED_STATE_FILE = "discovery_v2/discovery.json";
    var USER_FEEDS_FILE = "discovery_v2/discovery_%1.json";

    var THROTTLE_DURATION = 1000 * 60; // wait 60s before retrying a publish for a failing user

    var lastPublishedHash = "";

    var now = function() {
        return (new Date).getTime();
    };

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    };

    var tryGetPersistedState = function(then) {
        if (blockslack.authentication.isSignedIn()) {
            blockstack.getFile(PERSISTED_STATE_FILE).then(function(fileContents) {
                var persistedState = JSON.parse(fileContents) || { published: { }, watching: { } };
                blockslack.authentication.state("persistedState", persistedState);
                if (then) {
                    then();
                }
            });
        }
    };

    var updateState = function(updater) {
        var existingState = blockslack.authentication.state("persistedState");
        if (existingState) {
            updater(existingState);
            var jsonAfter = JSON.stringify(existingState);
            updateUserFiles(existingState.published);
            var newContentHash = sha256(jsonAfter);
            if (lastPublishedHash !== newContentHash) {
                blockstack.putFile(PERSISTED_STATE_FILE, jsonAfter).then(function() {
                    lastPublishedHash = newContentHash;
                });
            }
        } else {
            tryGetPersistedState(function() { updateState(updater); });
        }
    };

    var updateUserFiles = function(publishedFeedsByUser) {
        var lastPublished = blockslack.authentication.state("lastPublished") || {};
        blockslack.authentication.state("lastPublished", lastPublished);

        var lastFailure = blockslack.authentication.state("lastFailure") || {};
        blockslack.authentication.state("lastFailure", lastFailure);

        for (var userId in publishedFeedsByUser) {
            if (validId(userId)) {
                if (!lastFailure[userId] || (lastFailure[userId] + THROTTLE_DURATION < now())) {
                    blockslack.keys.getAsymmetricKey(userId).then(function(keyPair) {
                        var userId = keyPair.owner;
                        var publicKey = keyPair.public;
                        var feeds = publishedFeedsByUser[userId];
                        var json = JSON.stringify(feeds);
                        var jsonHash = sha256(json);
                        if (lastPublished[userId] != jsonHash) {
                            if (publicKey) {
                                var filename = userFeedsFile(blockstack.loadUserData().username, publicKey);
                                console.log("Publishing discovery feed for " + userId);
                                var content = blockstack.encryptContent(json, { publicKey: publicKey });
                                blockstack.putFile(filename, content, { encrypt: false }).then(function(){ 
                                    console.log("Discovery feed for " + userId + " published: " + jsonHash);
                                    lastPublished[userId] = jsonHash;
                                });
                            } else {
                                console.log(userId + " does not have a public key, not publishing discovery feed");
                                lastFailure[userId] = now();
                            }
                        }
                    });
                }
            }
        }
    };

    var updateWatchList = function(userId, watching) {
        blockslack.keys.getAsymmetricKey().then(function(keyPair) {
            var publicKey = keyPair.public;
            var privateKey = keyPair.private;
            var filename = userFeedsFile(userId, publicKey);
            var getFileOptions = { decrypt: false, username: userId };
            var onSuccess = function(encryptedContent) {
                if (encryptedContent) {
                    var plaintext = blockstack.decryptContent(encryptedContent, { privateKey: privateKey });
                    watching[userId] = JSON.parse(plaintext);
                } else {
                    console.log("Could not update watchlist for feeds from " + userId + " (not published)");    
                }
            };
            var onError = function(error) {
                console.log("Could not update watchlist for feeds from " + userId, error);
            };
            blockstack.getFile(filename, getFileOptions).then(onSuccess).catch(onError);
        });
    };

    var userFeedsFile = function(hostUserId, recipientPublicKey) {
        // Hash the recipients publicKey into the current users ID. This makes it as slow
        // as possible to enumerate who is talking to who (you need to know every public key
        // and cannot re-use a rainbow table between different users)
        return USER_FEEDS_FILE.replace("%1", sha256(hostUserId + "_" + recipientPublicKey));
    };

    var validId = function(id) {
        return id && (id != "null");
    };

    return {

        // publics:

        addContact: function(userId) {
            if (!blockslack.authentication.isSignedIn()) {
                return;
            }

            updateState(function(existingState) {
                if (!existingState.watching[userId]) {
                    existingState.watching[userId] = { };
                }
            });

            blockslack.discovery.updateWatchLists();
        },

        forEachWatchedFeed: function(action) {
            if (!blockslack.authentication.isSignedIn()) {
                return;
            }

            updateState(function(existingState) {
                for (var hostUserId in existingState.watching) {
                    if (validId(hostUserId)) {
                        for (var filename in existingState.watching[hostUserId]) {
                            var keyId = existingState.watching[hostUserId][filename];
                            action(hostUserId, filename, keyId);
                        }
                    }
                }
            });
        },

        registerFeed: function(audience, keyId, filename) {
            if (!blockslack.authentication.isSignedIn()) {
                return;
            }

            updateState(function(existingState) {
                for (var i = 0; i < audience.length; i++) {
                    var userId = audience[i];
                    
                    if (!existingState.watching[userId]) {
                        existingState.watching[userId] = { };
                    }

                    existingState.published[userId] || (existingState.published[userId] = {});
                    existingState.published[userId][filename] = keyId;
                }
            });
        },

        updateWatchLists: function() {
            if (!blockslack.authentication.isSignedIn()) {
                return;
            }

            updateState(function(existingState) {
                for (var userId in existingState.watching) {
                    if (validId(userId)) {
                        updateWatchList(userId, existingState.watching);
                    }
                }
            });
        },

    };

})();
