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
                owner: username,
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
                owner: username,
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

    var getSymmetricKeyForAudience = function(audience) {
        var currentUsername;
        if (!blockslack.authentication.isSignedIn() || !(currentUsername = blockslack.authentication.getUsername())) {
            return Promise.reject(Error("Must be signed in to generate symmetric keys for other users"));
        }

        var keyCache = getKeyCache();
        
        var derivedKey;

        var deriveKey = getAsymmetricKeyForCurrentUser().then(function(asymmetricKeyForCurrentUser) {
            var derivationPath = asymmetricKeyForCurrentUser.private + "/" + normalizeAudience(audience).join();
            var decryptedSymmetricKey = sha256(derivationPath);
            var symmetricKeyId = sha256(decryptedSymmetricKey).substring(0, 10);
            derivedKey = { id: symmetricKeyId, key: decryptedSymmetricKey, owner: currentUsername };
        });

        var cacheIfRequired = deriveKey.then(function() {
            var cacheKey = currentUsername + "_" + derivedKey.id;
            var currentCacheEntry = keyCache.symmetric[cacheKey];
            if (currentCacheEntry) {
                derivedKey = currentCacheEntry;
            } else {
                keyCache.symmetric[cacheKey] = derivedKey;
            }
        });

        var publishAsRequired = cacheIfRequired.then(function() {
            derivedKey.publishedTo = derivedKey.publishedTo || [];
            var publishPromises = [];
            for (var i = 0; i < audience.length; i++) {
                if (derivedKey.publishedTo.indexOf(audience[i]) == -1) {
                    var publishPromise = getAsymmetricKeyForArbitraryUser(audience[i]).then(function(keyPair) {
                        var publishTo = keyPair.owner;
                        var filename = symmetricKeyFilename(publishTo, derivedKey.id);
                        var content = blockstack.encryptContent(derivedKey.key, { publicKey: keyPair.public });
                        var publishToThisUser = blockstack.putFile(filename, content, { encrypt: false });
                        return publishToThisUser.then(function() { derivedKey.publishedTo.push(publishTo); });
                    });
                    publishPromises.push(publishPromise);
                }
            }

            return Promise.all(publishPromises);
        });

        return publishAsRequired.then(function() { return Promise.resolve(derivedKey); });
    };

    var getSymmetricKeyFromUser = function(keyOwnerUsername, symmetricKeyId) {
        var currentUsername;
        if (!blockslack.authentication.isSignedIn() || !(currentUsername = blockslack.authentication.getUsername())) {
            return Promise.reject(Error("Must be signed in to retrieve symmetric keys from other users"));
        }

        var keyCache = getKeyCache();
        var cacheKey = keyOwnerUsername + "_" + symmetricKeyId;
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
            var result = { id: symmetricKeyId, key: decryptedSymmetricKey, owner: keyOwnerUsername };
            keyCache[cacheKey] = result;
            return Promise.resolve(result);
        });
    };

    var normalizeAudience = function(audience) {
        var audienceClone = audience.slice();
        audienceClone.sort(function(a, b){ return a[1] > b[1] ? 1 : -1; });
        return audienceClone;
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

        /**
         * Returns a promise that resolves to an object of the form:
         *  { public: "...", private: "...", owner: "..." }
         * Where:
         *  public is the public portion of the EC key pair
         *  private is the private portion of the EC key pair, and may be undefined if unknown
         *  owner is the username of the person who generated the key
         *
         * If the username parameter is undefined then they key pair for the current user is
         * returned.  If the current user has never generated a key pair, then a new key pair
         * will be generated and returned.
         *
         * The returned promise resolving is a guarantee that the corresponding private portion
         * has been persisted by the owner, and that the public portion has been publically 
         * published.
         *
         * An internal cache is used; subsequent lookups for a key pair that has already been
         * retrieved within the current session will not incur any network cost.
         */
        getAsymmetricKey: function(username) {
            if (username) {
                return getAsymmetricKeyForArbitraryUser(username);
            } else {
                return getAsymmetricKeyForCurrentUser().then(publishPublicKeyIfNotDoneYetThisSession);
            }
        },

        /**
         * Returns a promise that resolves to an object of the form:
         *  { id: "...", key: "...", owner: "...", publishedTo: [ "...", ... ] }
         * Where:
         *  id is a unique identifier for the key (a hash of the key) that can be made public
         *  key is the actual key and should be kept secret
         *  owner is the username of the person who generated the key
         *  publishedTo is an array of usernames that they key has been published to during this
         *    session (and may be undefined)
         *
         * An internal cache is used; subsequent lookups for a key that has already been
         * retrieved within the current session will not incur any network cost.
         */
        getSymmetricKeyFromUser: function(keyOwnerUsername, symmetricKeyId) {
            return getSymmetricKeyFromUser(keyOwnerUsername, symmetricKeyId);
        },

        /**
         * Returns a promise that resolves to an object of the form:
         *  { id: "...", key: "...", owner: "...", publishedTo: [ "...", ... ] }
         * Where:
         *  id is a unique identifier for the key (a hash of the key) that can be made public
         *  key is the actual key and should be kept secret
         *  owner is the username of the current user
         *  publishedTo is an array of usernames that they key has been published to
         *
         * An internal cache is used; subsequent lookups for a key that has already been
         * generated within the current session will not incur any network cost.
         *
         * The returned promise resolving is a guarantee that all entries in audience were
         * valid usernames and that the key has been published to each of these users.
         * If the returned promise rejects, the key may still have been published to some
         * members of audience; only those that failed will be retried upon any subsequent 
         * invocation.
         */
        getSymmetricKeyForAudience: function(audience) {
            return getSymmetricKeyForAudience(audience);
        },

    };

})();
