blockslack.localsettings = (function(){

    var PREFIX = "blockslack.localsettings."; 

    return {

        get: function(key) {
            return localStorage.getItem(PREFIX + key);
        },

        set: function(key, value) {
            localStorage.setItem(PREFIX + key, value);
            return value;
        },

    };

})();
