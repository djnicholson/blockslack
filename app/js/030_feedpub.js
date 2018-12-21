blockslack.feedpub = (function(){
    
    // privates:

    var FEED_FILE_FORMAT = "feeds/%1_%2.json";

    var MAX_CHUNK_SIZE = 10000; // (in JSON characters)

    var feedFilename = function(keyId, timestamp) {
        return FEED_FILE_FORMAT.replace("%1", keyId).replace("%2", timestamp);
    };

    var newFeedObject = function() {
        return {
            messages: [],
            next: undefined,
        };
    }

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:

        publish: function(audience, messageObject) {
            blockslack.keys.withSymmetricKeyForAudience(audience, function(keyObject) {
                if (keyObject) {
                    var keyId = keyObject.id;
                    var key = keyObject.key;
                    var options = { decrypt: false };
                    var rootFilename = feedFilename(keyId, 0);
                    blockstack.getFile(rootFilename, options).then(function(existingFeedCipherText) {

                        var existingFeedText = undefined;
                        if (existingFeedCipherText) {
                            existingFeedText = sjcl.decrypt(key, existingFeedCipherText);
                        }

                        var existingFeed = existingFeedText ? JSON.parse(existingFeedText) : newFeedObject();
                        existingFeed.messages.push(messageObject);
                        var newFeedText = JSON.stringify(existingFeed);
                        var newFeedCipherText = sjcl.encrypt(key, newFeedText);

                        if (newFeedText.length <= MAX_CHUNK_SIZE) {

                            blockstack.putFile(
                                rootFilename,
                                newFeedCipherText,
                                { encrypt: false }).catch(function(e) {
                                    console.log("Could not publish message, failed to rewrite feed file", audience, messageObject);
                                });

                        } else {

                            var nextFilename = feedFilename(keyId, (new Date).getTime());
                            blockstack.putFile(
                                nextFilename,
                                newFeedCipherText,
                                { encrypt: false }).catch(function(e) {
                                    console.log("Could not publish message, failed to rotate feed file", audience, messageObject);
                                }).then(function() {

                                    var newRootFeed = newFeedObject();
                                    newRootFeed.next = nextFilename;
                                    var newRootFeedText = JSON.stringify(newRootFeed);
                                    var newRootFeedCipherText = sjcl.encrypt(key, newRootFeedText);

                                    blockstack.putFile(
                                        rootFilename,
                                        newRootFeedCipherText,
                                        { encrypt: false }).catch(function(e) {
                                            console.log("Could not publish message, failed to write new feed head after rotation", audience, messageObject);
                                        });
                                });

                        }

                    });
                } else {
                    console.log("Could not publish message, group key not available", audience, messageObject);
                }
            });
        },

    };

})();
