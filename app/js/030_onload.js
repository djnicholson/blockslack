blockslack.onload = (function(){

    return {
        
        go: function() {
            blockslack.authentication.initialize();
            blockslack.polling.onload();
            blockslack.chatui.onload();
            
            // Ensure user has published their public key successfully before app is loaded:
            blockslack.keys.getAsymmetricKey().then(function() {
                $(".-loading").hide();
            });
        },

    };

})();
