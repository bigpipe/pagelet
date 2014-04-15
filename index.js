'use strict';

var debug = require('debug')('bigpipe:pagelet')
  , jstringify = require('json-stringify-safe')
  , FreeList = require('freelist').FreeList
  , dot = require('dot-component')
  , Temper = require('temper')
  , fuse = require('fusing')
  , path = require('path');

//
// Create singletonian temper usable for constructed pagelets. This will ensure
// caching works properly and allows optimize to use temper.
//
var temper = new Temper();

/**
 * A pagelet is the representation of an item, section, column, widget on the
 * page. It's basically a small sand boxed application within your page.
 *
 * @constructor
 * @api public
 */
function Pagelet() {
  this.fuse();

  this.writable('_authorized', null);                     // Are we authorized
  this.writable('substream', null);                       // Substream from Primus.
  this.readable('temper', temper);                        // Template parser.
  this.writable('id', null);                              // Custom ID of the pagelet.

  //
  // Add an correctly namespaced debug method so it easier to see which pagelet
  // is called by just checking the name of it.
  //
  this.readable('debug', require('debug')('bigpipe:pagelet:'+ this.name));

  this.configure();
}

fuse(Pagelet, require('stream'));

/**
 * Reset the instance to it's original state.
 *
 * @returns {Pagelet}
 * @api private
 */
Pagelet.readable('configure', function configure() {
  this.debug('configuring %s/%s', this.name, this.id);

  //
  // Set a new id.
  //
  this.id = [1, 1, 1, 1].map(function generator() {
    return Math.random().toString(36).substring(2).toUpperCase();
  }).join('-');

  //
  // Clean up possible old references.
  //
  if (this.substream) this.substream.end();
  this.substream = this._authorized = null;

  return this.removeAllListeners();
});

/**
 * A safe and fast `JSON.stringify`.
 *
 * @param {Mixed} data Data that needs to be transformed in to a string.
 * @param {Function} replacer Data replacer.
 * @returns {String}
 * @api public
 */
Pagelet.readable('stringify', function stringify(data, replacer) {
  var result;

  try { result = JSON.stringify(data, replacer); }
  catch (e) {
    this.debug('Failed to normally stringify the data');
    result = jstringify(data, replacer);
  }

  return result;
});

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('name', '');

/**
 * These methods can be remotely called from the client. Please note that they
 * are not set to the client, it will merely be executing on the server side.
 *
 * ```js
 * Pagelet.extend({
 *   RPC: [
 *     'methodname',
 *     'another'
 *   ],
 *
 *   methodname: function methodname(reply) {
 *
 *   }
 * }).on(module);
 * ```
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('RPC', []);

/**
 * An authorization handler to see if the request is authorized to interact with
 * this pagelet. This is set to `null` by default as there isn't any
 * authorization in place. The authorization function will receive 2 arguments:
 *
 * - req, the http request that initialized the pagelet
 * - done, a callback function that needs to be called with only a boolean.
 *
 * ```js
 * Pagelet.extend({
 *   authorize: function authorize(req, done) {
 *     done(true); // True indicates that the request is authorized for access.
 *   }
 * });
 * ```
 *
 * @type {Function}
 * @public
 */
Pagelet.writable('authorize', null);

/**
 * Checks if we're an authorized Pagelet.
 *
 * @type {Boolean}
 * @private
 */
Pagelet.writable('authorized', {
  get: function get() {
    return 'function' !== typeof this.authorize       // No authorization needed.
    || this._authorized && this._authorized !== null; // Authorization has been done.
  },

  set: function set(value) {
    return this._authorized = !!value;
  }
}, true);

/**
 * A pagelet has been initialised.
 *
 * @type {Function}
 * @public
 */
Pagelet.writable('initialize', null);

/**
 * The actual chunk of the response that is written for each pagelet.
 *
 * @type {String}
 * @private
 */
Pagelet.writable('fragment', require('fs').readFileSync(__dirname +'/pagelet.fragment', 'utf-8')
  .split('\n')
  .join('')
);

