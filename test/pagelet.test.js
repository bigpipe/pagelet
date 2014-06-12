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

    it('resolves the view', function () {
      assume(P.prototype.view).to.equal('fixtures/view.html');
      P.on(module);

      assume(P.prototype.view).to.equal(__dirname +'/fixtures/view.html');
    });

    it('resolves the `error` view');
    it('transforms `css` in to an array');
    it('resolves the `css` files in to an array');
    it('resolves the `js` files in to an array');
    it('only resolves non http/https dependencies');

  });

  describe('.optimize', function () {
    it('is a function', function () {
      assume(Pagelet.optimize).to.be.a('function');
      assume(P.optimize).to.be.a('function');
      assume(Pagelet.optimize).to.equal(P.optimize);
    });

    it('prefetches the `view`');
    it('prefetches the `error` view');
    it('allows rpc as a string');
    it('allows lowercase rpc');
  });

  describe('.traverse', function () {
    it('is a function', function () {
      assume(Pagelet.traverse).to.be.a('function');
      assume(P.traverse).to.be.a('function');
      assume(Pagelet.traverse).to.equal(P.traverse);
    });

    it('returns an array', function () {
      var one = P.traverse()
        , recur = P.extend({
            pagelets: {
              child: P.extend({ name: 'child' })
            }
          }).traverse('this one');

      assume(one).to.be.an('array');
      assume(one.length).to.equal(1);

      assume(recur).to.be.an('array');
      assume(recur.length).to.equal(2);
    });

    it('will at least return the pagelet', function () {
      var single = P.traverse();

      assume(single[0].prototype._parent).to.equal(undefined);
      assume(single[0].prototype.directory).to.equal(__dirname);
      assume(single[0].prototype.view).to.equal('fixtures/view.html');
    });

    it('does recursive pagelet discovery', function () {
      var recur = P.extend({
        pagelets: {
          child: P.extend({
            name: 'child' ,
            pagelets: {
              another: P.extend({ name: 'another' })
            }
          }),
        }
      }).traverse('multiple');

      assume(recur).is.an('array');
      assume(recur.length).to.equal(3);

      assume(recur[1].prototype.name).to.equal('child');
      assume(recur[2].prototype.name).to.equal('another');
    });

    it('sets the pagelets parent name on `_parent`', function () {
      var recur = P.extend({
        pagelets: {
          child: P.extend({
            name: 'child'
          })
        }
      }).traverse('parental');

      assume(recur[0].prototype._parent).to.equal(undefined);
      assume(recur[1].prototype._parent).to.equal('parental');
    });
  });
});
