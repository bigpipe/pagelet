describe('Pagelet', function () {
  'use strict';

  var server = require('http').createServer()
    , BigPipe = require('bigpipe')
    , common = require('./common')
    , Temper = require('temper')
    , assume = require('assume')
    , Response = common.Response
    , Request = common.Request
    , Pagelet = require('../')
    , React = require('react')
    , pagelet, P;

  //
  // A lazy mans temper, we just want ignore all temper actions sometimes
  // because our pagelet is not exported using `.on(module)`
  //
  var temper = new Temper
    , bigpipe = new BigPipe(server);

  //
  // Stub for no operation callbacks.
  //
  function noop() {}

  beforeEach(function () {
    P = Pagelet.extend({
      directory: __dirname,
      error: 'fixtures/error.html',
      view: 'fixtures/view.html',
      css: 'fixtures/style.css',
      js: '//cdnjs.cloudflare.com/ajax/libs/d3/3.4.8/d3.min.js',
      dependencies: [
        'http://code.jquery.com/jquery-2.0.0.js',
        'fixtures/custom.js'
      ]
    });

    pagelet = new P({ temper: temper });
  });

  afterEach(function each() {
    pagelet = null;
  });

  it('rendering is asynchronous', function (done) {
    pagelet.get(pagelet.emits('called'));

    // Listening only till after the event is potentially emitted, will ensure
    // callbacks are called asynchronously by pagelet.render.
    pagelet.on('called', done);
  });

  it('can have reference to temper', function () {
    pagelet = new P({ temper: temper });
    var property = Object.getOwnPropertyDescriptor(pagelet, '_temper');

    assume(pagelet._temper).to.be.an('object');
    assume(property.writable).to.equal(true);
    assume(property.enumerable).to.equal(false);
    assume(property.configurable).to.equal(true);
  });

  it('can have reference to bigpipe instance', function () {
    pagelet = new P({ bigpipe: bigpipe });
    var property = Object.getOwnPropertyDescriptor(pagelet, '_bigpipe');

    assume(pagelet._bigpipe).to.be.an('object');
    assume(pagelet._bigpipe).to.be.instanceof(BigPipe);
    assume(property.writable).to.equal(true);
    assume(property.enumerable).to.equal(false);
    assume(property.configurable).to.equal(true);
  });

  describe('#on', function () {
    it('is a function', function () {
      assume(Pagelet.on).is.a('function');
      assume(Pagelet.on.length).to.equal(1);
    });

    it('sets the directory property to dirname', function () {
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

    it('resolves the `error` view', function () {
      assume(P.prototype.error).to.equal('fixtures/error.html');

      P.on(module);
      assume(P.prototype.error).to.equal(__dirname +'/fixtures/error.html');
    });
  });

  describe('#destroy', function () {
    it('is a function', function () {
      assume(pagelet.destroy).to.be.a('function');
      assume(pagelet.destroy.length).to.equal(0);
    });

    it('cleans object references from the Pagelet instance', function () {
      var local = new Pagelet({ temper: temper, bigpipe: bigpipe });
      local.on('test', noop);

      local.destroy();
      assume(local).to.have.property('_temper', null);
      assume(local).to.have.property('_bigpipe', null);
      assume(local).to.have.property('_children', null);
      assume(local).to.have.property('_events', null);
    });
  });

  describe('#discover', function () {
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

  describe('#length', function () {
    it('is a getter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'length');

      assume(Pagelet.prototype).to.have.property('length');
      assume(props).to.have.property('get');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('set', void 0);
      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('returns the childrens length', function () {
      pagelet._children = [ 1, 2, 3 ];
      assume(pagelet.length).to.equal(3);
    });
  });

  describe('#template', function () {
    it('is a function', function () {
      assume(Pagelet.prototype.template).to.be.a('function');
      assume(P.prototype.template).to.be.a('function');
      assume(Pagelet.prototype.template).to.equal(P.prototype.template);
      assume(pagelet.template).to.equal(P.prototype.template);
    });

    it('returns compiled server template from Temper by path', function () {
      var result = pagelet.template(__dirname + '/fixtures/view.html', {
        test: 'data'
      });

      assume(result).to.be.a('string');
      assume(result).to.equal('<h1>Some data fixture</h1>');
    });

    it('returns compiled server React template for jsx templates', function () {
      var result = pagelet.template(__dirname + '/fixtures/view.jsx', {
        Component: React.createClass({
          render: function () {
            return (
              React.createElement('span', null, 'some text')
            );
          }
        }),
        test: 'data'
      });

      assume(result).to.be.a('object');
      assume(React.isValidElement(result)).is.true();
    });

    it('defaults to the pagelets view if no path is provided', function() {
      var result = new (P.extend().on(module))({ temper: temper }).template({
        test: 'data'
      });

      assume(result).to.be.a('string');
      assume(result).to.equal('<h1>Some data fixture</h1>');
    });

    it('provides empty object as fallback for data', function() {
      var result = new (P.extend().on(module))({ temper: temper }).template();

      assume(result).to.be.a('string');
      assume(result).to.equal('<h1>Some {test} fixture</h1>');
    });
  });

  describe('#contentType', function () {
    it('is a getter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'contentType');

      assume(Pagelet.prototype).to.have.property('contentType');
      assume(props).to.have.property('get');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('is a setter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'contentType');

      assume(Pagelet.prototype).to.have.property('contentType');
      assume(props).to.have.property('set');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('sets the Content-Type', function () {
      pagelet.contentType = 'application/test';
      assume(pagelet._contentType).to.equal('application/test');
    });

    it('returns the Content-Type of the pagelet appended with the charset', function () {
      assume(pagelet.contentType).to.equal('text/html;charset=UTF-8');

      pagelet._contentType = 'application/test';
      assume(pagelet.contentType).to.equal('application/test;charset=UTF-8');

      pagelet._charset = 'UTF-7';
      assume(pagelet.contentType).to.equal('application/test;charset=UTF-7');
    });
  });

  describe('#bootstrap', function () {
    it('is a getter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'bootstrap');

      assume(Pagelet.prototype).to.have.property('bootstrap');
      assume(props).to.have.property('get');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('is a setter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'bootstrap');

      assume(Pagelet.prototype).to.have.property('bootstrap');
      assume(props).to.have.property('set');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('sets a reference to a bootstrap pagelet', function () {
      var bootstrap = new (Pagelet.extend({ name: 'bootstrap' }));

      pagelet.bootstrap = bootstrap;
      assume(pagelet._bootstrap).to.equal(bootstrap);
    });

    it('only accepts objects that look like bootstrap pagelets', function () {
      pagelet.bootstrap = 'will not be set';
      assume(pagelet._bootstrap).to.equal(void 0);

      pagelet.bootstrap = { name: 'bootstrap', test: 'will be set' };
      assume(pagelet._bootstrap).to.have.property('test', 'will be set');
    });

    it('returns a reference to the bootstrap pagelet or empty object', function () {
      assume(Object.keys(pagelet.bootstrap).length).to.equal(0);
      assume(pagelet.bootstrap.name).to.equal(void 0);

      var bootstrap = new (Pagelet.extend({ name: 'bootstrap' }));

      pagelet.bootstrap = bootstrap;
      assume(pagelet.bootstrap).to.equal(bootstrap);
    });

    it('returns a reference to self if it is a boostrap pagelet', function () {
      var bootstrap = new (Pagelet.extend({ name: 'bootstrap' }));

      assume(bootstrap.bootstrap).to.equal(bootstrap);
    });
  });

  describe('#active', function () {
    it('is a getter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'active');

      assume(Pagelet.prototype).to.have.property('active');
      assume(props).to.have.property('get');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('is a setter', function () {
      var props = Object.getOwnPropertyDescriptor(Pagelet.prototype, 'active');

      assume(Pagelet.prototype).to.have.property('active');
      assume(props).to.have.property('set');
      assume(props.get).to.be.a('function');

      assume(props).to.have.property('enumerable', false);
      assume(props).to.have.property('configurable', false);
    });

    it('sets the provided value to _active as boolean', function () {
      pagelet.active = 'true';
      assume(pagelet._active).to.equal(true);

      pagelet.active = false;
      assume(pagelet._active).to.equal(false);
    });

    it('returns true if no conditional method is available', function () {
      assume(pagelet.active).to.equal(true);

      pagelet._active = false;
      assume(pagelet.active).to.equal(true);
    });

    it('returns the boolean value of _active if a conditional method is available', function () {
      var Conditional = P.extend({ if: noop })
        , conditional = new Conditional;

      conditional._active = true;
      assume(conditional.active).to.equal(true);

      conditional._active = null;
      assume(conditional.active).to.equal(false);

      conditional._active = false;
      assume(conditional.active).to.equal(false);
    });
  });

  describe('#conditional', function () {
    it('is a function', function () {
      assume(pagelet.conditional).to.be.a('function');
      assume(pagelet.conditional.length).to.equal(3);
    });

    it('has an optional list argument for alternate pagelets', function (done) {
      pagelet.conditional({}, function (authorized) {
        assume(authorized).to.equal(true);
        done();
      });
    });

    it('will use cached boolean value of authenticate', function (done) {
      var Conditional = P.extend({
        if: function stubAuth(req, enabled) {
          assume(enabled).to.be.a('function');
          enabled(req.test === 'stubbed req');
        }
      }), conditional;

      conditional = new Conditional;
      conditional._active = false;

      conditional.conditional({}, function (authorized) {
        assume(authorized).to.equal(false);

        conditional._active = 'invalid boolean';
        conditional.conditional({}, function (authorized) {
          assume(authorized).to.equal(false);
          done();
        });
      });
    });

    it('will authorize if no authorization method is provided', function (done) {
      pagelet.conditional({}, [], function (authorized) {
        assume(authorized).to.equal(true);
        assume(pagelet._active).to.equal(true);
        done();
      });
    });

    it('will call authorization method without conditional pagelets', function (done) {
      var Conditional = P.extend({
        if: function stubAuth(req, enabled) {
          assume(enabled).to.be.a('function');
          enabled(req.test === 'stubbed req');
        }
      });

      new Conditional().conditional({ test: 'stubbed req' }, function (auth) {
        assume(auth).to.equal(true);
        done();
      });
    });

    it('will call authorization method with conditional pagelets', function (done) {
      var Conditional = P.extend({
        if: function stubAuth(req, list, enabled) {
          assume(list).to.be.an('array');
          assume(list.length).to.equal(1);
          assume(list[0]).to.be.instanceof(Pagelet);
          assume(enabled).to.be.a('function');
          enabled(req.test !== 'stubbed req');
        }
      });

      new Conditional().conditional({ test: 'stubbed req' }, [pagelet], function (auth) {
        assume(auth).to.equal(false);
        done();
      });
    });

    it('will default to not authorized if no value is provided to the callback', function (done) {
      var Conditional = P.extend({
        if: function stubAuth(req, list, enabled) {
          assume(list).to.be.an('array');
          assume(list.length).to.equal(0);
          assume(enabled).to.be.a('function');
          enabled();
        }
      });

      new Conditional().conditional({ test: 'stubbed req' }, function (auth) {
        assume(auth).to.equal(false);
        done();
      });
    });
  });

  describe('#redirect', function () {
    it('is a function', function () {
      assume(pagelet.redirect).to.be.a('function');
      assume(pagelet.redirect.length).to.equal(3);
    });

    it('proxies calls to the bigpipe instance', function (done) {
      var CustomPipe = BigPipe.extend({
        redirect: function redirect(ref, path, code, options) {
          assume(ref).to.be.instanceof(Pagelet);
          assume(ref).to.equal(pagelet);
          assume(path).to.equal('/test');
          assume(code).to.equal(404);
          assume(options).to.have.property('cache', false);

          done();
        }
      });

      pagelet = new P({ bigpipe: new CustomPipe(server) });
      pagelet.redirect('/test', 404, {
        cache: false
      });
    });

    it('returns a reference to the pagelet', function () {
      pagelet = new P({ bigpipe: bigpipe });
      pagelet._res = new Response;
      assume(pagelet.redirect('/')).to.equal(pagelet);
    })
  });

  describe('#children', function () {
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
      }).children('multiple');

      assume(recur).is.an('array');
      assume(recur.length).to.equal(2);
      assume(recur[0].prototype.name).to.equal('child');
      assume(recur[1].prototype.name).to.equal('another');
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

  describe('#optimize', function () {
    it('should prepare an async call stack');
    it('should provide optimizer with Pagelet reference if no transform:before event');
  });
});
