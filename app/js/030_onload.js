blockslack.onload = (function(){

    return {
        
        go: function() {
            blockslack.authentication.initialize();
            blockslack.polling.onload();
            blockslack.chatui.onload();
        },

    };

})();
