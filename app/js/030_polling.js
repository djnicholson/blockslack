blockslack.polling = (function(){
    
    // privates:

    var WATCHLIST_UPDATE_INTERVAL = 30000;
    var FEED_UPDATE_INTERVAL_MIN = 1500;
    var FEED_UPDATE_INTERVAL_MAX = 15000;

    var currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN;

    var renderedAtLeastOnce = {};

    var feedIndex = 0;
    
    var consumeFeed = function(userId, filename, keyId, feedContents) {
        var rxStatus = blockslack.authentication.state("rxStatus") || {};
        blockslack.authentication.state("rxStatus", rxStatus);
        var key = userId + "_" + filename + "_" + keyId;
        var lastRead = rxStatus[key] || 0;
        for (var i = 0; i < feedContents.messages.length; i++) {
            var item = feedContents.messages[i];
            if (item.ts && (item.ts > lastRead)) {
                newMessage(userId, feedContents.audience, item);
                rxStatus[key] = item.ts;
            }
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
            feedIndex = (feedIndex + 1) >= allFeeds.length ? 0 : feedIndex + 1;
            var selected = allFeeds[feedIndex];
            updateFeed(selected[0], selected[1], selected[2]);
        }

        if (currentFeedUpdateInterval < FEED_UPDATE_INTERVAL_MAX) {
            currentFeedUpdateInterval += 1000;
        }

        setTimeout(updateRandomFeed, currentFeedUpdateInterval);
    };

    return {

        // publics:
        
        forceReadFeed: function(userId, filename, keyId) {
            updateFeed(userId, filename, keyId);
        },

        onload: function() {
            blockslack.discovery.updateWatchLists();
            updateRandomFeed();
            setInterval(blockslack.discovery.updateWatchLists, WATCHLIST_UPDATE_INTERVAL);
            setTimeout(updateRandomFeed, currentFeedUpdateInterval);
            $(document).mousemove(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).keypress(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).click(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
        },

    };

})();
