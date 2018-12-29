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
            return Promise.reject(Error("Could not retrieve public key for " + username + "; " + e));
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
        var keyCache = blockslack.authentication.state("keyCache") || { symmetric: {}, asymmetric: {} };
        blockslack.authentication.state("keyCache", keyCache);
        return keyCache;
    };

    var getSymmetricKeyFromUser = function(keyOwnerUsername, symmetricKeyId) {
        var currentUsername;
        if (!blockslack.authentication.isSignedIn() || !(currentUsername = blockslack.authentication.getUsername())) {
            return Promise.reject(Error("Must be signed in to retrieve symmetric keys from other users"));
        }

        var keyCache = getKeyCache();
        var cacheKey = keyOwnerUsername+ "_" + symmetricKeyId;
        var fromCache = keyCache.symmetric[cacheKey];
        if (fromCache) {
            return Promise.resolve(fromCache);
        }

        var filename = symmetricKeyFilename(currentUsername, symmetricKeyId);
        var getFileOptions = { decrypt: false, username: keyOwnerUsername };
        var getEncryptedSymmetricKey = blockstack.getFile(filename, getFileOptions).then(function(encryptedSymmetricKey) {
            if (encryptedSymmetricKey) {
                return Promise.resolve(encryptedSymmetricKey);
            } else {
                return Promise.reject(Error("Key " + symmetricKeyId + " has not ben published by " + keyOwnerUsername));
            }
        }).catch(function(e){
            return Promise.reject(Error("Could not retrieve key " + symmetricKeyId + " from " + keyOwnerUsername + "; " + e));
        });

        var getDecryptedSymmetricKey = Promise.all([ getEncryptedSymmetricKey, getAsymmetricKeyForCurrentUser() ]).then(function(results) {
            var encryptedSymmetricKey = results[0];
            var asymmetricKeyForCurrentUser = results[1];
            var decryptedSymmetricKey = blockstack.decryptContent(
                encryptedSymmetricKey, 
                { privateKey: asymmetricKeyForCurrentUser.private });
            return Promise.resolve(decryptedSymmetricKey);
        });

        return getDecryptedSymmetricKey.then(function(decryptedSymmetricKey) {
            var result = { id: symmetricKeyId, key: decryptedSymmetricKey };
            keyCache[cacheKey] = result;
            return Promise.resolve(result);
        });
    };

    var publishPublicKeyIfNotDoneYetThisSession = function(masterAsymmetricKeyPair) {
        if (!masterAsymmetricKeyPair.published) {
            var uploadPublicKey = blockstack.putFile(
                MASTER_PUBLIC_KEY_FILE, 
                masterAsymmetricKeyPair.public, 
                { encrypt: false });
            return uploadPublicKey.then(function() { 
                masterAsymmetricKeyPair.published = true; 
                return Promise.resolve(masterAsymmetricKeyPair); 
            });
        } else {
            return Promise.resolve(masterAsymmetricKeyPair);
        }
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
                return getAsymmetricKeyForCurrentUser().then(publishPublicKeyIfNotDoneYetThisSession);
            }
        },

        getSymmetricKeyFromUser: function(keyOwnerUsername, symmetricKeyId) {
            return getSymmetricKeyFromUser(keyOwnerUsername, symmetricKeyId);
        },

        withSymmetricKeyForAudience: function(audience, action) {
            
        },

    };

})();
