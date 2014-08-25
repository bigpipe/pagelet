describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , custom = '/unexisting/absolute/path/to/prepend'
    , assume = require('assume')
    , pagelet
    , P;

  //
  // A lazy mans temper, we just want ignore all temper actions sometimes
  // because our pagelet is not exported using `.on(module)`
  //
  var temper = { prefetch: function () {} };

  beforeEach(function () {
    P = Pagelet.extend({
      directory: __dirname,
      view: 'fixtures/view.html',
      css: 'fixtures/style.css',
      js: '//cdnjs.cloudflare.com/ajax/libs/d3/3.4.8/d3.min.js',
      dependencies: [
        'http://code.jquery.com/jquery-2.0.0.js',
        'fixtures/custom.js'
      ]
    });

    pagelet = new P();
  });

  afterEach(function each() {
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
    it('resolves the `css` files in to an array');
    it('resolves the `js` files in to an array');
    it('resolves the `dependencies` files in to an array');
  });

  describe('.resolve', function () {
    it('is a function', function () {
      assume(Pagelet.resolve).to.be.a('function');
      assume(P.resolve).to.be.a('function');
      assume(Pagelet.resolve).to.equal(P.resolve);
    });

    it('will resolve provided property on prototype', function () {
      var result = P.resolve('css');

      assume(result).to.equal(P);
      assume(P.prototype.css).to.be.an('array');
      assume(P.prototype.css.length).to.equal(1);
      assume(P.prototype.css[0]).to.equal(__dirname + '/fixtures/style.css');
    });

    it('can resolve multiple properties at once', function () {
      P.resolve(['css', 'js']);

      assume(P.prototype.css).to.be.an('array');
      assume(P.prototype.js).to.be.an('array');
      assume(P.prototype.css.length).to.equal(1);
      assume(P.prototype.js.length).to.equal(1);
    });

    it('can be provided with a custom source directory', function () {
      P.resolve('css', custom);

      assume(P.prototype.css[0]).to.equal(custom + '/fixtures/style.css');
    });

    it('only resolves local files', function () {
      P.resolve('js', custom);

      assume(P.prototype.js[0]).to.not.include(custom);
      assume(P.prototype.js[0]).to.equal('//cdnjs.cloudflare.com/ajax/libs/d3/3.4.8/d3.min.js');
    });

    it('can handle property values that are already an array', function () {
      P.resolve('dependencies', custom);

      assume(P.prototype.dependencies.length).to.equal(2);
      assume(P.prototype.dependencies[0]).to.not.include(custom);
      assume(P.prototype.dependencies[0]).to.equal('http://code.jquery.com/jquery-2.0.0.js');
      assume(P.prototype.dependencies[1]).to.equal(custom + '/fixtures/custom.js');
    });

    it('removes undefined values from the array before processing', function () {
      var Undef = P.extend({
        dependencies: P.prototype.dependencies.concat(
          undefined
        )
      });

      assume(Undef.prototype.dependencies.length).to.equal(3);

      Undef.resolve('dependencies', custom);
      assume(Undef.prototype.dependencies.length).to.equal(2);
      assume(Undef.prototype.dependencies).to.not.include(undefined);
    });

    it('can be overriden', function () {
      P.resolve = function () {
        throw new Error('fucked');
      };

      P.on({});
    });
  });

  describe('.optimize', function () {
    it('is a function', function () {
      assume(Pagelet.optimize).to.be.a('function');
      assume(P.optimize).to.be.a('function');
      assume(Pagelet.optimize).to.equal(P.optimize);
    });

    it('uses the supplied temper for prefetching', function (next) {
      var calls = 0;
      P.optimize({
        temper: {
          prefetch: function () {
            ++calls;
          }
        }
      }, function (err) {
        if (err) return next(err);

        assume(calls).to.equal(2);
        next();
      });
    });

    it('resolves the view', function (next) {
      assume(P.prototype.view).to.equal('fixtures/view.html');
      P.optimize({}, function () {
        assume(P.prototype.view).to.equal(__dirname +'/fixtures/view.html');
        next();
      });
    });

    it('prefetches the `view`');
    it('prefetches the `error` view');

    it('allows rpc as a string', function (next) {
      var X = P.extend({
        RPC: 'fixtures, bar',
        fixtures: function () {},
        bar: function () {}
      });

      X.optimize({ temper: temper }, function (err) {
        if (err) return next(err);

        assume(X.prototype.RPC).to.be.a('array');
        assume(X.prototype.RPC).to.have.length(2);
        assume(X.prototype.RPC).to.include('bar');
        assume(X.prototype.RPC).to.include('fixtures');

        next();
      });
    });

    it('checks if all rpc functions are available', function (next) {
      var X = P.extend({
        RPC: 'fixtures, bar',
        bar: function () {}
      });

      X.optimize({ temper: temper }, function (err) {
        assume(err).to.be.a('error');
        assume(err.message).to.include('fixtures');

        next();
      });
    });

    it('allows lowercase rpc', function (next) {
      var X = P.extend({
        rpc: ['fixtures', 'bar'],
        bar: function () {}
      });

      X.optimize({ temper: temper }, function (err) {
        assume(err).to.be.a('error');
        assume(err.message).to.include('fixtures');

        next();
      });
    });
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
