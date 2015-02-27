describe('Pagelet', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , Temper = require('temper')
    , Pipe = require('bigpipe')
    , assume = require('assume')
    , React = require('react')
    , server = require('http').createServer()
    , pagelet, P;

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
    assume(property.enumerable).to.equal(true);
    assume(property.configurable).to.equal(true);
  });

  it('can have reference to pipe instance', function () {
    pagelet = new P({ pipe: pipe });
    var property = Object.getOwnPropertyDescriptor(pagelet, '_pipe');

    assume(pagelet._pipe).to.be.an('object');
    assume(pagelet._pipe).to.be.instanceof(Pipe);
    assume(property.writable).to.equal(true);
    assume(property.enumerable).to.equal(true);
    assume(property.configurable).to.equal(true);
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

  describe('.length', function () {
    it('is a getter that returns the childrens length', function () {
      pagelet._children = [ 1, 2, 3 ];
      assume(pagelet.length).to.equal(3);
    });
  });

  describe('.template', function () {
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
            )
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

  describe('.optimize', function () {
    it('should prepare an async call stack');
    it('should provide optimizer with Pagelet reference if no transform:before event');
  });
});
