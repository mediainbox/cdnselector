/*jslint node: true */
"use strict";
var errorlog = require('winston'),
    BaseDao = require('./BaseDao.js'),
    util = require('util');

var dbDocs = {
    "_design/cdns": {
        "views": {
            "all": {
                "map": function(doc) {
                    if (doc.type === 'cdns:cdn') {
                        emit(doc._id, doc);
                    }
                }
            }
        },
        "filters": {
            "all": function(doc, req) {
                return (doc.type == 'cdns:cdn' || doc._deleted);
            }
        }
    },
    "cdns:cdn:velocix": {
        "name": "Velocix (using ALTO and SSCS features)",
        "driver": "cdns:cdn:driver:velocix",
        "active": true,
        "type": "cdns:cdn",
        "defaultOrder": 0,
        "routingService": {
            "proto": "sscsv2",
            "host": "demo.cdnexperts.net",
            "port": 80,
            "path": "/demo/sscsv2"
        },
        "altoService": {
           "altoServiceUrl": "http://demo.cdnexperts.net/demo/cdns/alto/directory.altod",
           "refreshInterval": 60,
           "ignorePids": [
               "ignore",
               "offnet",
               "PID3"
           ],
           "networkMapId": "default-network-map",
           "lastChanged": null
        },
        "clientIpWhitelist": {
            "manual": [
                { "network": "127.0.0.0", "prefix": 8 }
            ],
            "alto": []
        }
    },
    "cdns:cdn:amazon": {
        "name": "Amazon Cloudfront",
        "driver": "cdns:cdn:driver:amazon",
        "type": "cdns:cdn",
        "defaultOrder": 1,
        "active": true
    },
    "cdns:cdn:akamai": {
        "name": "Akamai",
        "driver": "cdns:cdn:driver:akamai",
        "type": "cdns:cdn",
        "defaultOrder": 2,
        "active": true
    },
    "cdns:cdn:generic": {
        "name": "Rackspace",
        "driver": "cdns:cdn:driver:generic",
        "type": "cdns:cdn",
        "defaultOrder": 3,
        "active": true
    },
    "cdns:cdn:velocixott": {
        "name": "Velocix (as an OTT CDN)",
        "driver": "cdns:cdn:driver:velocix",
        "active": true,
        "type": "cdns:cdn",
        "defaultOrder": 4,
        "clientIpWhitelist": {
            "manual": [],
            "alto": []
        }
    },
};

function CDNDao(db) {
    CDNDao.super_.call(this, db, 'cdns', 'cdns:cdn');
    var self = this;

    this.cdns = {};

    this.loadAllCDNs = function (callback) {

        // Load all from the database
        db.view('cdns', 'all', function (err, body) {
            if (!err) {
                body.rows.forEach(function (row) {
                    self.cdns[row.key] = row.value;
                });
                self.emit('ready');
            } else {
                self.emit('error', new Error('Error from Database while fetching cdns : ' + err));
            }
        });

        // Monitor for changes
        var feed = db.follow({since: 'now', filter: 'cdns/all'})
        feed.on('change', function (change) {
            errorlog.info('CDN config was updated: ' + JSON.stringify(change));
            if (change.deleted) {
                delete self.cdns[change.id];
                self.emit('deleted', change.id);
            } else {
                db.get(change.id, {}, function (err, body) {
                    if (err) {
                        errorlog.warn('Unable to load changes to CDN ' + change.id + ' : ' + err);
                        self.emit('error', err)
                    } else {
                        self.emit('updated', change.id, body);
                    }
                });
            }
        });
        feed.on('error', function(err) {
            errorlog.error('Lost connectivity with the DB changes feed for CDNs', err);
            self.emit('error', err)
        })
        feed.follow();
    };

    self.createDatabaseDocs(dbDocs, function (err) {
        if (err) {
            errorlog.error("Error whilst creating DB documents for CDNs.", err);
            self.emit('error', err);
        } else {
            self.loadAllCDNs();
        }
    });
}

util.inherits(CDNDao, BaseDao);
var proto = CDNDao.prototype;

proto.getById = function (id) {
    return this.cdns[id];
};

proto.getAll = function () {
    return this.cdns;
};

module.exports = function (database) {
    return new CDNDao(database);
};