/**
 * Remove the DOM element if we are unauthorized. This will make it easier to
 * create conditional layouts without having to manage the pointless DOM
 * elements.
 *
 * @type {Boolean}
 * @public
 */
Pagelet.writable('remove', true);

/**
 * The location of your view template. But just because you've got a view
 * template it doesn't mean we will render it. It depends on how the pagelet is
 * called. If it's called from the client side we will only forward the data to
 * server.
 *
 * As a user you need to make sure that your template runs on the client as well
 * as on the server side.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('view', '');

/**
 * List of keys in the data that will be supplied to the client-side script.
 * Paths to nested keys can be supplied via dot notation.
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('query', []);

/**
 * The location of your error template. This template will be rendered when:
 *
 * 1. We receive an `error` argument from your `get` method.
 * 2. Your view throws an error when rendering the template.
 *
 * If no view has been set it will default to the Pagelet's default error
 * template which outputs a small HTML fragrment that states the error.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('error', '');

/**
 * Optional template engine preference. Useful when we detect the wrong template
 * engine based on the view's file name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('engine', '');

/**
 * The location of the Style Sheet for this pagelet. It should contain all the
 * CSS that's needed to render this pagelet. It doesn't have to be a `CSS`
 * extension as these files are passed through `smithy` for automatic
 * pre-processing.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('css', '');

/**
 * The location of the JavaScript file that you need for this page. This file
 * needs to be included in order for this pagelet to function.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('js', '');

/**
 * An array with dependencies that your pagelet depends on. This can be CSS or
 * JavaScript files/frameworks whatever. It should be an array of strings
 * which represent the location of these files.
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('dependencies', []);

/**
 * Save the location where we got our resources from, this will help us with
 * fetching assets from the correct location.
 *
 * @type {String}
 * @private
 */
Pagelet.writable('directory', '');

/**
 * Default asynchronous get function. Override to provide specific data to the
 * render function.
 *
 * @param {Function} done Completion callback when we've received data to render
 * @api public
 */
Pagelet.writable('get', function get(done) {
  (global.setImmediate || global.setTimeout)(done);
});

//
// !IMPORTANT
//
// These function's & properties should never overridden as we might depend on
// them internally, that's why they are configured with writable: false and
// configurable: false by default.
//
// !IMPORTANT
//

/**
 * Render takes care of all the data merging and `get` invocation.
 *
 * Options:
 *   - context: Context on which to call `after`, defaults to pagelet.
 *   - data: stringified object representation to pass to the client.
 *
 * @param {Object} options Add post render functionality.
 * @param {Function} fn Completion callback.
 * @returns {Pagelet}
 * @api private
 */
