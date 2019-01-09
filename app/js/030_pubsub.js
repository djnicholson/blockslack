blockslack.pubsub = (function(){
    
    // privates:
    // var foo = ...
    // var bar = ...

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        ensureMonitored: function(hostUserId, filename, keyId, serverUrl) {
            console.log("***", "ensureMonitored", hostUserId, filename, keyId, serverUrl);
        },

        getServerUrl: function() {
            // TODO: Allow users to choose their own URL
            return "ws://127.0.0.1:80";
        },

        notifyPublish: function(filename, keyId, serverUrl) {
            var hostUserId = blockslack.authentication.getUsername();
            console.log("***", "notifyPublish", hostUserId, filename, keyId, serverUrl);
        },

    };

})();
