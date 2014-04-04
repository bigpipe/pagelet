describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , chai = require('chai')
    , expect = chai.expect
    , pagelet;

  beforeEach(function () {
    pagelet = new Pagelet;
  });

  afterEach(function () {
    pagelet = null;
  });

  describe('.on', function () {
    it('sets the pathname', function () {
      var pagelet = Pagelet.extend({});
      expect(pagelet.prototype.directory).to.equal('');

      pagelet.prototype.directory = 'foo';
      expect(pagelet.prototype.directory).to.equal('foo');

      pagelet.on(module);

      expect(pagelet.prototype.directory).to.be.a('string');
      expect(pagelet.prototype.directory).to.equal(__dirname);
    });
  });

  it('rendering is asynchronously', function (done) {
    pagelet.get(pagelet.emits('called'));
    // Listening only till after the event is potentially emitted, will ensure
    // callbacks are called asynchronously by pagelet#render.
    pagelet.on('called', done);
  });
});
