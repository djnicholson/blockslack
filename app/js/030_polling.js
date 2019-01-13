blockslack.polling = (function(){

    var WATCHLIST_UPDATE_INTERVAL = 30000;
    var READ_STATUS_UPDATE_INTERVAL = 15000;
    var FEED_UPDATE_INTERVAL_MIN = 15000;
    var FEED_UPDATE_INTERVAL_MAX = 120000;

    var currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN;

    var renderedAtLeastOnce = {};

    var feedIndex = 0;

    var activeIntervals = [];
    var activeTimeout = undefined;
    
    var consumeFeed = function(userId, filename, feedContents, suppressAudio) {
        var key = userId + "_" + filename;
        for (var i = 0; i < feedContents.messages.length; i++) {
            var item = feedContents.messages[i];
            blockslack.aggregation2.newMessage(key, userId, feedContents.audience, item, suppressAudio);
        }
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

        activeTimeout = setTimeout(updateNextFeed, currentFeedUpdateInterval);
    };

    var resumePolling = function() {
        blockslack.discovery.updateWatchLists();
        blockslack.readstatus.sync();
        updateNextFeed();
        
        activeIntervals.push(setInterval(blockslack.discovery.updateWatchLists, WATCHLIST_UPDATE_INTERVAL));
        activeIntervals.push(setInterval(blockslack.readstatus.sync, READ_STATUS_UPDATE_INTERVAL));
    };

    var suspendPolling = function() {
        for (var i = 0; i < activeIntervals.length; i++) {
            clearInterval(activeIntervals[i]);
        }

        activeTimeout && clearTimeout(activeTimeout);

        activeIntervals = [];
        activeTimeout = undefined;
    };

    return {
        
        consumeFeed: function(userId, filename, feedContents) {
            consumeFeed(userId, filename, feedContents);
        },

        onload: function() {
            $(document).mousemove(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).keypress(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
            $(document).click(function() { currentFeedUpdateInterval = FEED_UPDATE_INTERVAL_MIN });
        },

        onsignin: function() {
            suspendPolling();
            blockslack.aggregation2.initialize().then(resumePolling);
        },

        onsignout: function() {
            suspendPolling();
        },

    };

})();
