blockslack.keys = (function(){
    
    // privates:
    
    var MASTER_PRIVATE_KEY_FILE = "keys/_private.txt";
    var MASTER_PUBLIC_KEY_FILE = "keys/_public.txt";
    var SYMMETRIC_KEY_FILE_FORMAT = "keys/%1.txt";

    var publicKeyCache = {};

    var ensureSymmetricKeyPublished = function(symmetricKeyId, symmetricKey, audience) {
        for (var i = 0; i < audience.length; i++) {
            withPublicKeyForUser(audience[i], function(recipient, publicKey) {
                if (publicKey) {
                    var filename = symmetricKeyFilename(recipient, symmetricKeyId);
                    console.log("Publishing key " + symmetricKeyId + " for " + recipient + " to " + filename + " (encrypted with public key: " + publicKey + ")");
                    blockstack.putFile(
                        filename,
                        blockstack.encryptContent(symmetricKey, { publicKey: publicKey }),
                        { encrypt: false });
                } else {
                    console.log(recipient + " does not have a public key, not publishing symmetric key for them");
                }
            });
        }
    }

    var sha256 = function(input) {
        return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(input));
    }

    var symmetricKeyFilename = function(userId, keyId) {
        return SYMMETRIC_KEY_FILE_FORMAT.replace("%1", sha256(userId + "_" + keyId));
    };

    var withMasterPrivateKey = function(action) {
        var masterKey = blockslack.authentication.state("masterKey");
        if (masterKey) {
            action(masterKey);
        } else {
            blockstack.getFile(MASTER_PRIVATE_KEY_FILE).then(function(existingMasterKey) {
                if (existingMasterKey) {
                    blockslack.authentication.state("masterKey", existingMasterKey);
                    action(existingMasterKey);
                } else {
                    var newMasterKey = blockstack.makeECPrivateKey();
                    blockslack.authentication.state("masterKey", newMasterKey);
                    blockstack.putFile(MASTER_PRIVATE_KEY_FILE, newMasterKey);
                    action(newMasterKey);
                }
            });
        }
    };

    var withPublicKeyForUser = function(userId, action) {
        if (publicKeyCache[userId]) {
            action(userId, publicKeyCache[userId]);
        } else {
            var getFileOptions = { decrypt: false, username: userId };
            var onSuccess = function(publicKey) {
                publicKeyCache[userId] = publicKey;
                console.log("Discovered public key for " + userId + ": " + publicKey);
                action(userId, publicKey);
            };
            var onError = function() {
                console.log("Could not retrieve public files for user " + userId);
                action(userId, null);
            };
            blockstack.getFile(MASTER_PUBLIC_KEY_FILE, getFileOptions).then(onSuccess).catch(onError);
        }
    };

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:
        
        initialize: function() {
            withMasterPrivateKey(function(masterPrivateKey) { 
                var publicKey = blockstack.getPublicKeyFromPrivate(masterPrivateKey);
                console.log("My public key: " + publicKey);
                blockstack.putFile(
                    MASTER_PUBLIC_KEY_FILE,
                    publicKey,
                    { encrypt: false }); 
            });
        },

        withSymmetricKeyFromUser: function(keyOwnerUserId, symmetricKeyId, action) {
            var symmetricKeyCache = blockslack.authentication.state("symmetricKeyCache") || {};
            blockslack.authentication.state("symmetricKeyCache", symmetricKeyCache);
            var cacheKey = keyOwnerUserId + "_" + symmetricKeyId;
            if (symmetricKeyCache[cacheKey]) {
                action(symmetricKeyCache[cacheKey]);
            } else {
                var myUserId = blockstack.loadUserData().username;
                var filename = symmetricKeyFilename(myUserId, symmetricKeyId);
                withMasterPrivateKey(function(masterPrivateKey) {
                    var getFileOptions = { decrypt: false, username: keyOwnerUserId };
                    var onSuccess = function(encryptedSymmetricKey) {
                        var symmetricKey = blockstack.decryptContent(encryptedSymmetricKey, { privateKey: masterPrivateKey });
                        symmetricKeyCache[cacheKey] = symmetricKey;
                        action(symmetricKey);
                    };
                    var onError = function(error) {
                        console.log("Could not retrieve symmetric key " + symmetricKeyId + " from " + keyOwnerUserId, error);
                        action(null);
                    };
                    blockstack.getFile(filename, getFileOptions).then(onSuccess).catch(onError);
                });
            }
        },

        withSymmetricKeyForAudience: function(audience, action) {
            var audienceClone = audience.slice();
            audienceClone.sort(function(a, b){ return a[1] > b[1] ? 1 : -1; });
            withMasterPrivateKey(function(masterPrivateKey) { 
                var derivation = masterPrivateKey + "/" + audienceClone.join();
                var key = sha256(derivation);
                var id = sha256(key);
                ensureSymmetricKeyPublished(id, key, audienceClone);
                action({ id: id, key: key });
            });
        },

    };

})();
