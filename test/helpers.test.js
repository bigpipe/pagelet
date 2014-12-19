describe('Helpers', function () {
  'use strict';

  var Pagelet = require('../').extend({ name: 'test' })
    , custom = '/unexisting/absolute/path/to/prepend'
    , helpers = require('../helpers')
    , assume = require('assume');

  describe('.resolve', function () {
    var pagelet, P;

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

    it('is a function', function () {
      assume(helpers.resolve).to.be.a('function');
    });

    it('will resolve provided property on prototype', function () {
      var result = helpers.resolve(P, 'css');

      assume(result).to.equal(P);
      assume(P.prototype.css).to.be.an('array');
      assume(P.prototype.css.length).to.equal(1);
      assume(P.prototype.css[0]).to.equal(__dirname + '/fixtures/style.css');
    });

    it('can resolve multiple properties at once', function () {
      helpers.resolve(P, ['css', 'js']);

      assume(P.prototype.css).to.be.an('array');
      assume(P.prototype.js).to.be.an('array');
      assume(P.prototype.css.length).to.equal(1);
      assume(P.prototype.js.length).to.equal(1);
    });

    it('can be provided with a custom source directory', function () {
      helpers.resolve(P, 'css', custom);

      assume(P.prototype.css[0]).to.equal(custom + '/fixtures/style.css');
    });

    it('only resolves local files', function () {
      helpers.resolve(P, 'js', custom);

      assume(P.prototype.js[0]).to.not.include(custom);
      assume(P.prototype.js[0]).to.equal('//cdnjs.cloudflare.com/ajax/libs/d3/3.4.8/d3.min.js');
    });

    it('can handle property values that are already an array', function () {
      helpers.resolve(P, 'dependencies', custom);

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

      helpers.resolve(Undef, 'dependencies', custom);
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
});
