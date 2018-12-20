blockslack.groups = (function(){
    
    // privates:
    
    var GROUPS_FILE_NAME = "groups.json";

    var ALL_GROUPS_DATA_KEY = "allGroups";

    var buttonListElement = $(".-group-buttons");

    var makeId = function() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    var receiveGroupNames = function(fileContents) {
        var allGroups = JSON.parse(fileContents) || [];
        blockslack.authentication.state(ALL_GROUPS_DATA_KEY, allGroups);
        renderGroupButtons();
    };

    var renderGroupButtons = function() {
        buttonListElement.empty();
        var allGroups = blockslack.authentication.state(ALL_GROUPS_DATA_KEY);
        if (allGroups) {
            for (var i = 0; i < allGroups.length; i++) {
                var groupData = allGroups[i];
                if (groupData) {
                    renderGroupButton(groupData);
                }
            }
        }
    };

    var renderGroupButton = function(groupData) {
        var buttonElement = $($("#template-groupButton").html());
        buttonElement.text(groupData[1].charAt(0).toUpperCase());
        buttonElement.click(function(){ switchGroup(groupData[0], groupData[1]); });
        buttonListElement.append(buttonElement);
    };

    var switchGroup = function(newGroupId, newGroupName) {
        alert("TODO: Switch to group: " + newGroupName);
    };

    // initialization:
    // (don't depend on other packages, order of package initialization is not guaranteed)
    // foo = 1;
    // bar = 2;

    return {

        // publics:
        
        addGroup: function() {
            if (blockslack.authentication.isSignedIn()) {
                var groupName = prompt(blockslack.strings.PICK_GROUP_NAME);
                var groupId = makeId();
                var groupData = [ groupId, groupName ];
                var allGroups = blockslack.authentication.state(ALL_GROUPS_DATA_KEY);
                allGroups.push(groupData);
                allGroups.sort(function(a, b){ return a[1] > b[1] ? 1 : -1; });
                blockstack.putFile(GROUPS_FILE_NAME, JSON.stringify(allGroups));
                renderGroupButtons();
                switchGroup(groupId, groupName);
            }
        },

        initialize: function() {
            buttonListElement.empty();
            if (blockslack.authentication.isSignedIn()) {
                blockstack.getFile(GROUPS_FILE_NAME).then(receiveGroupNames);
            }
        },

    };

})();
