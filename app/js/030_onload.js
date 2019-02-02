blockslack.onload = (function(){

    var hydrateImages = function() {
        [].forEach.call($("img[data-src]"), function(img) {
            var imgId = img.getAttribute("data-src");
            var referenceImage = $("img[data-imgid='" + imgId + "']");
            if (referenceImage[0]) {
                img.setAttribute("src", referenceImage[0].getAttribute("src"));
            } else {
                img.setAttribute("src", imgId);
            }
            
            img.onload = function() { img.removeAttribute("data-src"); };
        });
    };

    return {
        
        go: function() {
            hydrateImages();
            blockslack.authentication.initialize();
            blockslack.polling.onload();
            blockslack.chatui.onload();
        },

    };

})();
