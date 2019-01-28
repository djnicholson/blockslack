blockslack.on = (function(){
    
    var clickEvent = "click";
    //
    // TODO: Investigate ghost clicks due to scrolling when this is enabled.
    //
    // if ("onpointerdown" in window) {
    //     clickEvent = "pointerdown";
    // } else if ("ontouchstart" in window) {
    //     clickEvent = "touchstart";
    // }

    return {

        click: function(element, handler) {
            element.on(clickEvent, handler);
        },

    };

})();
