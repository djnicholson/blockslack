blockslack.people = (function(){
    
    var APP_URL = window.location.origin;

    var Person = function(userId) {
        var person = this;
        person.userId = userId;
        person.exists = undefined;
        person.blockslackUser = undefined;
        person.image = undefined;
        person.fullName = userId;
        person.pending = true;
        person.dataReady = blockstack.lookupProfile(userId).then(function (blockstackProfile) {
            person.exists = true;
            person.blockslackUser = blockstackProfile.apps[APP_URL] ? true : false;
            blockstackProfile.image && blockstackProfile.image.length && (person.image = blockstackProfile.image[0].contentUrl);
            blockstackProfile.name && (person.fullName = blockstackProfile.name);
            person.pending = false;
        }).catch(function(e) {
            person.exists = false;
            person.blockslackUser = false;
            person.pending = false;
        }).then(function() { return person; });
    };

    return {
        
        lookup: function(userId) {
            return new Person(userId);
        },

    };

})();