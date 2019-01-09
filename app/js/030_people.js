blockslack.people = (function(){
    
    var APP_URL = window.location.origin;

    var Person = function(userId) {
        var person = this;
        person.userId = userId;
        person.exists = undefined;
        person.blockslackUser = undefined;
        person.image = undefined;
        person.fullName = userId;
        person.hasFullName = false;
        person.pending = true;
        person.dataReady = blockstack.lookupProfile(userId).then(function (blockstackProfile) {
            person.exists = true;
            person.blockslackUser = blockstackProfile.apps[APP_URL] ? true : false;
            blockstackProfile.image && blockstackProfile.image.length && (person.image = blockstackProfile.image[0].contentUrl);
            blockstackProfile.name && (person.fullName = blockstackProfile.name) && (person.hasFullName = true);
            person.pending = false;
        }).catch(function(e) {
            person.exists = false;
            person.blockslackUser = false;
            person.pending = false;
        }).then(function() { return person; });
    };

    var getTooltipTitle = function(badgeTextElement, person) {
        var tooltipElement = $($("#template-personTooltip").html());
        var profilePic = tooltipElement.find(".-profile-pic");
        tooltipElement.find(".-username").text(person.userId);
        tooltipElement.find(".-full-name").text(person.fullName);
        tooltipElement.find(".-full-name").toggle(person.hasFullName);
        tooltipElement.find(".-not-found").toggle(!person.exists);
        tooltipElement.find(".-non-user").toggle(person.exists && !person.blockslackUser);
        profilePic.hide();
        person.image && (profilePic.attr("src", person.image)) && profilePic.show();
        !person.image && !person.hasFullName && tooltipElement.find(".-full-name-holder").hide();
        return tooltipElement.html();
    };

    return {
        
        getBadge: function(userId, removeMember) {
            
            var element = $($("#template-personBadge").html());
            var badgeTextElement = element.find(".-username");
            var removeLink = element.find("a");
            
            element.attr("data-username", userId);
            
            badgeTextElement.text(userId);
            badgeTextElement.tooltip({
                boundary: "window",
                html: true,
                placement: "top",
                title: function(badgeTextElement) { return getTooltipTitle(badgeTextElement, person); },
            });

            if (removeMember) {
                removeLink.click(function() { removeMember($(this).parent().attr("data-username")); });
            } else {
                removeLink.hide();
            }

            var person = new Person(userId);
            person.dataReady.then(function() {
                !person.exists && badgeTextElement.css("text-decoration", "line-through");
                !person.blockslackUser && badgeTextElement.css("font-style", "italic");
                badgeTextElement.text(person.fullName);
            });

            return element;
        },

        lookup: function(userId) {
            return new Person(userId);
        },

    };

})();
