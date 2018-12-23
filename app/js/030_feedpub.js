blockslack.feedpub = (function(){
    
    // privates:

    var DONT_ENCRYPT = { encrypt: false };
    var DONT_DECRYPT = { decrypt: false };

    var FEED_FILE_FORMAT = "feeds/feed_%1_%2.json";

    var MAX_CHUNK_SIZE = 10000; // (in JSON characters)

    var feedFilename = function(keyId, timestamp) {
        return FEED_FILE_FORMAT.replace("%1", keyId).replace("%2", timestamp);
    };

    var newFeedObject = function(audience, nextFilename) {
        return {
            audience: audience,
            messages: [],
            next: nextFilename,
        };
    };

    var parseExistingFeedRootOrCreateNew = function(audience, existingFeedCipherText, key) {
        var existingFeedText = undefined;
        if (existingFeedCipherText) {
            existingFeedText = sjcl.decrypt(key, existingFeedCipherText);
        }

        var existingFeed = existingFeedText ? JSON.parse(existingFeedText) : newFeedObject(audience, undefined);
        return existingFeed;
    };

    var publishWithoutRotation = function(keyId, rootFilename, newFeedRootCipherText) {
        blockstack.putFile(
            rootFilename,
            newFeedRootCipherText,
            DONT_ENCRYPT).catch(function(e) {
                console.log("Could not publish message, failed to rewrite feed file. Feed: ", keyId);
            });
    };

    var publishWithRotation = function(audience, keyId, key, rootFilename, latestFeedChunkCipherText) {
        var nextFilename = feedFilename(keyId, (new Date).getTime());
        var newRootFeed = newFeedObject(audience, nextFilename);
        var newRootFeedText = JSON.stringify(newRootFeed);
        var newRootFeedCipherText = sjcl.encrypt(key, newRootFeedText);
        
        blockstack.putFile(
            nextFilename,
            latestFeedChunkCipherText,
            DONT_ENCRYPT).then(function() {

                blockstack.putFile(rootFilename, newRootFeedCipherText, DONT_ENCRYPT).catch(function(e) {
                    console.log("Could not publish message, failed to write new feed head after rotation. Feed: ", keyId);
                });

            }).catch(function(e) {
              
                console.log("Could not publish message, failed to rotate feed file. Feed: " + keyId);

            });
    };

    return {

        // publics:

        publish: function(audience, messageObject) {
            messageObject.ts = (new Date).getTime();
            blockslack.keys.withSymmetricKeyForAudience(audience, function(keyObject) {
                if (keyObject) {
                    var keyId = keyObject.id;
                    var key = keyObject.key;
                    var rootFilename = feedFilename(keyId, 0);
                    blockslack.discovery.registerFeed(audience, keyId, rootFilename);
                    blockstack.getFile(rootFilename, DONT_DECRYPT).then(function(existingFeedCipherText) {
                        var feedRoot = parseExistingFeedRootOrCreateNew(audience, existingFeedCipherText, key);
                        feedRoot.messages.push(messageObject);
                        var newFeedRootText = JSON.stringify(feedRoot);
                        var newFeedRootCipherText = sjcl.encrypt(key, newFeedRootText);
                        if (newFeedRootText.length <= MAX_CHUNK_SIZE) {
                            publishWithoutRotation(keyId, rootFilename, newFeedRootCipherText);
                        } else {
                            publishWithRotation(audience, keyId, key, rootFilename, newFeedRootCipherText);
                        }
                    });
                } else {
                    console.log("Could not publish message, group key not available", audience, messageObject);
                }
            });
        },

        read: function(userId, filename, keyId, action) {
            blockslack.keys.withSymmetricKeyFromUser(userId, keyId, function(key) {
                var getFileOptions = { decrypt: false, username: userId };
                blockstack.getFile(filename, getFileOptions).then(function(cipherText) {
                    var feedRoot = parseExistingFeedRootOrCreateNew([], cipherText, key);
                    action(feedRoot);
                });
            });
        },

    };

})();
