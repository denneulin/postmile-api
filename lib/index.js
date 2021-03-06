// Load modules

var Hoek = require('hoek');
var Db = require('./db');
var Streamer = require('./streamer');
var Session = require('./session');
var Routes = require('./routes');
var Suggestions = require('./suggestions');
var Tips = require('./tips');


// Declare internals

var internals = {};


exports.register = function (plugin, options, next) {

    // tos: 20110623

    var database = new Db(plugin.app.config.database);
    var streamer = new Streamer(plugin.app);

    plugin.bind({
        config: plugin.app.config,
        vault: plugin.app.vault,
        db: database,
        streamer: streamer
    });

    plugin.register(require('scarecrow'), function (err) {

        Hoek.assert(!err, 'Failed loading plugin: ' + err);

        plugin.auth.strategy('oz', 'oz', true, {
            oz: {
                encryptionPassword: plugin.app.vault.ozTicket,
                loadAppFunc: Session.loadApp(database),
                loadGrantFunc: Session.loadGrant(database)
            }
        });

        plugin.ext('onPreResponse', internals.onPreResponse);
        plugin.route(Routes.endpoints);

        database.initialize(function (err) {

            if (err) {
                console.log(err);
                process.exit(1);
            }

            Suggestions.initialize(database);
            Tips.initialize(database);

            return next();
        });
    });

    plugin.events.once('start', function () {

        plugin.route([
            { method: 'POST', path: '/stream/{id}/project/{project}', config: streamer.subscribe() },
            { method: 'DELETE', path: '/stream/{id}/project/{project}', config: streamer.unsubscribe() }
        ]);

        streamer.initialize(plugin.servers[0]);
    });
};


exports.register.attributes = {
    pkg: require('../package.json')
};


// Post handler extension middleware

internals.onPreResponse = function (request, reply) {

    var response = request.response;
    if (!response.isBoom &&
        response.variety === 'plain' &&
        response.source instanceof Array === false) {

        // Sanitize database fields

        var payload = response.source;

        if (payload._id) {
            payload.id = payload._id;
            delete payload._id;
        }

        for (var i in payload) {
            if (payload.hasOwnProperty(i)) {
                if (i[0] === '_') {
                    delete payload[i];
                }
            }
        }
    }

    return reply();
};
