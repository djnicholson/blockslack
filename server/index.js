"use strict";

process.title = "blockslack-server";

var PORT = process.env.PORT || 80;

var FIELD_TYPE = "t";
var FIELD_FEED_ID = "f";
var TYPE_SUBSCRIBE = "s";
var TYPE_PUBLISH = "p";

var WebSocketServer = require('websocket').server;
var http = require('http');
var crypto = require('crypto');

var salt = Math.random();
var obfuscate = function(input) {
    return "OBV_" + crypto.createHmac('sha256', salt + "").update(input).digest().toString('hex');
};

var obfuscateAll = function(inputs) {
    var inputsClone = inputs.slice();
    for (var i = 0; i < inputsClone.length; i++) {
        inputsClone[i] = obfuscate(inputsClone[i]);
    }

    return inputsClone;
};

var State = function() {
    this.byFeed = { };
    this.byConnection = { };
    
    this.connect = function(connectionId, connection) {
        this.byConnection[connectionId] = {
            connection: connection,
            subscriptions: { },
        };

        log(connectionId + " connected");
    };

    this.disconnect = function(connectionId) {
        var that = this;
        that.forConnection(connectionId, function(connectionInfo) {
            var subscriptions = connectionInfo.subscriptions;
            if (subscriptions) {
                for (var feedId in subscriptions) {
                    that.forFeed(feedId, function(feedSubscriptions) {
                        delete feedSubscriptions[connectionId];
                        if (Object.keys(feedSubscriptions).length == 0) {
                            delete that.byFeed[feedId];
                        }
                    });
                }
            }
        });

        delete that.byConnection[connectionId];

        log(connectionId + " disconnected");
    };

    this.forConnection = function(connectionId, action) {
        var connectionInfo = this.byConnection[connectionId];
        connectionInfo && action(connectionInfo);
    };

    this.forFeed = function(feedId, action) {
        var feedSubscriptions = this.byFeed[feedId] || (this.byFeed[feedId] = { });
        action(feedSubscriptions);
    }

    this.publish = function(feedId) {
        var that = this;
        that.forFeed(feedId, function(feedSubscriptions) {
            for (var connectionId in feedSubscriptions) {
                that.forConnection(connectionId, function(connectionInfo) {
                    var connection = connectionInfo.connection;
                    connection && connection.send(feedId);
                    log("Notified " + connectionId + " of update to " + obfuscate(feedId));
                });
            }
        });
    };

    this.subscribe = function(connectionId, feedId) {
        this.forConnection(connectionId, function(connectionInfo) {
            connectionInfo.subscriptions[feedId] = true;
        });

        this.forFeed(feedId, function(feedSubscriptions) {
            feedSubscriptions[connectionId] = true;
        });

        log(connectionId + " subscribed to " + obfuscate(feedId));
    };

    this.toString = function() {
        var result = "---- State: -----";
        result += "\nConnection count: \t" + Object.keys(this.byConnection).length;
        result += "\nFeed count: \t\t" + Object.keys(this.byFeed).length;
        result += "\n  Connections:";
        for (var connectionId in this.byConnection) {
            result += "\n    " + connectionId + ": \t";
            this.forConnection(connectionId, function(connectionInfo) {
                if (connectionInfo.subscriptions) {
                    result += obfuscateAll(Object.keys(connectionInfo.subscriptions)).join(", ");
                }
            });
        }

        result += "\n  Feeds:";
        for (var feedId in this.byFeed) {
            result += "\n    " + obfuscate(feedId) + ": \t";
            this.forFeed(feedId, function(feedSubscriptions) {
                result += Object.keys(feedSubscriptions).join(", ");
            });
        }

        result += "\n----------------";
        return result;
    };
};

var state = new State();

var log = function(message) {
    console.log((new Date()) + ": " + message);
};

var httpServer = http.createServer(function(request, response) {
    response.writeHead(200);
    response.write(state.toString());
    response.end();
});
httpServer.listen(PORT, function() { log("Listening for connections on port " + PORT); });
var webSocketServer = new WebSocketServer({ httpServer: httpServer, autoAcceptConnections: true });

webSocketServer.on("connect", function(connection) {

    var socket = connection.socket;
    var connectionId = obfuscate(socket.remoteAddress + "_" + socket.remotePort);

    state.connect(connectionId, connection);

    connection.on("message", function(message) {
        if (message.type == "utf8") {
            var messageText = message.utf8Data;
            var messageObject;
            if (messageObject = JSON.parse(messageText)) {
                var messageType = messageObject[FIELD_TYPE];
                var feedId = messageObject[FIELD_FEED_ID];
                if (messageType && feedId) {
                    if (messageType == TYPE_SUBSCRIBE) {
                        state.subscribe(connectionId, feedId);
                    } else if (messageType == TYPE_PUBLISH) {
                        state.publish(feedId);
                    }
                }
            }
        }
    });

    connection.on("close", function(reasonCode, description) {
        state.disconnect(connectionId);
    });

});
