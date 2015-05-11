'use strict';

var Formidable = require('formidable').IncomingForm
  , fabricate = require('fabricator')
  , helpers = require('./helpers')
  , debug = require('diagnostics')
  , dot = require('dot-component')
  , destroy = require('demolish')
  , Route = require('routable')
  , fuse = require('fusing')
  , async = require('async')
  , path = require('path')
  , url = require('url');

//
// Cache long prototype lookups to increase speed + write shorter code.
//
var slice = Array.prototype.slice;

//
// Methods that needs data buffering.
//
var operations = 'POST, PUT, DELETE, PATCH'.toLowerCase().split(', ');

/**
 * Simple helper function to generate some what unique id's for given
 * constructed pagelet.
 *
 * @returns {String}
 * @api private
 */
function generator(n) {
  if (!n) return Date.now().toString(36).toUpperCase();
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * A pagelet is the representation of an item, section, column or widget.
 * It's basically a small sandboxed application within your application.
 *
 * @constructor
 * @param {Object} options Optional configuration.
 * @api public
 */
function Pagelet(options) {
  if (!this) return new Pagelet(options);

  this.fuse();
  options = options || {};

  //
  // Use the temper instance on Pipe if available.
  //
  if (options.bigpipe && options.bigpipe._temper) {
    options.temper = options.bigpipe._temper;
  }

  this.writable('_enabled', []);                        // Contains all enabled pagelets.
  this.writable('_disabled', []);                       // Contains all disable pagelets.
  this.writable('_active', null);                       // Are we active.
  this.writable('_req', options.req);                   // Incoming HTTP request.
  this.writable('_res', options.res);                   // Incoming HTTP response.
  this.writable('_params', options.params);             // Params extracted from the route.
  this.writable('_temper', options.temper);             // Attach the Temper instance.
  this.writable('_bigpipe', options.bigpipe);           // Actual pipe instance.
  this.writable('_bootstrap', options.bootstrap);       // Reference to bootstrap Pagelet.
  this.writable('_append', options.append || false);    // Append content client-side.

  this.writable('debug', debug('pagelet:'+ this.name)); // Namespaced debug method

  //
  // Allow overriding the reference to parent pagelet.
  // A reference to the parent is normally set on the
  // constructor prototype by optimize.
  //
  if (options.parent) this.writable('_parent', options.parent);
}

fuse(Pagelet, require('eventemitter3'));

/**
 * Unique id, useful for internal querying.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('id', null);

/**
 * The name of this pagelet so it can checked to see if's enabled. In addition
 * to that, it can be injected in to placeholders using this name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('name', '');

/**
 * The HTTP pathname that we should be matching against.
 *
 * @type {String|RegExp}
 * @public
 */
Pagelet.writable('path', null);

/**
 * Which HTTP methods should this pagelet accept. It can be a comma
 * separated string or an array.
 *
 * @type {String|Array}
 * @public
 */
Pagelet.writable('method', 'GET');

/**
 * The default status code that we should send back to the user.
 *
 * @type {Number}
 * @public
 */
Pagelet.writable('statusCode', 200);

/**
 * The pagelets that need to be loaded as children of this pagelet.
 *
 * @type {Object}
 * @public
 */
Pagelet.writable('pagelets', {});

/**
 * With what kind of generation mode do we need to output the generated
 * pagelets. We're supporting 3 different modes:
 *
 * - sync:      Fully render without any fancy flushing of pagelets.
 * - async:     Render all pagelets async and flush them as fast as possible.
 * - pipeline:  Same as async but in the specified order.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('mode', 'async');

/**
 * Save the location where we got our resources from, this will help us with
 * fetching assets from the correct location.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('directory', '');

/**
 * The environment that we're running this pagelet in. If this is set to
 * `development` It would be verbose.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('env', (process.env.NODE_ENV || 'development').toLowerCase());

/**
 * Conditionally load this pagelet. It can also be used as authorization handler.
 * If the incoming request is not authorized you can prevent this pagelet from
 * showing. The assigned function receives 3 arguments.
 *
 * - req, the http request that initialized the pagelet
 * - list, array of pagelets that will be tried
 * - done, a callback function that needs to be called with only a boolean.
 *
 * ```js
 * Pagelet.extend({
 *   if: function conditional(req, list, done) {
 *     done(true); // True indicates that the request is authorized for access.
 *   }
 * });
 * ```
 *
 */
Pagelet.writable('if', null);

/**
 * A pagelet has been initialized.
 *
 * @type {Function}
 * @public
 */
Pagelet.writable('initialize', null);

/**
 * Remove the DOM element if we are not enabled. This will make it easier to
 * create conditional layouts without having to manage the pointless DOM
 * elements.
 *
 * @type {Boolean}
 * @public
 */
Pagelet.writable('remove', true);

/**
 * List of keys in the data that will be supplied to the client-side script.
 * Paths to nested keys can be supplied via dot notation.
 *
 * @type {Array}
 * @public
 */
Pagelet.writable('query', []);

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
Pagelet.writable('view', null);

/**
 * The location of your error template. This template will be rendered when:
 *
 * 1. We receive an `error` argument from your `get` method.
 * 2. Your view throws an error when rendering the template.
 *
 * If no view has been set it will default to the Pagelet's default error
 * template which outputs a small HTML fragment that states the error.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('error', path.join(__dirname, 'error.html'));

/**
 * Optional template engine preference. Useful when we detect the wrong template
 * engine based on the view's file name. If no engine is provide we will attempt
 * to figure out the correct template engine based on the file extension of the
 * provided template path.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('engine', '');

/**
 * The Style Sheet for this pagelet. The location can be a string or multiple paths
 * in an array. It should contain all the CSS that's needed to render this pagelet.
 * It doesn't have to be a `CSS` extension as these files are passed through
 * `smithy` for automatic pre-processing.
 *
 * @type {String|Array}
 * @public
 */
Pagelet.writable('css', '');

/**
 * The JavaScript files needed for this pagelet. The location can be a string or
 * multiple paths in an array. This file needs to be included in order for
 * this pagelet to function.
 *
 * @type {String|Array}
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
 * fetching assets from the correct location. This property is automatically set
 * when the you do:
 *
 * ```js
 * Pagelet.extend({}).on(module);
 * ```
 *
 * If you do not use this pattern make sure you set an absolute path the
 * directory that the pagelet and all it's resources are in.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('directory', '');

/**
 * Reference to parent Pagelet name.
 *
 * @type {Object}
 * @private
 */
Pagelet.writable('_parent', null);

/**
 * Set of optimized children Pagelet.
 *
 * @type {Object}
 * @private
 */
Pagelet.writable('_children', {});

/**
 * Cataloged dependencies by extension.
 *
 * @type {Object}
 * @private
 */
Pagelet.writable('_dependencies', {});

/**
 * Default character set, UTF-8.
 *
 * @type {String}
 * @private
 */
Pagelet.writable('_charset', 'UTF-8');

/**
 * Default content type of the Pagelet.
 *
 * @type {String}
 * @private
 */
Pagelet.writable('_contentType', 'text/html');

/**
 * Default asynchronous get function. Override to provide specific data to the
 * render function.
 *
 * @param {Function} done Completion callback when we've received data to render.
 * @api public
 */
Pagelet.writable('get', function get(done) {
  (global.setImmediate || global.setTimeout)(done);
});

/**
 * Get parameters that were extracted from the route.
 *
 * @type {Object}
 * @public
 */
Pagelet.readable('params', {
  enumerable: false,
  get: function params() {
    return this._params || this.bootstrap._params || Object.create(null);
  }
}, true);

/**
 * Report the length of the queue (e.g. amount of children). The length
 * is increased with one as the reporting pagelet is part of the queue.
 *
 * @return {Number} Length of queue.
 * @api private
 */
Pagelet.get('length', function length() {
  return this._children.length;
});

/**
 * Get and initialize a given child Pagelet.
 *
 * @param {String} name Name of the child pagelet.
 * @returns {Array} The pagelet instances.
 * @api public
 */
Pagelet.readable('child', function child(name) {
  if (Array.isArray(name)) name = name[0];
  return (this.has(name) || this.has(name, true) || []).slice(0);
});

/**
 * Helper to invoke a specific route with an optionally provided method.
 * Useful for serving a pagelet after handling POST requests for example.
 *
 * @param {String} route Registered path.
 * @param {String} method Optional HTTP verb.
 * @returns {Pagelet} fluent interface.
 */
Pagelet.readable('serve', function serve(route, method) {
  var req = this._req
    , res = this._res;

  req.method = (method || 'get').toUpperCase();
  req.uri = url.parse(route);

  this._bigpipe.router(req, res);
  return this;
});

/**
 * Helper to check if the pagelet has a child pagelet by name, must use
 * prototype.name since pagelets are not always constructed yet.
 *
 * @param {String} name Name of the pagelet.
 * @param {String} enabled Make sure that we use the enabled array.
 * @returns {Array} The constructors of matching Pagelets.
 * @api public
 */
Pagelet.readable('has', function has(name, enabled) {
  if (!name) return [];

  if (enabled) return this._enabled.filter(function filter(pagelet) {
    return pagelet.name === name;
  });

  var pagelets = this._children
    , i = pagelets.length
    , pagelet;

  while (i--) {
    pagelet = pagelets[i][0];

    if (
       pagelet.prototype && pagelet.prototype.name === name
    || pagelets.name === name
    ) return pagelets[i];
  }

  return [];
});

/**
 * Render execution flow.
 *
 * @api private
 */
Pagelet.readable('init', function init() {
  var method = this._req.method.toLowerCase()
    , pagelet = this;

  //
  // Only start reading the incoming POST request when we accept the incoming
  // method for read operations. Render in a regular mode if we do not accept
  // these requests.
  //
  if (~operations.indexOf(method)) {
    var pagelets = this.child(this._req.query._pagelet)
      , reader = this.read(pagelet);

    this.debug('Processing %s request', method);

    async.whilst(function work() {
      return !!pagelets.length;
    }, function process(next) {
      var Child = pagelets.shift()
        , child;

      if (!(method in Pagelet.prototype)) return next();

      child = new Child({ bigpipe: pagelet._bigpipe });
      child.conditional(pagelet._req, pagelets, function allowed(accepted) {
        if (!accepted) {
          if (child.destroy) child.destroy();
          return next();
        }

        reader.before(child[method], child);
      });
    }, function nothing() {
      if (method in pagelet) {
        reader.before(pagelet[method], pagelet);
      } else {
        pagelet._bigpipe[pagelet.mode](pagelet);
      }
    });
  } else {
    this._bigpipe[this.mode](this);
  }
});

/**
 * Start buffering and reading the incoming request.
 *
 * @returns {Form}
 * @api private
 */
Pagelet.readable('read', function read() {
  var form = new Formidable
    , pagelet = this
    , fields = {}
    , files = {}
    , context
    , before;

  form.on('progress', function progress(received, expected) {
    //
    // @TODO if we're not sure yet if we should handle this form, we should only
    // buffer it to a predefined amount of bytes. Once that limit is reached we
    // need to `form.pause()` so the client stops uploading data. Once we're
    // given the heads up, we can safely resume the form and it's uploading.
    //
  }).on('field', function field(key, value) {
    fields[key] = value;
  }).on('file', function file(key, value) {
    files[key] = value;
  }).on('error', function error(err) {
    pagelet.capture(err, true);
    fields = files = {};
  }).on('end', function end() {
    form.removeAllListeners();

    if (before) {
      before.call(context, fields, files);
    }
  });

  /**
   * Add a hook for adding a completion callback.
   *
   * @param {Function} callback
   * @returns {Form}
   * @api public
   */
  form.before = function befores(callback, contexts) {
    if (form.listeners('end').length)  {
      form.resume();      // Resume a possible buffered post.

      before = callback;
      context = contexts;

      return form;
    }

    callback.call(contexts || context, fields, files);
    return form;
  };

  return form.parse(this._req);
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
 * Discover pagelets that we're allowed to use.
 *
 * @returns {Pagelet} fluent interface
 * @api private
 */
Pagelet.readable('discover', function discover() {
  var req = this._req
    , res = this._res
    , pagelet = this;

  //
  // We need to do an async map/filter of the pagelets, in order to this as
  // efficient as possible we're going to use a reduce.
  //
  async.reduce(this._children, {
    disabled: [],
    enabled: []
  }, function reduce(memo, children, next) {
    children = children.slice(0);

    var child, last;

    async.whilst(function work() {
      return children.length && !child;
    }, function work(next) {
      var Child = children.shift()
        , test = new Child({
            bootstrap: pagelet.bootstrap,
            bigpipe: pagelet._bigpipe,
            res: res,
            req: req
          });

      test.conditional(req, children, function conditionally(accepted) {
        if (last && last.destroy) last.destroy();

        if (accepted) child = test;
        else last = test;

        next(!!child);
      });
    }, function found() {
      if (child) memo.enabled.push(child);
      else memo.disabled.push(last);

      next(undefined, memo);
    });
  }, function discovered(err, children) {
    pagelet._disabled = children.disabled;
    pagelet._enabled = children.enabled;

    pagelet._enabled.forEach(function initialize(child) {
      if ('function' === typeof child.initialize) child.initialize();
    });

    pagelet.debug('Initialized all allowed pagelets');
    pagelet.emit('discover');
  });

  return this;
});

/**
 * Process the pagelet for an async or pipeline based render flow.
 *
 * @param {String} name Optional name, defaults to pagelet.name.
 * @param {Mixed} chunk Content of Pagelet.
 * @returns {Bootstrap} Reference to bootstrap Pagelet.
 * @api private
 */
Pagelet.readable('write', function write(name, chunk) {
  if (!chunk) {
    chunk = name;
    name = this.name;
  }

  this.debug('Queueing data chunk');
  return this.bootstrap.queue(name, this._parent, chunk);
});

/**
 * Close the connection once all pagelets are sent.
 *
 * @param {Mixed} chunk Fragment of data.
 * @returns {Boolean} Closed the connection.
 * @api private
 */
Pagelet.readable('end', function end(chunk) {
  var pagelet = this;

  //
  // Write data chunk to the queue.
  //
  if (chunk) this.write(chunk);

  //
  // Do not close the connection before all pagelets are send.
  //
  if (this.bootstrap.length > 0) {
    this.debug('Not all pagelets have been written, (%s out of %s)',
      this.bootstrap.length, this.length
    );
    return false;
  }

  //
  // Everything is processed, close the connection and clean up references.
  //
  this.bootstrap.flush(function close(error) {
    if (error) return pagelet.capture(error, true);

    pagelet.debug('Closed the connection');
    pagelet._res.end();
  });

  return true;
});

/**
 * Set or get the value of the character set, only allows strings.
 *
 * @type {String}
 * @api public
 */
Pagelet.set('charset', function get() {
  return this._charset;
}, function set(value) {
  if ('string' !== typeof value) return;
  return this._charset = value;
});

/**
 * The Content-Type of the response. This defaults to text/html with a charset
 * preset inherited from the charset property.
 *
 * @type {String}
 * @api public
 */
Pagelet.set('contentType', function get() {
  return this._contentType +';charset='+ this._charset;
}, function set(value) {
  return this._contentType = value;
});

/**
 * Returns reference to bootstrap Pagelet, which could be the Pagelet itself.
 * Allows more chaining and valid bootstrap Pagelet references.
 *
 * @type {String}
 * @public
 */
Pagelet.set('bootstrap', function get() {
  return !this._bootstrap && this.name === 'bootstrap' ? this : this._bootstrap || {};
}, function set(value) {
  if (value && value.name === 'bootstrap') return this._bootstrap = value;
});

/**
 * Checks if we're an active Pagelet or if we still need to a do an check
 * against the `if` function.
 *
 * @type {Boolean}
 * @private
 */
Pagelet.set('active', function get() {
  return 'function' !== typeof this.if              // No conditional check needed.
  || this._active !== null && this._active;         // Conditional check has been done.
}, function set(value) {
  return this._active = !!value;
});

/**
 * Helper method that proxies to the redirect of the BigPipe instance.
 *
 * @param {String} path Redirect URI.
 * @param {Number} status Optional status code.
 * @param {Object} options Optional options, e.g. caching headers.
 * @returns {Pagelet} fluent interface.
 * @api public
 */
Pagelet.readable('redirect', function redirect(path, status, options) {
  this._bigpipe.redirect(this, path, status, options);
  return this;
});

/**
 * Proxy to return the compiled server template from Temper.
 *
 * @param {String} view Absolute path to the templates location.
 * @param {Object} data Used to render the server-side template.
 * @return {String} Generated HTML.
 * @public
 */
Pagelet.readable('template', function template(view, data) {
  if ('string' !== typeof view) {
    data = view;
    view = this.view;
  }

  return this._temper.fetch(view).server(data || {});
});

/**
 * Render takes care of all the data merging and `get` invocation.
 *
 * Options:
 *
 *   - context: Context on which to call `after`, defaults to pagelet.
 *   - data: stringified object representation to pass to the client.
 *   - pagelets: Alternate pagelets to be used when this pagelet is not enabled.
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

  var framework = this._bigpipe._framework
    , compiler = this._bigpipe._compiler
    , context = options.context || this
    , mode = options.mode || 'async'
    , data = options.data || {}
    , bigpipe = this._bigpipe
    , temper = this._temper
    , query = this.query
    , pagelet = this
    , state = {};

  /**
   * Write the fragmented data.
   *
   * @param {String} content The content to respond with.
   * @returns {Pagelet}
   * @api private
   */
  function fragment(content) {
    var active = pagelet.active;

    if (!active) content = '';
    if (mode === 'sync') return fn.call(context, undefined, content);

    data.id = data.id || pagelet.id;                 // Pagelet id.
    data.path = data.path || pagelet.path;           // Reference to the path.
    data.mode = data.mode || pagelet.mode;           // Pagelet render mode.
    data.remove = active ? false : pagelet.remove;   // Remove from DOM.
    data.parent = pagelet._parent;                   // Send parent name along.
    data.append = pagelet._append;                   // Content should be appended.
    data.remaining = pagelet.bootstrap.length;       // Remaining pagelets number.
    data.hash = {                                    // Temper md5's for template ref
      error: temper.fetch(pagelet.error).hash.client,
      client: temper.fetch(pagelet.view).hash.client
    };

    fn.call(context, undefined, framework.get('fragment', {
      template: content.replace(/<!--(.|\s)*?-->/, ''),
      name: pagelet.name,
      id: pagelet.id,
      state: state,
      data: data
    }));

    return pagelet;
  }

  return this.conditional(this._req, options.pagelets, function auth(enabled) {
    if (!enabled) return fragment('');

    //
    // Invoke the provided get function and make sure options is an object, from
    // which `after` can be called in proper context.
    //
    pagelet.get(function receive(err, result) {
      var view = temper.fetch(pagelet.view).server
        , content;

      //
      // Add some template defaults.
      //
      result = result || {};
      if (!('path' in result)) result.path = pagelet.path;

      //
      // We've made it this far, but now we have to cross our fingers and HOPE
      // that our given template can actually handle the data correctly
      // without throwing an error. As the rendering is done synchronously, we
      // wrap it in a try/catch statement and hope that an error is thrown
      // when the template fails to render the content. If there's an error we
      // will process the error template instead.
      //
      try {
        if (err) {
          pagelet.debug('Render %s/%s resulted in a error', pagelet.name, pagelet.id, err);
          throw err; // Throw so we can capture it again.
        }

        content = view(result, { html: true });
      } catch (e) {
        if ('production' !== pagelet.env) {
          pagelet.debug('Captured rendering error: %s', e.stack);
        }

        //
        // This is basically fly or die, if the supplied error template throws
        // an error while rendering we're basically fucked, your server will
        // crash, an angry mob of customers with pitchforks will kick in the
        // doors of your office and smear you with peck and feathers for not
        // writing a more stable application.
        //
        if (!pagelet.error) return fn(e);

        content = temper.fetch(pagelet.error).server(pagelet.merge(result, {
          reason: 'Failed to render: '+ pagelet.name,
          env: pagelet.env,
          message: e.message,
          stack: e.stack,
          error: e
        }), { html: true });
      }

      //
      // Add queried parts of data, so the client-side script can use it.
      //
      if ('object' === typeof result && Array.isArray(query) && query.length) {
        state = query.reduce(function find(memo, q) {
          memo[q] = dot.get(result, q);
          return memo;
        }, {});
      }

      fragment(content);
    });
  });
});

/**
 * Authenticate the Pagelet.
 *
 * @param {Request} req The HTTP request.
 * @param {Function} list Array of optional alternate pagelets that take it's place.
 * @param {Function} fn The authorized callback.
 * @returns {Pagelet}
 * @api private
 */
Pagelet.readable('conditional', function conditional(req, list, fn) {
  var pagelet = this;

  if ('function' !== typeof fn) {
    fn = list;
    list = [];
  }

  /**
   * Callback for the `pagelet.if` function to see if we're enabled or disabled.
   * Use cached value in _active to prevent the same Pagelet being authorized
   * multiple times for the same request.
   *
   * @param {Boolean} value Are we enabled or disabled.
   * @api private
   */
  function enabled(value) {
    fn.call(pagelet, pagelet.active = value || false);
  }

  if ('boolean' === typeof pagelet._active) {
    fn(pagelet.active);
  } else if ('function' !== typeof this.if) {
    fn(pagelet.active = true);
  } else {
    if (pagelet.if.length === 2) pagelet.if(req, enabled);
    else pagelet.if(req, list, enabled);
  }

  return pagelet;
});

/**
 * Destroy the pagelet and remove all the back references so it can be safely
 * garbage collected.
 *
 * @api public
 */
Pagelet.readable('destroy', destroy([
  '_temper', '_bigpipe', '_enabled', '_disabled', '_children'
], {
  after: 'removeAllListeners'
}));


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
 * The use of this function is for convenience and optional. Developers can
 * choose to provide absolute paths to files.
 *
 * @param {Module} module The reference to the module object.
 * @returns {Pagelet}
 * @api public
 */
Pagelet.on = function on(module) {
  var prototype = this.prototype
    , dir = prototype.directory = path.dirname(module.filename);

  //
  // Resolve the view and error templates to ensure
  // absolute paths are provided to Temper.
  //
  if (prototype.error) prototype.error = path.resolve(dir, prototype.error);
  if (prototype.view) prototype.view = path.resolve(dir, prototype.view);

  return module.exports = this;
};

/**
 * Discover all pagelets recursive. Fabricate will create constructable
 * instances from the provided value of prototype.pagelets.
 *
 * @param {String} parent Reference to the parent pagelet name.
 * @return {Array} collection of pagelets instances.
 * @api public
 */
Pagelet.children = function children(parent, stack) {
  var pagelets = this.prototype.pagelets
    , log = debug('pagelet:'+ parent);

  stack = stack || [];
  return fabricate(pagelets, {
    source: this.prototype.directory,
    recursive: 'string' === typeof pagelets
  }).reduce(function each(stack, Pagelet) {
    //
    // Pagelet could be conditional, simple crawl this function
    // again to get the children of each conditional.
    //
    if (Array.isArray(Pagelet)) return Pagelet.reduce(each, []);

    var name = Pagelet.prototype.name;
    log('Recursive discovery of child pagelet %s', name);

    //
    // We need to extend the pagelet if it already has a _parent name reference
    // or will accidentally override it. This can happen when you extend a parent
    // pagelet with children and alter the parent's name. The extended parent and
    // regular parent still point to the same child pagelets. So when we try to
    // set the proper parent, these pagelets will override the _parent property
    // unless we create a new fresh instance and set it on that instead.
    //
    if (Pagelet.prototype._parent && name !== parent) {
      Pagelet = Pagelet.extend();
    }

    Pagelet.prototype._parent = parent;
    return Pagelet.children(name, stack.concat(Pagelet));
  }, stack);
};

/**
 * Optimize the prototypes of Pagelets to reduce work when we're actually
 * serving the requests via BigPipe.
 *
 * Options:
 * - temper: A custom temper instance we want to use to compile the templates.
 *
 * @param {Object} options Optimization configuration.
 * @param {Function} next Completion callback for async execution.
 * @api public
 */
Pagelet.optimize = function optimize(options, done) {
  if ('function' === typeof options) {
    done = options;
    options = {};
  }

  var stack = []
    , Pagelet = this
    , bigpipe = options.bigpipe || {}
    , transform = options.transform || {}
    , temper = options.temper || bigpipe._temper
    , before, after;

  //
  // Check if before listener is found. Add before emit to the stack.
  // This async function will be called before optimize.
  //
  if (bigpipe._events && 'transform:pagelet:before' in bigpipe._events) {
    before = bigpipe._events['transform:pagelet:before'].length || 1;

    stack.push(function run(next) {
      var n = 0;

      transform.before(Pagelet, function ran(error, Pagelet) {
        if (error || ++n === before) return next(error, Pagelet);
      });
    });
  }

  //
  // If transform.before was not pushed on the stack, optimizer needs
  // to called with a reference to Pagelet.
  //
  stack.push(!stack.length ? async.apply(optimizer, Pagelet) : optimizer);

  //
  // Check if after listener is found. Add after emit to the stack.
  // This async function will be called after optimize.
  //
  if (bigpipe._events && 'transform:pagelet:after' in bigpipe._events) {
    after = bigpipe._events['transform:pagelet:after'].length || 1;

    stack.push(function run(Pagelet, next) {
      var n = 0;

      transform.after(Pagelet, function ran(error, Pagelet) {
        if (error || ++n === after) return next(error, Pagelet);
      });
    });
  }

  //
  // Run the stack in series. This ensures that before hooks are run
  // prior to optimizing and after hooks are ran post optimizing.
  //
  async.waterfall(stack, done);

  /**
   * Optimize the pagelet. This function is called by default as part of
   * the async stack.
   *
   * @param {Function} next Completion callback
   * @api private
   */
  function optimizer(Pagelet, next) {
    var prototype = Pagelet.prototype
      , method = prototype.method
      , status = prototype.status
      , router = prototype.path
      , name = prototype.name
      , view = prototype.view
      , log = debug('pagelet:'+ name);

    //
    // Generate a unique ID used for real time connection lookups.
    //
    prototype.id = options.id || [0, 1, 1, 1].map(generator).join('-');

    //
    // Parse the methods to an array of accepted HTTP methods. We'll only accept
    // these requests and should deny every other possible method.
    //
    log('Optimizing pagelet');
    if (!Array.isArray(method)) method = method.split(/[\s\,]+?/);
    Pagelet.method = method.filter(Boolean).map(function transformation(method) {
      return method.toUpperCase();
    });

    //
    // Add the actual HTTP route and available HTTP methods.
    //
    if (router) {
      log('Instantiating router for path %s', router);
      Pagelet.router = new Route(router);
    }

    //
    // Prefetch the template if a view is available. The view property is
    // mandatory for all pagelets except the bootstrap Pagelet or if the
    // Pagelet is just doing a redirect. We can resolve this edge case by
    // checking if statusCode is in the 300~ range.
    //
    if (!view && name !== 'bootstrap' && !(status >= 300 && status < 400)) return next(
      new Error('The '+ name +' pagelet should have a .view property.')
    );

    //
    // Resolve the view to ensure the path is correct and prefetch
    // the template through Temper.
    //
    if (view) {
      prototype.view = view = path.resolve(prototype.directory, view);
      temper.prefetch(view, prototype.engine);
    }

    //
    // Ensure we have a custom error pagelet when we fail to render this fragment.
    //
    if (prototype.error) {
      temper.prefetch(prototype.error, path.extname(prototype.error).slice(1));
    }

    //
    // Map all dependencies to an absolute path or URL.
    //
    helpers.resolve(Pagelet, ['css', 'js', 'dependencies']);

    //
    // Find all child pagelets and optimize the found children.
    //
    async.map(Pagelet.children(name), function map(Child, step) {
      if (Array.isArray(Child)) return async.map(Child, map, step);

      Child.optimize({
        temper: temper,
        bigpipe: bigpipe,
        transform: {
          before: bigpipe.emits && bigpipe.emits('transform:pagelet:before'),
          after: bigpipe.emits && bigpipe.emits('transform:pagelet:after')
        }
      }, step);
    }, function optimized(error, children) {
      log('optimized all %d child pagelets', children.length);

      if (error) return next(error);

      //
      // Store the optimized children on the prototype, wrapping the Pagelet
      // in an array makes it a lot easier to work with conditional Pagelets.
      //
      prototype._children = children.map(function map(Pagelet) {
        return Array.isArray(Pagelet) ? Pagelet : [Pagelet];
      });

      //
      // Always return a reference to the parent Pagelet.
      // Otherwise the stack of parents would be infested
      // with children returned by this async.map.
      //
      next(null, Pagelet);
    });
  }
};

//
// Expose the pagelet.
//
module.exports = Pagelet;
