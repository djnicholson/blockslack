blockslack.feedpub = (function(){

    var DONT_ENCRYPT = { encrypt: false };
    var DONT_DECRYPT = { decrypt: false };

    var FEED_FILE_FORMAT = "feeds_v2/feed_%1_%2.json";

    var MAX_MESSAGES_PER_CHUNK = 50;

    var cacheBust = function(filename) {
        return filename + "?" + Math.random();
    };

    var feedFilename = function(audience, keyId, timestamp) {
        return FEED_FILE_FORMAT
            .replace("%1", sha256(keyId + "_" + normalizeAudience(audience).join()))
            .replace("%2", timestamp);
    };

    var getFeed = function(filename, options) {
        return blockstack.getFile(cacheBust(filename), options).then(function(result) {
            var resultUncompressed = result;
            if (result) {
                if (result.startsWith("LZ_")) {
                    resultUncompressed = LZString.decompressFromUTF16(result.substring(3));
                }

                console.log("Retrieved " + filename + ": " + Math.round(resultUncompressed.length / 1024.0) + 
                    " KB compressed to " + Math.round(result.length / 1024.0) + " KB");
            } else {
                console.log("Could not retrieve " + filename);
            }

            return Promise.resolve(resultUncompressed);
        });
    };

    var newFeedObject = function(audience, nextFilename) {
        return {
            audience: audience,
            messages: [],
            next: nextFilename,
        };
    };

    var normalizeAudience = function(audience) {
        var audienceClone = audience.slice();
        audienceClone.sort(function(a, b){ return a[1] > b[1] ? 1 : -1; });
        return audienceClone;
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
        return putFeed(rootFilename, newFeedRootCipherText, DONT_ENCRYPT).catch(function(e) {
            console.log("Could not publish message, failed to rewrite feed file. Feed: ", keyId);
            return Promise.reject(Error("Could not publish message, failed to rewrite feed file"));
        });
    };

    var putFeed = function(filename, feedCipherText, options) {
        var feedCipherTextCompressed = LZString.compressToUTF16(feedCipherText);
        console.log("Publishing " + filename + ": " + Math.round(feedCipherText.length / 1024.0) + 
            " KB compressed to " + Math.round(feedCipherTextCompressed.length / 1024.0) + " KB");
        return blockstack.putFile(filename, "LZ_" + feedCipherTextCompressed, options);
    };

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    };

    return {

        publish: function(audience, messageObject) {
            messageObject.ts = (new Date).getTime();
            return blockslack.keys.getSymmetricKeyForAudience(audience).then(function(keyObject) {
                var keyId = keyObject.id;
                var key = keyObject.key;
                var rootFilename = feedFilename(audience, keyId, 0);
                blockslack.discovery.registerFeed(audience, keyId, rootFilename);
                return getFeed(rootFilename, DONT_DECRYPT).then(function(existingFeedCipherText) {
                    var feedRoot = parseExistingFeedRootOrCreateNew(audience, existingFeedCipherText, key);

                    var continuationFile = undefined;
                    var publishContinuationFile = Promise.resolve();
                    if (feedRoot.messages.length >= MAX_MESSAGES_PER_CHUNK) {
                        continuationFile = feedFilename(audience, keyId, feedRoot.messages[0].ts);
                        feedRoot.pubsubUrl = undefined; // never expected to be updated, so shouldn't be monitored
                        var newFeedContinuationText = JSON.stringify(feedRoot);
                        var newFeedContinuationCipherText = sjcl.encrypt(key, newFeedContinuationText);
                        publishContinuationFile = publishWithoutRotation(keyId, continuationFile, newFeedContinuationCipherText);
                        feedRoot = newFeedObject(audience, continuationFile);
                    }

                    return publishContinuationFile.then(function() {
                        feedRoot.messages.push(messageObject);
                        feedRoot.pubsubUrl = blockslack.pubsub.getServerUrl();
                        var newFeedRootText = JSON.stringify(feedRoot);
                        var newFeedRootCipherText = sjcl.encrypt(key, newFeedRootText);
                        return publishWithoutRotation(keyId, rootFilename, newFeedRootCipherText).then(function() {
                            var username = blockslack.authentication.getUsername();
                            blockslack.pubsub.notifyPublish(rootFilename, keyId, feedRoot.pubsubUrl);
                            return blockslack.aggregation.updateFeed(username, rootFilename, keyId);
                        });
                    });
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
                return getFeed(filename, getFileOptions).then(function(cipherText) {
                    var feedRoot = parseExistingFeedRootOrCreateNew([], cipherText, key);

                    if (feedRoot.pubsubUrl) {
                        blockslack.pubsub.ensureMonitored(userId, filename, keyId, feedRoot.pubsubUrl);
                    }

                    return Promise.resolve(feedRoot);
                });
            });
        },

    };

})();
