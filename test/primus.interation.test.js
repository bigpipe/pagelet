describe('Pagelet', function () {
  'use strict';

  var Primus = require('primus')
    , assume = require('assume')
    , port = 1024
    , pagelet
    , primus
    , client
    , http;

  //
  // Pre-configure an Pagelet with some default values so we can test if every
  // property is correctly configured.
  //
  var Pagelet = require('../').extend({
    name: 'test',
    directory: __dirname,
    view: 'fixtures/view.html'
  });

  beforeEach(function (next) {
    pagelet = new Pagelet();

    http = require('http').createServer();
    primus = new Primus(http, {
      transformer: 'websockets',
      plugin: {
        substream: require('substream')
      }
    });

    http.port = port++;
    http.listen(http.port, next);
  });

  describe('.connect', function () {
    it('connects without errors', function (next) {
      assume(pagelet.substream).to.be.a('null');

      client = primus.on('connection', function (spark) {
        pagelet.connect(spark, function connected(err) {
          if (err) return next(err);

          assume(pagelet.substream).to.not.be.a('null');
          assume(pagelet.substream.write).to.be.a('function');

          spark.end();
          next();
        });
      }).Socket('http://localhost:'+ http.port);
    });

    it('returns an error if unauthorized', function (next) {
      var Authorized = Pagelet.extend({
        authorize: function (req, authorized) {
          authorized(false);
        }
      });

      pagelet = new Authorized();

      client = primus.on('connection', function (spark) {
        pagelet.connect(spark, function connected(err) {
          if (!err) throw new Error('Shit is fucked, no auth, ERROR');

          assume(pagelet.substream).to.be.a('null');

          spark.end();
          next();
        });
      }).Socket('http://localhost:'+ http.port);
    });
  });
});
