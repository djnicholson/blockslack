blockslack.mobile = (function(){

    return {

        isWithinMobileApp: function() {
            return window.isBlockslackApp;
        },

        setBadgeNumber: function(n) {
            if (blockslack.mobile.isWithinMobileApp()) {
                parent.postMessage(JSON.stringify({ badgeNumber: n }), "*");
            }
        },

    };

})();