Pagelet.readable('render', function render(options, fn) {
  if ('undefined' === typeof fn) {
    fn = options;
    options = {};
  }

  options = options || {};

  var context = options.context || this
    , authorized = this.authorized
    , data = options.data || {}
    , query = this.query
    , pagelet = this;

  data.id = data.id || this.id;                         // Pagelet id.
  data.rpc = data.rpc || this.RPC;                      // RPC methods.
  data.remove = authorized ? false : this.remove;       // Remove from DOM.
  data.authorized = authorized;                         // Pagelet was authorized.

  /**
   * Write the fragmented data.
   *
   * @param {String} content The content to respond with.
   * @returns {Pagelet}
   * @api private
   */
  function fragment(content) {
    if (options.substream) {
      data.view = content;
      return fn.call(context, undefined, data);
    }

    data = pagelet.stringify(data, function sanitize(key, data) {
      if ('string' !== typeof data) return data;

      return data
      .replace(/&/gm, '&amp;')
      .replace(/</gm, '&lt;')
      .replace(/>/gm, '&gt;')
      .replace(/"/gm, '&quote;')
      .replace(/'/gm, '&#x27;');
    });

    fn.call(context, undefined, pagelet.fragment
      .replace(/\{pagelet::name\}/g, pagelet.name)
      .replace(/\{pagelet::template\}/g, content.replace(/<!--(.|\s)*?-->/, ''))
      .replace(/\{pagelet::data\}/g, data)
    );

    return pagelet;
  }

  //
  // If we're not authorized, directly call the render method with empty
  // content. So it renders nothing.
  //
  if (!authorized) return fragment('');

  //
  // Invoke the provided get function and make sure options is an object, from
  // which `after` can be called in proper context.
  //
  pagelet.get(function receive(err, result) {
    var view = pagelet.temper.fetch(pagelet.view).server
      , content;

    //
    // We've made it this far, but now we have to cross our fingers and HOPE that
    // our given template can actually handle the data correctly without throwing
    // an error. As the rendering is done synchronously, we wrap it in a try/catch
    // statement and hope that an error is thrown when the template fails to
    // render the content. If there's an error we will process the error template
    // instead.
    //
    try {
      if (err) {
        pagelet.debug('render %s/%s resulted in a error', pagelet.name, pagelet.id, err);
        throw err; // Throw so we can capture it again.
      }

      content = view(result);
    } catch (e) {
      //
      // This is basically fly or die, if the supplied error template throws an
      // error while rendering we're basically fucked, your server will crash,
      // an angry mob of customers with pitchforks will kick in the doors of your
      // office and smear you with peck and feathers for not writing a more stable
      // application.
      //
      if (!pagelet.error) return fn(e);

      content = pagelet.temper.fetch(pagelet.error).server(pagelet.merge(result, {
        reason: 'Failed to render: '+ pagelet.name,
        env: process.env.NODE_ENV || 'development',
        message: e.message,
        stack: e.stack
      }));
    }

    //
    // Add queried parts of data, so the client-side script can use it.
    //
    if ('object' === typeof result && Array.isArray(query)) {
      data.data = query.reduce(function find(memo, q) {
        memo[q] = dot.get(result, q);
        return memo;
      }, {});
    }

    fragment(content);
  });

  return this;
});

/**
 * Connect with a Primus substream.
 *
 * @param {Spark} spark The Primus connection.
 * @param {Function} next The completion callback
 * @returns {Pagelet}
 * @api private
 */
Pagelet.readable('connect', function connect(spark, next) {
  var pagelet = this;

  /**
   * Create a new substream.
   *
   * @param {Boolean} authorized Allowed to use this pagelet.
   * @returns {Pagelet}
   * @api private
   */
  function substream(authorized) {
    if (!authorized) return next(new Error('Unauthorized to access this pagelet'));

    var stream = pagelet.substream = spark.substream(pagelet.name);

    stream.once('end', pagelet.emits('end'));
    stream.on('data', function streamed(data) {
      switch (data.type) {
        case 'rpc':
          pagelet.call(data);
        break;

        case 'emit':
          pagelet.emit.apply(pagelet, [data.name].concat(data.args));
        break;

        case 'get':
          pagelet.render({ substream: true }, function renderd(err, fragment) {
            pagelet.write({ type: 'fragment', fragment: fragment, err: err });
          });
        break;
        // @TODO handle get/post/put
      }
    });

    next(undefined, pagelet);
    return pagelet;
  }

  if ('function' !== this.authorize) return substream(true);
  this.authorize(spark.request, substream);

  return this;
});

/**
 * Authenticate the Pagelet.
 *
 * @param {Request} req The HTTP request.
 * @param {Function} fn The authorized callback.
 * @returns {Pagelet}
 * @api private
 */
Pagelet.readable('authenticate', function authenticate(req, fn) {
  var pagelet = this;

  if ('function' !== typeof this.authorize) {
    fn(pagelet.authorized = true);
  } else {
    pagelet.authorize(req, function authorized(value) {
      fn(pagelet.authorized = value);
    });
  }

  return pagelet;
});

/**
 * Call an rpc method.
 *
 * @param {Object} data The RPC call information.
 * @api private
 */
Pagelet.readable('call', function calls(data) {
  var index = this.RPC.indexOf(data.method)
    , fn = this[data.method]
    , pagelet = this
    , err;

  if (!~index || 'function' !== typeof fn) return this.substream.write({
    args: [new Error('RPC method is not known')],
    type: 'rpc',
    id: data.id
  });

  //
  // Our RPC pattern is a callback first pattern, where the callback is the
  // first argument that a function receives. This makes it a lot easier to add
  // a variable length of arguments to a function call.
  //
  fn.apply(pagelet, [function reply() {
    pagelet.substream.write({
      args: Array.prototype.slice.call(arguments, 0),
      type: 'rpc',
      id: data.id
    });
  }].concat(data.args));
});

/**
 * Expose the Pagelet on the exports and parse our the directory. This ensures
 * that we can properly resolve all relative assets:
 *
 * ```js
 * Pagelet.extend({
 *   ..
 * }).on(module);
 * ```
 *
 * @param {Module} module The reference to the module object.
 * @returns {Pagelet}
 * @api public
 */
Pagelet.on = function on(module) {
  this.prototype.directory = path.dirname(module.filename);
  module.exports = this;

  return this;
};

/**
 * Optimize the prototypes of the Pagelet to reduce work when we're actually
 * serving the requests.
 *
 * @param {Function} hook Hook into optimize, function will be called with Pagelet.
 * @returns {Pagelet}
 * @api private
 */
Pagelet.optimize = function optimize(hook) {
  var Pagelet = this
    , prototype = Pagelet.prototype
    , dir = prototype.directory;

  //
  // This pagelet has already been processed before as pages can share
  // pagelets.
  //
  if (Pagelet.properties) return Pagelet;

  debug('Optimizing pagelet %s for FreeList', prototype.name);
  if (prototype.view) {
    prototype.view = path.resolve(dir, prototype.view);
    temper.prefetch(prototype.view, prototype.engine);
  }

  //
  // Ensure that we have a custom error page for when we fail to render this
  // fragment.
  //
  if (prototype.error) {
    prototype.error = path.resolve(dir, prototype.error);
    temper.prefetch(prototype.error, prototype.engine);
  } else {
    prototype.error = path.resolve(__dirname, 'error.ejs');
    temper.prefetch(prototype.error, '');
  }

  if (prototype.css) prototype.css = path.resolve(dir, prototype.css);
  if (prototype.js) prototype.js = path.resolve(dir, prototype.js);

  //
  // Make sure that all our dependencies are also directly mapped to an
  // absolute URL.
  //
  if (prototype.dependencies) {
    prototype.dependencies = prototype.dependencies.map(function each(dep) {
      if (/^(http:|https:)?\/\//.test(dep)) return dep;
      return path.resolve(dir, dep);
    });
  }

  //
  // Aliasing, some methods can be written with different names or American
  // vs Britain vs old English. For example `initialise` vs `initialize` but
  // also the use of CAPS like `RPC` vs `rpc`
  //
  if (Array.isArray(prototype.rpc) && !prototype.RPC.length) {
    prototype.RPC = prototype.rpc;
  }

  if ('string' === typeof prototype.RPC) {
    prototype.RPC= prototype.RPC.split(/[\s|\,]/);
  }

  if ('function' === typeof prototype.initialise) {
    prototype.initialize = prototype.initialise;
  }

  //
  // Allow plugins to hook in the transformation process, so emit it when
  // all our transformations are done and before we create a copy of the
  // "fixed" properties which later can be re-used again to restore
  // a generated instance to it's original state.
  //
  if ('function' === typeof hook) hook(Pagelet);
  Pagelet.properties = Object.keys(Pagelet.prototype);

  //
  // Setup a FreeList for the pagelets so we can re-use the pagelet
  // instances and reduce garbage collection.
  //
  Pagelet.freelist = new FreeList(
    'pagelet',
    prototype.freelist || 1000,
    function allocate() {
      var pagelet = new Pagelet();

      pagelet.once('free', function free() {
        Pagelet.freelist.free(pagelet);
        pagelet = null;
      });

      return pagelet;
    }
  );

  return Pagelet;
};

//
// Expose the pagelet.
//
module.exports = Pagelet;
