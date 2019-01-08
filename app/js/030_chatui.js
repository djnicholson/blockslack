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
    var footerElement = $(".-footer");
    var mainPageElement = $(".-main-page");
    var workAreaElement = $(".-work-area");
    var renameGroupLinkElement = $(".-rename-group");

    var channelDisplayName = function(channelName) {
        var index = channelName.lastIndexOf(":");
        if (index != -1) {
            channelName = channelName.substring(0, index);
        }

        return channelName;
    };

    var formatDate = function(ts) {
        return (new Date(ts)).toLocaleDateString();
    };

    var formatTime = function(ts) {
        var result = (new Date(ts)).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
        if (result.split(":")[0].length == 1) {
            result = "\xa0" + result;
        }

        return result;
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
                if (channelData) {
                    var audience = channelData.currentAudience();
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
            if (groupData.currentTitle) {
                var titleMessage = blockslack.aggregation.generateTitleChangeMessage(
                    currentGroupId, 
                    groupData.currentTitle);
                return blockslack.feedpub.publish(newAudience, titleMessage);
            }
        });
    };

    var removeMember = function(username) {
        if (blockslack.authentication.isSignedIn() && currentGroupId && currentChannelName) {
            var confirmMessage;
            if (blockslack.authentication.getUsername() == username) {
                confirmMessage = blockslack.strings.CONFIRM_REMOVE_SELF
                    .replace("%1", channelDisplayName(currentChannelName));
            } else {
                confirmMessage = blockslack.strings.CONFIRM_REMOVE_MEMBER
                    .replace("%1", username)
                    .replace("%2", channelDisplayName(currentChannelName));
                }

            if (confirm(confirmMessage)) {
                var allData = blockslack.aggregation.getAllData();
                var groupData = allData[currentGroupId];
                if (groupData && groupData.channels) {
                    var channelData = groupData.channels[currentChannelName];
                    if (channelData) {
                        var newAudience = [];
                        var oldAudience = channelData.currentAudience();
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
        var hasUnread = 
            (channelName != currentChannelName) &&
            blockslack.readstatus.hasUnread(currentGroupId, channelName);
        buttonElement.find(".-name").text("#" + channelDisplayName(channelName));
        buttonElement.find(".-unread-indicator").toggle(hasUnread);
        buttonElement.click(function(){ switchChannel(channelName); });
        channelListElement.append(buttonElement);
    };

    var renderCurrentChannel = function(allData) {
        messageListContentElement.empty();
        channelMemberListElement.empty();
        if (!blockslack.authentication.isSignedIn()) {
            return;
        }

        var groupData = allData[currentGroupId];
        if (groupData && groupData.channels) {
            var channelData = groupData.channels[currentChannelName];
            if (channelData) {
                var messages = channelData.messages;
                var audience = channelData.currentAudience();
                var lastPerson = undefined;
                var lastDate = undefined;
                var lastTime = 0;
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
                        lastTime = 0;
                    }

                    var showTime = false;
                    if (message.ts - lastTime > 60000) {
                        showTime = true;
                        lastTime = message.ts;
                    }

                    renderMessage(time, message.text, message.meta, showTime);
                }

                var currentUsername = blockslack.authentication.getUsername();
                var isMember = false;
                for (var member in audience) {
                    var username = audience[member];
                    isMember = isMember || (username == currentUsername);
                    var memberElement = $($("#template-channelMember").html());
                    memberElement.find(".-username").text(username);
                    memberElement.find("a").click(function() { removeMember($(this).parent().find(".-username").text()); });
                    channelMemberListElement.append(memberElement);
                }

                isMember && newMessageElement.focus();
                $(".-show-if-member").toggle(isMember);
                $(".-show-if-not-member").toggle(!isMember);
                $(".-show-if-any-members").toggle(audience.length > 0);
            }
        }
    };

    var renderCurrentGroupChannelList = function(allData) {
        var groupName = "";
        var groupData = allData[currentGroupId];
        channelListElement.empty();
        messageListElement.hide();
        if (groupData) {
            groupName = groupData.currentTitle;
            if (groupData.channels) {
                var sortedChannelNames = sortChannelNames(groupData.channels);
                for (var i = 0; i < sortedChannelNames.length; i++) {
                    currentChannelName = currentChannelName || sortedChannelNames[i];
                    renderChannelButton(sortedChannelNames[i]);
                }

                if (groupData.channels[currentChannelName]) {
                    currentChannelElement.text("#" + channelDisplayName(currentChannelName));
                    messageListElement.show();
                }
            }
        }

        currentGroupElement.text(groupName);
        addChannelButtonElement.toggle(groupName != "");
        renameGroupLinkElement.toggle(currentGroupId ? true : false);
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
            var title = allData[groupId].currentTitle;
            allGroups.push([ groupId, title ]);
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

    var renderMessage = function(time, message, isMeta, showTime) {
        var element = $($("#template-messageText").html());
        element.find(".-message-time").text(time);
        element.find(".-message-text").text(message);
        isMeta && element.find(".-message-text").addClass("-meta");
        !showTime && element.find(".-message-time").css("visibility", "hidden");
        messageListContentElement.append(element);
    };

    var renderPerson = function(person) {
        var element = $($("#template-messagePerson").html());
        element.text(person + ":");
        messageListContentElement.append(element);
    };

    var renderWelcomeArea = function() {
        welcomeAreaElement.toggle(!currentGroupId);
    };

    var sizeElements = function() {
        var bodyHeight = $(document.body).height();
        var footerHeight = footerElement.height();
        var mainPageHeight = Math.max(footerHeight * 2, bodyHeight - footerHeight - 35);
        mainPageElement.height(mainPageHeight);
        workAreaElement.prop("scrollTop", workAreaElement.prop("scrollHeight") - workAreaElement.height() );
        messageListContentElement.css("margin-top", mainPageHeight + "px");
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
        sizeElements();

        $('[data-toggle="tooltip"]').tooltip();
        $(".-loading").hide();
    };

    return {

        addChannel: function() {
            if (blockslack.authentication.isSignedIn() && currentGroupId) {
                var channelName = prompt(blockslack.strings.PICK_CHANNEL_NAME);
                while (channelName.indexOf(" ") != -1) {
                    channelName = channelName.replace(" ", "");
                }

                if (channelName && channelName.length) {
                    if (channelName[0] == "#") {
                        channelName = channelName.substring(1);
                    }

                    if (channelName.length) {
                        channelName += ":" + makeId();
                        var audience = [ blockstack.loadUserData().username ];
                        var message = blockslack.aggregation.generateTextMessage(
                            currentGroupId, 
                            channelName, 
                            blockslack.strings.CHANNEL_WELCOME_PREFIX + channelDisplayName(channelName));
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
                    var message2 = blockslack.aggregation.generateTextMessage(
                        groupId, 
                        "general:" + makeId(), 
                        blockslack.strings.CHANNEL_WELCOME_PREFIX + "general");
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
                        if (channelData) {
                            var oldAudience = channelData.currentAudience();
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
            $(window).on('resize', sizeElements);
            sizeElements();
        },

        renameGroup: function() {
            if (blockslack.authentication.isSignedIn() && currentGroupId) {
                var newName = prompt(blockslack.strings.ENTER_NEW_GROUP_NAME);
                if (newName) {
                    var allData = blockslack.aggregation.getAllData();
                    var groupData = allData[currentGroupId];
                    if (groupData) {
                        var audience = groupData.allMembers();
                        var message = blockslack.aggregation.generateTitleChangeMessage(currentGroupId, newName);
                        blockslack.feedpub.publish(audience, message);
                    }
                }
            }
        },

    };

})();
