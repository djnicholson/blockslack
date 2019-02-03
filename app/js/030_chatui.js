blockslack.chatui = (function(){

    var FLASH_SPEED = 750;

    var currentGroupId = undefined;
    var currentChannelName = undefined;
    var hasUnread = false;
    var shortScreen = false;

    var currentChannelElement = $(".-current-channel-name");
    var currentGroupElement = $(".-current-group-name");
    var currentGroupHolderElement = $(".-current-group-name-holder");
    var addChannelButtonElement = $(".-add-channel-button");
    var groupButtonListElement = $(".-group-buttons");
    var channelListElement = $(".-channel-buttons");
    var messageListElement = $(".-message-list");
    var messageListContentElement = $(".-message-list-content");
    var newMessageElement = $(".-new-message");
    var channelMemberListElement = $(".-channel-member-list");
    var welcomeAreaElement = $(".-welcome");
    var footerPlaceholderElements = $(".-footer-goes-here");
    var mainPageElement = $(".-main-page");
    var workAreaElement = $(".-work-area");
    var inputAreaElement = $(".-input-area");
    var renameGroupLinkElement = $(".-rename-group");
    var newGroupNameInputElement = $("#newGroupName");
    var newContactUsernameInputElement = $("#newContactUsername");
    var welcomeGroupsContainerElement = $(".-welcome-groups");
    var welcomeGroupsList = $(".-welcome-groups-list");
    var noMembersElement = $(".-no-members");
    var mobileChannelListElement = $(".-channel-list-mobile");
    var mobileChannelListContentsElement = $(".-channel-list-mobile-contents");
    var faviconDescriptorElement = $("#favicon");
    var downloadLinksElement = $(".-download-links");
    var sendButtonElement = $(".-send-button");
    
    var animateOnUnread = function() {
        if (!hasUnread) {
            faviconDescriptorElement.attr("href", "favicon.png");
            blockslack.mobile.setBadgeNumber(0);
        } else {
            blockslack.mobile.setBadgeNumber(1);
            var current = faviconDescriptorElement.attr("href");
            if (current == "favicon.png") {
                faviconDescriptorElement.attr("href", "favicon-new.png");
            } else {
                faviconDescriptorElement.attr("href", "favicon.png");
            }
        }
    };

    var channelDisplayName = function(channelName) {
        var index = channelName.lastIndexOf(":");
        if (index != -1) {
            channelName = channelName.substring(0, index);
        }

        return channelName;
    };

    var enableDisableSendButton = function() {
        sendButtonElement.prop("disabled", newMessageElement.val().length ? false : true);
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
            sendCurrentMessage();
        }
    };

    var publishAudienceChange = function(oldAudience, newAudience) {
        var allData = blockslack.aggregation.getAllData();
        var groupData = allData[currentGroupId];
        var message = blockslack.aggregation.generateAudienceChangeMessage(
            currentGroupId,
            currentChannelName,
            newAudience);
        // Send to the smallest audience first 
        // (most likely to succeed in cases when invalid usernames are present)
        var firstAudience = oldAudience.length < newAudience.length ? oldAudience : newAudience;
        var secondAudience = oldAudience.length < newAudience.length ? newAudience : oldAudience;
        return blockslack.feedpub.publish(firstAudience, message).then(function() {
            return blockslack.feedpub.publish(secondAudience, message);    
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
        var hasUnread = blockslack.readstatus.hasUnread(currentGroupId, channelName);
        buttonElement.find(".-name").text("#" + channelDisplayName(channelName));
        buttonElement.find(".-unread-indicator").toggle(hasUnread);
        blockslack.on.click(buttonElement, function(){ switchChannel(channelName); });
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
                var messages = channelData.getMessages();
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
                    channelMemberListElement.append(blockslack.people.getBadge(username, removeMember));
                }

                isMember && !shortScreen && newMessageElement.focus();
                noMembersElement.toggle(isMember && audience.length < 2);
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

        mobileChannelListElement.toggle(currentGroupId ? true : false);
        currentGroupHolderElement.toggle(groupName ? true : false);
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
        welcomeGroupsList.empty();

        var allGroups = [];
        for (var groupId in allData) {
            var title = allData[groupId].currentTitle;
            var lastActivity = allData[groupId].lastActivity;
            var hasUnread = allData[groupId].hasUnread();
            allGroups.push([ groupId, title, lastActivity, hasUnread ]);
        }

        allGroups.sort(function(a, b){ return b[2] - a[2]; });
        for (var i = 0; i < allGroups.length; i++) {
            renderGroupButton(allGroups[i]);
        }
    };

    var renderGroupButton = function(groupData) {
        var buttonElement = $($("#template-groupButton").html());
        groupData[3] && buttonElement.addClass("-unread");
        buttonElement.text(groupData[1].charAt(0).toUpperCase());
        blockslack.on.click(buttonElement, function(){ switchGroup(groupData[0]); });
        buttonElement.attr("title", groupData[1]);
        groupButtonListElement.append(buttonElement);

        var linkElement = $("<a href='#'>");
        linkElement.text(groupData[1]);
        blockslack.on.click(linkElement, function(){ switchGroup(groupData[0]); });
        welcomeGroupsList.append(linkElement);
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

    var renderWelcomeArea = function(allData) {
        welcomeAreaElement.toggle(!currentGroupId);
        welcomeGroupsContainerElement.toggle(Object.keys(allData).length ? true : false);
    };

    var scrollPage = function() {
        if ($(".-logo:visible")[0]) {
            $(".-logo:visible")[0].scrollIntoView();
        } else if (inputAreaElement[0]) {
            inputAreaElement[0].scrollIntoView();
        }
    };

    var sendCurrentMessage = function() {
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
                sendButtonElement.prop("disabled", true);
                blockslack.feedpub.publish(audience, message).then(function() {
                    newMessageElement.prop("disabled", false);
                    sendButtonElement.prop("disabled", true);
                    newMessageElement.val("");
                    newMessageElement.focus();
                    blockslack.sound.pop();
                }).catch(function(e) {
                    alert(blockslack.strings.COULD_NOT_SEND);
                    newMessageElement.prop("disabled", false);
                    sendButtonElement.prop("disabled", false);
                    newMessageElement.focus();
                });
            }
        }
    };

    var sizeElements = function(isPageLoad) {       
        var bodyHeight = $(document.body).height();
        mainPageElement.height(bodyHeight);
        messageListElement.css("margin-top", bodyHeight + "px");
        welcomeAreaElement.css("margin-top", bodyHeight + "px");
        scrollPage();
    };

    var sortChannelNames = function(channelData) {
        var toSort = [];
        for (var channelName in channelData) {
            toSort.push([ channelName, channelData[channelName].lastActivity]);
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
        blockslack.chatui.toggleChannels(/*forceState*/ false);
        updateUi();
    };

    var switchGroup = function(newGroupId) {
        currentGroupId = newGroupId;
        currentChannelName = undefined;
        newMessageElement.val("");
        blockslack.chatui.toggleChannels(/*forceState*/ true);
        updateUi();
    };

    var updateGlobalUnreadStatus = function(allData) {
        hasUnread = false;    
        for (var groupId in allData) {
            hasUnread = hasUnread || allData[groupId].hasUnread();
        }
    };

    var updateUi = function() {
        $(".tooltip").hide();
        var allData = blockslack.aggregation.getAllData();
        windowHasFocus && currentGroupId && currentChannelName && blockslack.readstatus.markRead(currentGroupId, currentChannelName);
        renderGroupButtons(allData);
        renderCurrentGroupChannelList(allData);
        renderCurrentChannel(allData);
        renderWelcomeArea(allData);
        updateGlobalUnreadStatus(allData);
        downloadLinksElement.toggle(!blockslack.mobile.isWithinMobileApp());
        sizeElements();
        $('[data-toggle="tooltip"]').tooltip({ boundary: 'window' });
        enableDisableSendButton();
    };

    var windowHasFocus = true;
    $(window).focus(function() {
        windowHasFocus = true;
        currentGroupId && currentChannelName && blockslack.readstatus.markRead(currentGroupId, currentChannelName);
    }).blur(function() {
        windowHasFocus = false;
    });

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
                var username = newContactUsernameInputElement.val();
                newContactUsernameInputElement.val("");
                if (username && username.length) {
                    blockslack.discovery.addContact(username);
                    alert(blockslack.strings.CONTACT_ADDED.replace("%1", username));
                }
            }
        },

        addGroup: function() {
            if (blockslack.authentication.isSignedIn()) {
                var groupName = newGroupNameInputElement.val();
                newGroupNameInputElement.val("");
                if (groupName && groupName.length) {
                    var groupId = makeId();
                    var audience = [ blockslack.authentication.getUsername() ];
                    var message1 = blockslack.aggregation.generateTitleChangeMessage(groupId, groupName);
                    var message2 = blockslack.aggregation.generateTextMessage(
                        groupId, 
                        "general:" + makeId(), 
                        blockslack.strings.CHANNEL_WELCOME_PREFIX + "general");
                    Promise.resolve().then(function() {
                        return blockslack.feedpub.publish(audience, message1);
                    }).then(function() {
                        return blockslack.feedpub.publish(audience, message2);
                    }).then(function() {
                        switchGroup(groupId);
                        return Promise.resolve();
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

        home: function() {
            switchGroup(undefined);
        },

        updateUi: function() {
            updateUi();
        },

        onload: function() {
            var footerElement = $($("#template-footer").html());
            footerPlaceholderElements.append(footerElement);
            newMessageElement.keypress(newMessageKeyPress);
            newMessageElement.keyup(enableDisableSendButton);
            $(window).on('resize', sizeElements);
            newMessageElement.focus(sizeElements);
            newMessageElement.blur(sizeElements);
            setInterval(animateOnUnread, FLASH_SPEED);
            sizeElements(/*isPageLoad*/ true);
            blockslack.on.click(workAreaElement, function(e) { 
                mobileChannelListContentsElement.is(":visible") &&
                    blockslack.chatui.toggleChannels(/*forceState*/ false); 
            });
        },

        renameGroup: function() {
            var allData = blockslack.aggregation.getAllData();
            var groupData = allData[currentGroupId];
            if (groupData) {
                if (blockslack.authentication.isSignedIn() && currentGroupId) {
                    var newName = prompt(blockslack.strings.ENTER_NEW_GROUP_NAME, groupData.currentTitle);
                    if (newName) {
                        var audience = groupData.allMembers();
                        var message = blockslack.aggregation.generateTitleChangeMessage(currentGroupId, newName);
                        blockslack.feedpub.publish(audience, message);
                    }        
                }
            }
        },

        send: function() {
            sendCurrentMessage();
        },

        toggleChannels: function(forceState) {
            var initialVisibility = mobileChannelListContentsElement.is(":visible");
            var targetVisibility = !initialVisibility;
            if (forceState === true) {
                targetVisibility = true;
            } else if (forceState === false) {
                targetVisibility = false;
            }

            mobileChannelListContentsElement.toggle(targetVisibility);
            if (targetVisibility) {
                mobileChannelListElement.addClass("-expanded");
                mobileChannelListElement.find(".oi").addClass("oi-chevron-left").removeClass("oi-chevron-right");
                newMessageElement.blur();
            } else {
                mobileChannelListElement.removeClass("-expanded");
                mobileChannelListElement.find(".oi").addClass("oi-chevron-right").removeClass("oi-chevron-left");
                !shortScreen && newMessageElement.focus();
            }
        },

    };

})();
