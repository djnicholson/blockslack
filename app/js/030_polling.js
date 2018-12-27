blockslack.polling = (function(){
    
    // privates:

    var WATCHLIST_UPDATE_INTERVAL = 30000;
    var FEED_UPDATE_INTERVAL = 3000;

    var renderedAtLeastOnce = {};
    
    var consumeFeed = function(userId, filename, keyId, feedContents) {
        var rxStatus = blockslack.authentication.state("rxStatus") || {};
        blockslack.authentication.state("rxStatus", rxStatus);

        var key = userId + "_" + filename + "_" + keyId;
        var lastRead = rxStatus[key] || 0;
        var lastConsumed = undefined;
        var updateQueue = {};
        for (var i = 0; i < feedContents.messages.length; i++) {
            var item = feedContents.messages[i];
            if (item.ts && item.ts > lastRead) {
                newMessage(userId, feedContents.audience, item);
                rxStatus[key] = item.ts;
                if (item.k === "rx") {
                    var foreignKey = item.u + "_" + item.f + "_" + item.sk;
                    if (!rxStatus[foreignKey] || (rxStatus[foreignKey] < item.max)) {
                        updateQueue[foreignKey] = item;
                    }
                } else {
                    lastConsumed = item.ts;
                }
            }
        }

        if (feedContents.audience && lastConsumed) {
            blockslack.feedpub.publish(
                feedContents.audience,
                { k: "rx", max: lastConsumed, u: userId, f: filename, sk: keyId });
        }

        for (var foreignKey in updateQueue) {
            var item = updateQueue[foreignKey];
            updateFeed(item.u, item.f, item.k);
        }
    };

    var newMessage = function(senderUserId, audience, message) {
        blockslack.aggregation.newMessage(senderUserId, audience, message);
    };

    var updateFeed = function(userId, filename, keyId) {
        blockslack.feedpub.read(userId, filename, keyId, function(feedContents) {
            consumeFeed(userId, filename, keyId, feedContents);
        });
    };

    var updateRandomFeed = function() {
        var allFeeds = [];
        blockslack.discovery.forEachWatchedFeed(function(userId, filename, keyId) {
            allFeeds.push([ userId, filename, keyId ]);

            var key = userId + "_" + filename + "_" + keyId;
            if (!renderedAtLeastOnce[key]) {
                updateFeed(userId, filename, keyId);
                renderedAtLeastOnce[key] = true;
            }
        });

        if (allFeeds.length > 0) {
            var selected = allFeeds[Math.floor(Math.random() * allFeeds.length)];
            updateFeed(selected[0], selected[1], selected[2]);
        }
    };

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:
        
        onload: function() {
            blockslack.discovery.updateWatchLists();
            updateRandomFeed();
            setInterval(blockslack.discovery.updateWatchLists, WATCHLIST_UPDATE_INTERVAL);
            setInterval(updateRandomFeed, FEED_UPDATE_INTERVAL);
        },

    };

})();
