describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , Temper = require('temper')
    , Pipe = require('bigpipe')
    , custom = '/unexisting/absolute/path/to/prepend'
    , assume = require('assume')
    , server = require('http').createServer()
    , pagelet
    , P;

  //
  // A lazy mans temper, we just want ignore all temper actions sometimes
  // because our pagelet is not exported using `.on(module)`
  //
  var temper = new Temper
    , pipe = new Pipe(server);

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

    pagelet = new P;
  });

  afterEach(function each() {
    pagelet = null;
  });

  it('rendering is asynchronously', function (done) {
    pagelet.get(pagelet.emits('called'));

    // Listening only till after the event is potentially emitted, will ensure
    // callbacks are called asynchronously by pagelet.render.
    pagelet.on('called', done);
  });

  it('can have reference to temper', function () {
    pagelet = new P({ temper: temper });
    var property = Object.getOwnPropertyDescriptor(pagelet, 'temper');

    assume(pagelet.temper).to.be.an('object');
    assume(property.writable).to.equal(true);
    assume(property.enumerable).to.equal(false);
    assume(property.configurable).to.equal(true);
  });

  it('can have reference to pipe instance', function () {
    pagelet = new P({ pipe: pipe });
    var property = Object.getOwnPropertyDescriptor(pagelet, 'pipe');

    assume(pagelet.pipe).to.be.an('object');
    assume(pagelet.pipe).to.be.instanceof(Pipe);
    assume(property.writable).to.equal(false);
    assume(property.enumerable).to.equal(false);
    assume(property.configurable).to.equal(false);
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

  describe('.discover', function () {
    it('emits discover and returns immediatly if the parent pagelet has no children', function (done) {
      pagelet.once('discover', done);
      pagelet.discover();
    });

    /* Disabled for now, might return before 1.0.0
    it('initializes pagelets by allocating from the Pagelet.freelist', function (done) {
      var Hero = require(__dirname + '/fixtures/pagelets/hero').optimize(app.temper)
        , Faq = require(__dirname + '/fixtures/pages/faq').extend({ pagelets: [ Hero ] })
        , pageletFreelist = sinon.spy(Hero.freelist, 'alloc')
        , faq = new Faq(app);

      faq.once('discover', function () {
        assume(pageletFreelist).to.be.calledOnce;
        done();
      });

      faq.discover();
    });*/
  });

  describe('.children', function () {
    it('is a function', function () {
      assume(Pagelet.children).to.be.a('function');
      assume(P.children).to.be.a('function');
      assume(Pagelet.children).to.equal(P.children);
    });

    it('returns an array', function () {
      var one = P.children()
        , recur = P.extend({
            pagelets: {
              child: P.extend({ name: 'child' })
            }
          }).children('this one');

      assume(one).to.be.an('array');
      assume(one.length).to.equal(0);

      assume(recur).to.be.an('array');
      assume(recur.length).to.equal(1);
    });

    it('will only return children of the pagelet', function () {
      var single = P.children();

      assume(single).to.be.an('array');
      assume(single.length).to.equal(0);
    });

    it('does not do recursive pagelet discovery', function () {
      var recur = P.extend({
        pagelets: {
          child: P.extend({
            name: 'child' ,
            pagelets: {
              another: P.extend({ name: 'another' })
            }
          }),
        }
      }).children('multiple');

      assume(recur).is.an('array');
      assume(recur.length).to.equal(1);
      assume(recur[0].prototype.name).to.equal('child');
    });

    it('sets the pagelets parent name on `_parent`', function () {
      var recur = P.extend({
        pagelets: {
          child: P.extend({
            name: 'child'
          })
        }
      }).children('parental');

      assume(recur[0].prototype._parent).to.equal('parental');
    });
  });
});
