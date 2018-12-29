blockslack.chatui = (function(){

    var currentGroupId = undefined;
    var currentChannelName = undefined;

    var currentChannelElement = $(".-current-channel-name");
    var currentGroupElement = $(".-current-group-name");
    var addChannelButtonElement = $(".-add-channel-button");
    var groupButtonListElement = $(".-group-buttons");
    var channelListElement = $(".-channel-buttons");
    var messageListElement = $(".-message-list");
    var messageListContentElement = $(".-message-list-content");
    var newMessageElement = $(".-new-message");
    var channelMemberListElement = $(".-channel-member-list");

    var formatDate = function(ts) {
        return (new Date(ts)).toLocaleDateString();
    };

    var formatTime = function(ts) {
        return (new Date(ts)).toLocaleTimeString();
    };

    var makeId = function() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    var newMessageKeyPress = function(e) {
        e = e || window.event;
        var keyCode = e.keyCode || e.which;
        if (keyCode == '13' && currentGroupId && currentChannelName) {
            var message = blockslack.aggregation.generateTextMessage(
                currentGroupId, 
                currentChannelName, 
                newMessageElement.val());
            var allData = blockslack.aggregation.getAllData();
            var groupData = allData[currentGroupId];
            if (groupData && groupData.channels) {
                var channelData = groupData.channels[currentChannelName];
                if (channelData && channelData.audience && channelData.audience.members) {
                    var audience = channelData.audience.members;
                    newMessageElement.prop("disabled", true);
                    blockslack.feedpub.publish(audience, message).then(function() {
                        newMessageElement.prop("disabled", false);
                        newMessageElement.val("");
                        newMessageElement.focus();
                    }).catch(function(e) {
                        newMessageElement.prop("disabled", false);
                        newMessageElement.focus();
                    });
                }
            }
        }
    };

    var renderChannelButton = function(channelName) {
        var buttonElement = $($("#template-channelButton").html());
        buttonElement.text("#" + channelName);
        buttonElement.click(function(){ switchChannel(channelName); });
        channelListElement.append(buttonElement);
    };

    var renderCurrentChannel = function(allData) {
        messageListContentElement.empty();
        var groupData = allData[currentGroupId];
        if (groupData && groupData.channels) {
            var channelData = groupData.channels[currentChannelName];
            if (channelData) {
                var messages = channelData.messages;
                var audience = channelData.audience;
                var lastPerson = undefined;
                var lastDate = undefined;
                for (var i = 0; i < messages.length; i++) {
                    var message = messages[i];
                    var person = message.from;
                    var date = formatDate(message.ts);
                    var time = formatTime(message.ts);
                    
                    if (date != lastDate) {
                        renderDate(date);
                        lastDate = date;
                        lastPerson = undefined;
                    }

                    if (person != lastPerson) {
                        renderPerson(person);
                        lastPerson = person;
                    }

                    renderMessage(time, message.text);
                }

                channelMemberListElement.empty();
                if (audience.members) {
                    for (var member in audience.members) {
                        var memberElement = $($("#template-channelMember").html());
                        memberElement.text(audience.members[member]);
                        channelMemberListElement.append(memberElement);
                    }
                }
            }
        }
    };

    var renderCurrentGroupChannelList = function(allData) {
        var groupName = "";
        var groupData = allData[currentGroupId];
        channelListElement.empty();
        messageListElement.hide();
        if (groupData) {
            var titleData = groupData.title;
            groupName = titleData && titleData.title ? titleData.title : blockslack.strings.FALLBACK_GROUP_NAME;
            if (groupData.channels) {
                for (var channelName in groupData.channels) {
                    renderChannelButton(channelName);
                }

                if (groupData.channels[currentChannelName]) {
                    currentChannelElement.text("#" + currentChannelName);
                    messageListElement.show();
                }
            }
        }

        currentGroupElement.text(groupName);
        addChannelButtonElement.toggle(groupName != "");
    };

    var renderDate = function(date) {
        var element = $($("#template-messageDate").html());
        element.text(date + ":");
        messageListContentElement.append(element);
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

    var renderMessage = function(time, message) {
        var element = $($("#template-messageText").html());
        element.find(".-message-time").text(time);
        element.find(".-message-text").text(message);
        messageListContentElement.append(element);
    };

    var renderPerson = function(person) {
        var element = $($("#template-messagePerson").html());
        element.text(person + ":");
        messageListContentElement.append(element);
    };

    var switchChannel = function(newChannelName) {
        currentChannelName = newChannelName;
        newMessageElement.val("");
        updateUi();
    };

    var switchGroup = function(newGroupId) {
        currentGroupId = newGroupId;
        currentChannelName = undefined;
        newMessageElement.val("");
        updateUi();
    };

    var updateUi = function() {
        $(".tooltip").hide();
        var allData = blockslack.aggregation.getAllData();
        renderGroupButtons(allData);
        renderCurrentGroupChannelList(allData);
        renderCurrentChannel(allData);
        $('[data-toggle="tooltip"]').tooltip();
    };

    return {

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
                    //
                    // TODO: This doesn't work, there is a race condition where the second publish will append
                    //       itself to a file that does not include the first message. Probably need to thread
                    //       promises all the way through.
                    //
                }
            }
        },

        addMember: function() {
            if (blockslack.authentication.isSignedIn() && currentGroupId && currentChannelName) {
                var newMember = prompt(blockslack.strings.ENTER_NEW_MEMBER_NAME);
                if (newMember) {
                    var allData = blockslack.aggregation.getAllData();
                    var groupData = allData[currentGroupId];
                    if (groupData && groupData.channels) {
                        var channelData = groupData.channels[currentChannelName];
                        if (channelData && channelData.audience && channelData.audience.members) {
                            var oldAudience = channelData.audience.members;
                            var newAudience = oldAudience.slice();
                            newAudience.push(newMember);
                            var message = blockslack.aggregation.generateAudienceChangeMessage(
                                currentGroupId,
                                currentChannelName,
                                newAudience);
                            blockslack.feedpub.publish(oldAudience, message);
                            blockslack.feedpub.publish(newAudience, message);
                            if (groupData.title && groupData.title.title) {
                                var titleMessage = blockslack.aggregation.generateTitleChangeMessage(
                                    currentGroupId, 
                                    groupData.title.title);
                                blockslack.feedpub.publish(newAudience, titleMessage);
                            }
                        }
                    }
                }
            }
        },

        updateUi: function() {
            updateUi();
        },

        onload: function() {
            newMessageElement.keypress(newMessageKeyPress);
        },

    };

})();
