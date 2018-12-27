blockslack.chatui = (function(){
    
    // privates:

    var UI_UPDATE_INTERVAL = 2500;

    var currentGroupId = undefined;
    var currentChannelName = undefined;

    var currentChannelElement = $(".-current-channel-name");
    var currentGroupElement = $(".-current-group-name");
    var addChannelButtonElement = $(".-add-channel-button");
    var groupButtonListElement = $(".-group-buttons");
    var channelListElement = $(".-channel-buttons");
    var messageListHeaderElement = $(".-message-list-header");

    var makeId = function() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    var renderChannelButton = function(channelName) {
        var buttonElement = $($("#template-channelButton").html());
        buttonElement.text("#" + channelName);
        buttonElement.click(function(){ switchChannel(channelName); });
        channelListElement.append(buttonElement);
    };

    var renderCurrentGroupChannelList = function(allData) {
        var groupName = "";
        var groupData = allData[currentGroupId];
        channelListElement.empty();
        messageListHeaderElement.hide();
        if (groupData) {
            var titleData = groupData.title;
            groupName = titleData && titleData.title ? titleData.title : blockslack.strings.FALLBACK_GROUP_NAME;
            if (groupData.channels) {
                for (var channelName in groupData.channels) {
                    renderChannelButton(channelName);
                }

                if (groupData.channels[currentChannelName]) {
                    currentChannelElement.text("#" + currentChannelName);
                    messageListHeaderElement.show();
                }
            }
        }

        currentGroupElement.text(groupName);
        addChannelButtonElement.toggle(groupName != "");
    };

    var renderGroupButtons = function(allData) {
        groupButtonListElement.empty();

        var allGroups = [];
        for (var groupId in allData) {
            var titleData = allData[groupId].title;
            allGroups.push([ groupId, titleData && titleData.title ? titleData.title : blockslack.strings.FALLBACK_GROUP_NAME ]);
        }

        allGroups.sort(function(a, b){ return a[1] > b[1] ? 1 : -1; });
        for (var i = 0; i < allGroups.length; i++) {
            renderGroupButton(allGroups[i]);
        }
    };

    var renderGroupButton = function(groupData) {
        var buttonElement = $($("#template-groupButton").html());
        buttonElement.text(groupData[1].charAt(0).toUpperCase());
        buttonElement.click(function(){ switchGroup(groupData[0]); });
        buttonElement.attr("title", groupData[1]);
        groupButtonListElement.append(buttonElement);
    };

    var switchChannel = function(newChannelName) {
        currentChannelName = newChannelName;
    };

    var switchGroup = function(newGroupId) {
        currentGroupId = newGroupId;
        currentChannelName = undefined;
    };

    var updateUi = function() {
        $(".tooltip").hide();
        var allData = blockslack.aggregation.getAllData();
        renderGroupButtons(allData);
        renderCurrentGroupChannelList(allData);
        $('[data-toggle="tooltip"]').tooltip();
    };

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:
        
        addChannel: function() {
            if (blockslack.authentication.isSignedIn() && currentGroupId) {
                var channelName = prompt(blockslack.strings.PICK_CHANNEL_NAME);
                if (channelName && channelName.length) {
                    if (channelName[0] == "#") {
                        channelName = channelName.substring(1);
                    }

                    if (channelName.length) {
                        var audience = [ blockstack.loadUserData().username ];
                        var message = blockslack.aggregation.generateTextMessage(currentGroupId, channelName, blockslack.strings.CHANNEL_WELCOME_PREFIX + channelName);
                        blockslack.feedpub.publish(audience, message);
                    }
                }
            }
        },

        addGroup: function() {
            if (blockslack.authentication.isSignedIn()) {
                var groupName = prompt(blockslack.strings.PICK_GROUP_NAME);
                if (groupName && groupName.length) {
                    var groupId = makeId();
                    var audience = [ blockstack.loadUserData().username ];
                    var message1 = blockslack.aggregation.generateTitleChangeMessage(groupId, groupName);
                    var message2 = blockslack.aggregation.generateTextMessage(groupId, "general", blockslack.strings.CHANNEL_WELCOME_PREFIX + "general");
                    blockslack.feedpub.publish(audience, message1);
                    blockslack.feedpub.publish(audience, message2);
                }
            }
        },

        onload: function() {
            setInterval(updateUi, UI_UPDATE_INTERVAL);
        },

    };

})();
