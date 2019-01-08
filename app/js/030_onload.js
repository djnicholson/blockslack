blockslack.onload = (function(){
    
    // privates:
    // var foo = ...
    // var bar = ...    

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:
        
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
