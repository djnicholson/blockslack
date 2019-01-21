blockslack.localsettings = (function(){

    var PREFIX = "blockslack.localsettings."; 

    return {

        get: function(key) {
            var scopedKey = PREFIX + key;
            var value = localStorage.getItem(scopedKey);
            console.log("Read " + scopedKey + "=" + value);
            return value;
        },

        set: function(key, value) {
            var scopedKey = PREFIX + key;
            localStorage.setItem(scopedKey, value);
            console.log("Wrote " + scopedKey + "=" + value);
            return value;
        },

    };

})();
