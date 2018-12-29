blockslack.feedpub = (function(){
    
    // privates:

    var DONT_ENCRYPT = { encrypt: false };
    var DONT_DECRYPT = { decrypt: false };

    var FEED_FILE_FORMAT = "feeds/feed_%1_%2.json";

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
        if (existingFeedCipherText && key) {
            existingFeedText = sjcl.decrypt(key, existingFeedCipherText);
        }

        var existingFeed = existingFeedText ? JSON.parse(existingFeedText) : newFeedObject(audience, undefined);
        return existingFeed;
    };

    var publishWithoutRotation = function(keyId, rootFilename, newFeedRootCipherText) {
        return blockstack.putFile(
            rootFilename,
            newFeedRootCipherText,
            DONT_ENCRYPT).then(function() {
                return blockslack.polling.forceReadFeed(
                    blockstack.loadUserData().username,
                    rootFilename,
                    keyId);
            }).catch(function(e) {
                console.log("Could not publish message, failed to rewrite feed file. Feed: ", keyId);
                return Promise.reject(Error("Could not publish message, failed to rewrite feed file"));
            });
    };

    return {

        // publics:

        publish: function(audience, messageObject) {
            messageObject.ts = (new Date).getTime();
            return blockslack.keys.getSymmetricKeyForAudience(audience).then(function(keyObject) {
                var keyId = keyObject.id;
                var key = keyObject.key;
                var rootFilename = feedFilename(keyId, 0);
                blockslack.discovery.registerFeed(audience, keyId, rootFilename);
                return blockstack.getFile(rootFilename, DONT_DECRYPT).then(function(existingFeedCipherText) {
                    var feedRoot = parseExistingFeedRootOrCreateNew(audience, existingFeedCipherText, key);
                    feedRoot.messages.push(messageObject);
                    var newFeedRootText = JSON.stringify(feedRoot);
                    var newFeedRootCipherText = sjcl.encrypt(key, newFeedRootText);

                    // TODO: Only have most recent messages in the "root" feed file, then link to
                    //       other files that contain older messages (and intelligently follow these
                    //       links when older chat history needs to be reconstructed).
                    //       For now, everything goes in one file, but performance will begin to degrade
                    //       after a set of users have exchanged a lot of messages.
                    return publishWithoutRotation(keyId, rootFilename, newFeedRootCipherText);
                });
            }).catch(function(e) {
                console.log("Could not publish message, group key not available", audience, messageObject, e);
                return Promise.reject("Could not publish message, group key not available");
            });
        },

        read: function(userId, filename, keyId) {
            return blockslack.keys.getSymmetricKeyFromUser(userId, keyId).then(function(keyObject) {
                var key = keyObject.key;
                var getFileOptions = { decrypt: false, username: userId };
                return blockstack.getFile(filename, getFileOptions).then(function(cipherText) {
                    var feedRoot = parseExistingFeedRootOrCreateNew([], cipherText, key);
                    return Promise.resolve(feedRoot);
                });
            });
        },

    };

})();
