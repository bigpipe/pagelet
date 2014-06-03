describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , assume = require('assume')
    , pagelet
    , P;

  beforeEach(function () {
    P = Pagelet.extend({
      directory: __dirname,
      view: 'fixtures/view.html'
    });

    pagelet = new P();
  });

  afterEach(function () {
    pagelet = null;
  });

  it('rendering is asynchronously', function (done) {
    pagelet.get(pagelet.emits('called'));

    // Listening only till after the event is potentially emitted, will ensure
    // callbacks are called asynchronously by pagelet#render.
    pagelet.on('called', done);
  });

  describe('.on', function () {
    it('sets the pathname', function () {
      var pagelet = Pagelet.extend({});
      assume(pagelet.prototype.directory).to.equal('');

      pagelet.prototype.directory = 'foo';
      assume(pagelet.prototype.directory).to.equal('foo');

      pagelet.on(module);

      assume(pagelet.prototype.directory).to.be.a('string');
      assume(pagelet.prototype.directory).to.equal(__dirname);
    });
  });

  describe('.optimize', function () {
    it('is a function', function () {
      assume(Pagelet.optimize).to.be.a('function');
      assume(P.optimize).to.be.a('function');
      assume(Pagelet.optimize).to.equal(P.optimize);
    });

    it('resolves the view', function () {
      assume(P.prototype.view).to.equal('fixtures/view.html');
      P.optimize();

      assume(P.prototype.view).to.equal(__dirname +'/fixtures/view.html');
    });

    it('prefetches the `view`');
    it('resolves the `error` view');
    it('prefetches the `error` view');
    it('transforms `css` in to an array');
    it('resolves the `css` files in to an array');
    it('resolves the `js` files in to an array');
    it('only resolves non http/https dependencies');
    it('allows rpc as a string');
    it('allows lowercase rpc');
    it('stores all introduced properties as array');
    it('adds a freelist factory');
  });

  describe('.traverse', function () {
    it('returns an array');
    it('will return the pagelet');
    it('does recursive pagelet discovery');
    it('sets the pagelets parent name on `_parent`');
  });
});
