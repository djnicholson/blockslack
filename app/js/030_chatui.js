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
    var welcomeAreaElement = $(".-welcome");

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

    var publishAudienceChange = function(oldAudience, newAudience) {
        var allData = blockslack.aggregation.getAllData();
        var groupData = allData[currentGroupId];
        var message = blockslack.aggregation.generateAudienceChangeMessage(
            currentGroupId,
            currentChannelName,
            newAudience);
        return blockslack.feedpub.publish(oldAudience, message).then(function() {
            return blockslack.feedpub.publish(newAudience, message);    
        }).then(function() {
            if (groupData.title && groupData.title.title) {
                var titleMessage = blockslack.aggregation.generateTitleChangeMessage(
                    currentGroupId, 
                    groupData.title.title);
                return blockslack.feedpub.publish(newAudience, titleMessage);
            }
        });
    };

    var removeMember = function(username) {
        if (blockslack.authentication.isSignedIn() && currentGroupId && currentChannelName) {
            var confirmMessage = blockslack.strings.CONFIRM_REMOVE_MEMBER
                .replace("%1", username)
                .replace("%2", currentChannelName);
            if (confirm(confirmMessage)) {
                var allData = blockslack.aggregation.getAllData();
                var groupData = allData[currentGroupId];
                if (groupData && groupData.channels) {
                    var channelData = groupData.channels[currentChannelName];
                    if (channelData && channelData.audience && channelData.audience.members) {
                        var newAudience = [];
                        var oldAudience = channelData.audience.members;
                        for (var member in oldAudience) {
                            if (oldAudience[member] != username) {
                                newAudience.push(oldAudience[member]);
                            }
                        }

                        return publishAudienceChange(oldAudience, newAudience);
                    }
                }
            } else {
                updateUi();
            }
        }
    };

    var renderChannelButton = function(channelName) {
        var buttonElement = $($("#template-channelButton").html());
        var asterisk = 
            (channelName != currentChannelName) &&
            blockslack.readstatus.hasUnread(currentGroupId, channelName) ? "*" : "";
        buttonElement.text("#" + channelName + asterisk);
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

                var currentUsername = blockslack.authentication.getUsername();
                var isMember = false;
                channelMemberListElement.empty();
                if (audience.members) {
                    for (var member in audience.members) {
                        var username = audience.members[member];
                        isMember = isMember || (username == currentUsername);
                        var memberElement = $($("#template-channelMember").html());
                        memberElement.find(".-username").text(username);
                        memberElement.find("a").click(function() { removeMember($(this).parent().find(".-username").text()); });
                        channelMemberListElement.append(memberElement);
                    }
                }

                $(".-show-if-member").toggle(isMember);
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
                var sortedChannelNames = sortChannelNames(groupData.channels);
                for (var i = 0; i < sortedChannelNames.length; i++) {
                    currentChannelName = currentChannelName || sortedChannelNames[i];
                    renderChannelButton(sortedChannelNames[i]);
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

    var renderWelcomeArea = function() {
        welcomeAreaElement.toggle(currentGroupId == undefined);
    };

    var sortChannelNames = function(channelData) {
        var toSort = [];
        for (var channelName in channelData) {
            var ts = 0;
            var messages = channelData[channelName].messages;
            if (messages.length) {
                ts = messages[messages.length - 1].ts;
            }

            toSort.push([ channelName, ts]);
        }

        toSort.sort(function(a, b) { return b[1] - a[1] });
        var toReturn = [];
        for (var i = 0; i < toSort.length; i++) {
            toReturn.push(toSort[i][0]);
        }

        return toReturn;
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
        currentGroupId && currentChannelName && blockslack.readstatus.markRead(currentGroupId, currentChannelName);
        renderGroupButtons(allData);
        renderCurrentGroupChannelList(allData);
        renderCurrentChannel(allData);
        renderWelcomeArea();
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
                        blockslack.feedpub.publish(audience, message).then(function() {
                            switchChannel(channelName);
                        });
                    }
                }
            }
        },

        addContact: function() {
            if (blockslack.authentication.isSignedIn()) {
                var username = prompt(blockslack.strings.ENTER_CONTACT_NAME);
                if (username && username.length) {
                    blockslack.discovery.addContact(username);
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
                    blockslack.feedpub.publish(audience, message1).then(function() {
                        return blockslack.feedpub.publish(audience, message2);    
                    }).then(function() {
                        switchGroup(groupId);
                    });
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
                            publishAudienceChange(oldAudience, newAudience);
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
