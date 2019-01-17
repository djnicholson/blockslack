blockslack.authentication = (function(blockstack){

    var REQUIRED_PERMISSIONS = ["store_write", "publish_data"];

    var currentUserState = { };

    var withinApp = false; // remember that we are within the app, even if the fragment gets lost

    var isWithinMobileApp = function() {
        withinApp = withinApp || window.location.hash.startsWith("#app");
        return withinApp;
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
            isWithinMobileApp();
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
            blockstack.redirectToSignIn(
                origin + (isWithinMobileApp() ? "/appredirect.html" : ""),
                origin + "/manifest.json",
                REQUIRED_PERMISSIONS);
        },

        signOut: function() {
            var inApp = isWithinMobileApp();
            blockstack.signUserOut();
            updateUiAccordingToAuthState();
            currentUserState = { };
            if (inApp) {
                window.location.hash = "#app";
            }
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
