blockslack.authentication = (function(blockstack){
    
    // privates:

    var REQUIRED_PERMISSIONS = ["store_write", "publish_data"];

    var currentUserState = { };

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
        } else {
            $(".-only-when-signed-in").hide();
            $(".-only-when-signed-out").show();
            $(".-current-username").text("");
        }

        blockslack.chatui.updateUi(); // scroll to correct location, etc.
    };

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:

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
            blockstack.redirectToSignIn(
                origin,
                origin + "/manifest.json",
                REQUIRED_PERMISSIONS);
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
