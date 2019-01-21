blockslack.on = (function(){
    
    var clickEvent = "click";
    if ("onpointerdown" in window) {
        clickEvent = "pointerdown";
    } else if ("ontouchstart" in window) {
        clickEvent = "touchstart";
    }

    return {

        click: function(element, handler) {
            element.on(clickEvent, handler);
        },

    };

})();
