blockslack.polling = (function(){

    var WATCHLIST_UPDATE_INTERVAL = 30000;
    var READ_STATUS_UPDATE_INTERVAL = 15000;
    var FEED_UPDATE_INTERVAL_MIN = 15000;
    var FEED_UPDATE_INTERVAL_MAX = 120000;

    var currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN;

    var renderedAtLeastOnce = {};

    var feedIndex = 0;
    
    var consumeFeed = function(userId, filename, feedContents, suppressAudio) {
        var rxStatus = blockslack.authentication.state("rxStatus") || {};
        blockslack.authentication.state("rxStatus", rxStatus);
        var key = userId + "_" + filename;
        var lastRead = rxStatus[key] || 0;
        var hadUpdates = false;
        for (var i = 0; i < feedContents.messages.length; i++) {
            var item = feedContents.messages[i];
            if (item.ts && (item.ts > lastRead)) {
                newMessage(userId, feedContents.audience, item, suppressAudio);
                hadUpdates = true;
                rxStatus[key] = item.ts;
            }
        }

        if (hadUpdates) {
            blockslack.chatui.updateUi();
        }
    };

    var newMessage = function(senderUserId, audience, message, suppressAudio) {
        blockslack.aggregation.newMessage(senderUserId, audience, message, suppressAudio);
    };

    var updateFeed = function(userId, filename, keyId, suppressAudio) {
        return blockslack.feedpub.read(userId, filename, keyId).then(function(feedContents) {
            feedContents.pubsubUrl &&
                blockslack.pubsub.ensureMonitored(userId, filename, keyId, feedContents.pubsubUrl);
            
            consumeFeed(userId, filename, feedContents, suppressAudio);
            
            return Promise.resolve();
        });
    };

    var updateNextFeed = function() {
        var allFeeds = [];
        blockslack.discovery.forEachWatchedFeed(function(userId, filename, keyId) {
            allFeeds.push([ userId, filename, keyId ]);

            var key = userId + "_" + filename + "_" + keyId;
            if (!renderedAtLeastOnce[key]) {
                updateFeed(userId, filename, keyId, /*suppressAudio*/ true);
                renderedAtLeastOnce[key] = true;
            }
        });

        if (allFeeds.length > 0) {
            feedIndex = (feedIndex + 1) >= allFeeds.length ? 0 : feedIndex + 1;
            var selected = allFeeds[feedIndex];
            updateFeed(selected[0], selected[1], selected[2]);
        }

        if (currentFeedUpdateInterval < FEED_UPDATE_INTERVAL_MAX) {
            currentFeedUpdateInterval += 1000;
        }

        setTimeout(updateNextFeed, currentFeedUpdateInterval);
    };

    return {
        
        consumeFeed: function(userId, filename, feedContents) {
            consumeFeed(userId, filename, feedContents);
        },

        onload: function() {
            blockslack.discovery.updateWatchLists();
            blockslack.readstatus.sync();
            updateNextFeed();
            
            setInterval(blockslack.discovery.updateWatchLists, WATCHLIST_UPDATE_INTERVAL);
            setInterval(blockslack.readstatus.sync, READ_STATUS_UPDATE_INTERVAL);

            $(document).mousemove(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).keypress(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).click(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
        },

    };

})();
