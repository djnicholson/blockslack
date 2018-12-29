blockslack.keysasync = (function(){
    
    // privates:
    
    var MASTER_PRIVATE_KEY_FILE = "keys/_private.txt";
    var MASTER_PUBLIC_KEY_FILE = "keys/_public.txt";
    var SYMMETRIC_KEY_FILE_FORMAT = "keys/%1.txt";

    var getAsymmetricKeyForArbitraryUser = function(username) {
        var keyCache = getKeyCache();
        var fromCache = keyCache.asymmetric[username];
        if (fromCache) {
            return Promise.resolve(fromCache);
        }

        var getFileOptions = { decrypt: false, username: username };
        var getPublicKey = blockstack.getFile(MASTER_PUBLIC_KEY_FILE, getFileOptions).then(function(publicKey) {
            if (publicKey) {
                return Promise.resolve(publicKey);
            } else {
                return Promise.reject(Error(username + " has not published their public key"));
            }
        }).catch(function(e) {
            return Promise.reject(Error("Could not retrieve public key for " + username + " (not a user of this app?); error: " + e));
        });

        return getPublicKey.then(function(publicKey) {
            var result = { 
                public: publicKey, 
                private: undefined,
            };

            keyCache.asymmetric[username] = result;
            return Promise.resolve(result);
        });
    };

    var getAsymmetricKeyForCurrentUser = function() {
        var username;
        if (!blockslack.authentication.isSignedIn() || !(username = blockslack.authentication.getUsername())) {
            return Promise.reject(Error("Must be signed in to retrieve current user's keypair"));
        }

        var keyCache = getKeyCache();
        var fromCache = keyCache.asymmetric[username];
        if (fromCache) {
            return Promise.resolve(fromCache);
        }

        var getPrivateKey = blockstack.getFile(MASTER_PRIVATE_KEY_FILE).then(function(existingMasterKey) {
            if (existingMasterKey) {
                return Promise.resolve(existingMasterKey);
            } else {
                var newMasterKey = blockstack.makeECPrivateKey();
                var uploadNewKey = blockstack.putFile(MASTER_PRIVATE_KEY_FILE, newMasterKey);
                return uploadNewKey.then(function() { return Promise.resolve(newMasterKey); });
            }
        });

        return getPrivateKey.then(function(masterPrivateKey) {
            var result = { 
                public: blockstack.getPublicKeyFromPrivate(masterPrivateKey), 
                private: masterPrivateKey,
            };

            keyCache.asymmetric[username] = result;
            return Promise.resolve(result);
        });
    };

    var getKeyCache = function() {
        var cache = blockslack.authentication.state("keyCache") || { symmetric: {}, asymmetric: {} };
        blockslack.authentication.state("keyCache", cache);
        return cache;
    };

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    };

    var symmetricKeyFilename = function(userId, keyId) {
        return SYMMETRIC_KEY_FILE_FORMAT.replace("%1", sha256(userId + "_" + keyId));
    };

   

    return {

        // publics:
        
        initialize: function() {
            
        },

        getAsymmetricKey: function(username) {
            if (username) {
                return getAsymmetricKeyForArbitraryUser(username);
            } else {
                return getAsymmetricKeyForCurrentUser();
            }
        },

        withMasterKey: function(action) {
            
        },

        withPublicKeyForUser: function(userId, action) {
            
        },

        withSymmetricKeyFromUser: function(keyOwnerUserId, symmetricKeyId, action) {
            
        },

        withSymmetricKeyForAudience: function(audience, action) {
            
        },

    };

})();
