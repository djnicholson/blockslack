blockslack.authentication = (function(blockstack){

    var REQUIRED_PERMISSIONS = ["store_write", "publish_data"];

    var currentUserState = { };

    var isWithinMobileApp = function() {
        return window.isBlockslackApp;
    };

    var postHandlePendingSignIn = function (newUserData) {
        history.replaceState({}, document.title, "?");
        updateUiAccordingToAuthState();
    };

    var updateUiAccordingToAuthState = function() {
        if (blockstack.isUserSignedIn() && !blockslack.authentication.getUsername()) {
            alert(blockslack.strings.USERNAME_REQUIRED);
        }

        if (blockslack.authentication.isSignedIn()) {
            $(".-only-when-signed-in").show();
            $(".-only-when-signed-out").hide();
            $(".-current-username").text(blockslack.authentication.getUsername());

            // Ensure user has published their public key successfully before app is loaded:
            blockslack.keys.getAsymmetricKey().then(function() {
                console.log("Master key pair available");
            });

            blockslack.polling.onsignin();
        } else {
            $(".-only-when-signed-in").hide();
            $(".-only-when-signed-out").show();
            $(".-current-username").text("");

            blockslack.polling.onsignout();
        }

        blockslack.chatui.updateUi(); // scroll to correct location, etc.
    };

    return {

        getUsername: function() {
            return blockstack.loadUserData().username;
        },
        
        initialize: function() {
            currentUserState = { };
            if (blockstack.isSignInPending()) {
                blockstack.handlePendingSignIn().then(postHandlePendingSignIn);
            } else {
                updateUiAccordingToAuthState();
            }
        },

        isSignedIn: function() {
            return blockstack.isUserSignedIn() && blockslack.authentication.getUsername();
        },

        signIn: function() {
            currentUserState = { };
            var origin = window.location.origin;
            var manifest = origin + "/manifest.json";

            if (isWithinMobileApp()) {
                var authRequest = blockstack.makeAuthRequest(
                    blockstack.generateAndStoreTransitKey(),
                    origin, 
                    manifest, 
                    REQUIRED_PERMISSIONS);
                var message = { 
                    navigate: "https://browser.blockstack.org/auth?authRequest=" + encodeURIComponent(authRequest),
                };
                parent.postMessage(JSON.stringify(message), "*");
            } else {
                blockstack.redirectToSignIn(origin, manifest, REQUIRED_PERMISSIONS);
            }
        },

        signOut: function() {
            blockstack.signUserOut();
            updateUiAccordingToAuthState();
            currentUserState = { };
        },

        state: function(key, value) {
            if (!blockslack.authentication.isSignedIn()) {
                return null;
            } else {

                if (!key) {
                    return currentUserState;
                }

                if (value) {
                    currentUserState[key] = value;
                }

                return currentUserState[key];
            }
        },

    };

})(blockstack);
