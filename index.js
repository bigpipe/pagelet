'use strict';

var Formidable = require('formidable').IncomingForm
  , jstringify = require('json-stringify-safe')
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
function generator() {
  return Math.random().toString(36).substring(2).toUpperCase();
}

/**
 * A pagelet is the representation of an item, section, column or widget.
 * It's basically a small sandboxed application within your application.
 *
 * @constructor
 * @api public
 */
function Pagelet(options) {
  if (!this) return new Pagelet(options);

  this.fuse();
  options = options || {};

  //
  // Use the temper instance on Pipe if available.
  //
  if (options.pipe && options.pipe._temper) options.temper = options.pipe._temper;

  this._enabled = [];                             // Contains all enabled pagelets.
  this._disabled = [];                            // Contains all disable pagelets.
  this._active = null;                            // Are we active.
  this._req = options.req;                        // Incoming HTTP request.
  this._res = options.res;                        // Incoming HTTP response.
  this._pipe = options.pipe;                      // Actual pipe instance.
  this._params = options.params;                  // Params extracted from the route.
  this._temper = options.temper;                  // Attach the Temper instance.
  this._append = options.append || false;         // Append content client-side.

  this.bootstrap = options.bootstrap;             // Reference to bootstrap Pagelet.
  this.debug = debug('pagelet:'+ this.name);      // Namespaced debug method

  //
  // Allow overriding the reference to parent pagelet.
  // A reference to the parent is normally set on the
  // constructor prototype by optimize.
  //
  if (options.parent) this._parent = options.parent;
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
 * Specify a mode that should be used for node client side rendering, this defaults
 * to HTML. For instance to allow a pagelet to generate SVG elements use mode svg.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('namespace', 'html');

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
 * Optional template engine preference. Useful when we detect the wrong template
 * engine based on the view's file name.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('engine', '');

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
 * The actual chunk of the response that is written for each pagelet. The
 * current template is compatible with our `bigpipe.js` client code but if you
 * want to use the pagelets as a stand alone template/view you might want to
 * change this to a simple string.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('fragment', require('fs').readFileSync(__dirname +'/pagelet.fragment', 'utf-8')
  .split('\n')
  .join('')
);

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
Pagelet.writable('view', '');

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
 * Default content type of the Pagelet.
 *
 * @type {Object}
 * @private
 */
Pagelet.writable('_contentType', 'text/html');

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
 * @return {Number} Length of queue
 * @api private
 */
Pagelet.set('length', function length() {
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

  this._pipe.router(req, res);
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

      child = new Child({ pipe: pagelet._pipe });
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
        pagelet[pagelet.mode]();
      }
    });
  } else {
    this[this.mode]();
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

/**
 * A safe and fast(er) alternative to the `json-stringify-save` as uses the
 * replacer to make the transformation save. This is really costly for larger
 * JSON structures. We assume that all the JSON contains no cyclic references.
 *
 * @param {Mixed} data Data that needs to be transformed in to a string.
 * @param {Function} replacer Optional data replacer.
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
  if (!this.length) return this.emit('discover');

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
            pipe: pagelet._pipe,
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
    pagelet._enabled = children.enabled.concat(pagelet);

    pagelet._enabled.forEach(function initialize(child) {
      if ('function' === typeof child.initialize) child.initialize();
    });

    pagelet.debug('Initialized all allowed pagelets');
    pagelet.emit('discover');
  });

  return this;
});

/**
 * Mode: Synchronous
 * Output the pagelets fully rendered in the HTML template.
 *
 * @TODO remove pagelet's that have `authorized` set to `false`
 * @TODO Also write the CSS and JavaScript.
 *
 * @api private
 */
Pagelet.readable('sync', function synchronous() {
  var pagelet = this;

  //
  // Because we're synchronously rendering the pagelets we need to discover
  // which one's are enabled before we send the bootstrap code so it can include
  // the CSS files of the enabled pagelets in the HEAD of the page so there is
  // styling available.
  //
  pagelet.once('discover', function discovered() {
    pagelet.debug('Processing the pagelets in `sync` mode');

    async.each(pagelet._enabled.concat(pagelet._disabled), function render(child, next) {
      pagelet.debug('Invoking pagelet %s/%s render', child.name, child.id);

      child.render({ mode: 'sync' }, function rendered(error, content) {
        if (error) return render(child.capture(error), next);

        child.write(content);
        next();
      });
    }, function done() {
      pagelet.bootstrap.render().reduce().end();
    });
  }).discover();
});

/**
 * Mode: Asynchronous
 * Output the pagelets as fast as possible.
 *
 * @api private
 */
Pagelet.readable('async', function asynchronous() {
  var pagelet = this;

  //
  // Flush the initial headers asap so the browser can start detect encoding
  // start downloading assets and prepare for rendering additional pagelets.
  //
  pagelet.bootstrap.render().flush(function headers(error) {
    if (error) return pagelet.capture(error, true);

    pagelet.once('discover', function discovered() {
      pagelet.debug('Processing the pagelets in `async` mode');

      async.each(pagelet._enabled.concat(pagelet._disabled), function render(child, next) {
        pagelet.debug('Invoking pagelet %s/%s render', child.name, child.id);

        child.render({
          data: pagelet._pipe._compiler.pagelet(child)
        }, function rendered(error, content) {
          if (error) return render(child.capture(error), next);
          child.write(content).flush(next);
        });
      }, pagelet.end.bind(pagelet));
    }).discover();
  });
});

/**
 * Mode: pipeline
 * Output the pagelets as fast as possible but in order.
 *
 * @returns {Pagelet} fluent interface.
 * @api private
 */
Pagelet.readable('pipeline', function render() {
  throw new Error('Not Implemented');
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

  //
  // The chunk could potentially be an error, capture it before
  // its pushed to the queue.
  //
  if (chunk instanceof Error) return this.capture(chunk);

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
 * We've received an error. Close down pagelet and display a 500
 * error Pagelet instead.
 *
 * @TODO handle the case when we've already flushed the initial bootstrap code
 * to the client and we're presented with an error.
 *
 * @param {Error} error Optional error argument to trigger the error pagelet.
 * @param {Boolean} bootstrap Trigger full bootstrap if true.
 * @returns {Pagelet} Reference to Pagelet.
 * @api private
 */
Pagelet.readable('capture', function capture(error, bootstrap) {
  this.debug('Captured an error: %s, displaying error pagelet instead', error);
  return this._pipe.status(this, 500, error, bootstrap);
});

/**
 * The Content-Type of the response. This defaults to text/html with a charset
 * preset inherited from the charset property.
 *
 * @type {String}
 * @public
 */
Pagelet.set('contentType', function get() {
  return this._contentType +';charset='+ this.charset;
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
  return this._bootstrap = value;
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
  || this._active && this._active !== null;         // Conditional check has been done.
}, function set(value) {
  return this._active = !!value;
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

  var context = options.context || this
    , compiler = this._pipe._compiler
    , mode = options.mode || 'async'
    , data = options.data || {}
    , temper = this._temper
    , query = this.query
    , pagelet = this;

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

    data.error = compiler.resolve(pagelet.error);    // Path of error view.
    data.client = compiler.resolve(pagelet.view);    // Path of client view.

    data = pagelet.stringify(data, function sanitize(key, data) {
      if ('string' !== typeof data) return data;

      return data
        .replace(/&/gm, '&amp;')
        .replace(/</gm, '&lt;')
        .replace(/>/gm, '&gt;')
        .replace(/"/gm, '&quot;')
        .replace(/'/gm, '&#x27;');
    });

    fn.call(context, undefined, pagelet.fragment
      .replace(/\{pagelet:id\}/g, pagelet.id)
      .replace(/\{pagelet:name\}/g, pagelet.name)
      .replace(/\{pagelet:template\}/g, content.replace(/<!--(.|\s)*?-->/, ''))
      .replace(/\{pagelet:data\}/g, data)
    );

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

        content = view(result);
      } catch (e) {
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
          env: process.env.NODE_ENV || 'development',
          message: e.message,
          stack: e.stack,
          error: e
        }));
      }

      //
      // Add queried parts of data, so the client-side script can use it.
      //
      if ('object' === typeof result && Array.isArray(query) && query.length) {
        data.data = query.reduce(function find(memo, q) {
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
 * @param {Function} list Array of possible alternate pagelets that take it's place.
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
   *
   * @param {Boolean} value Are we enabled or disabled.
   * @api private
   */
  function enabled(value) {
    fn.call(pagelet, pagelet.active = value);
  }

  if ('boolean' === typeof this._active) {
    fn(pagelet.active);
  } else if ('function' !== typeof this.if) {
    fn(pagelet.active = true);
  } else {
    if (pagelet.if.length === 2) pagelet.if(req, enabled);
    else pagelet.if(req, list || [], enabled);
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
  '_temper', '_pipe', '_enabled', '_disabled', '_pagelets'
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
  if (!pagelets || !Object.keys(pagelets).length) return stack;

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
    , pipe = options.pipe || {}
    , transform = options.transform || {}
    , temper = options.temper || pipe._temper
    , before, after;

  //
  // Check if before listener is found. Add before emit to the stack.
  // This async function will be called before optimize.
  //
  if (pipe._events && 'transform:pagelet:before' in pipe._events) {
    before = pipe._events['transform:pagelet:before'].length || 1;

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
  if (pipe._events && 'transform:pagelet:after' in pipe._events) {
    after = pipe._events['transform:pagelet:after'].length || 1;

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
      , router = prototype.path
      , name = prototype.name
      , log = debug('pagelet:'+ name);

    //
    // Generate a unique ID used for real time connection lookups.
    //
    prototype.id = options.id || [1, 1, 1, 1].map(generator).join('-');

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
    // mandatory but it's quite silly to enforce this if the pagelet is
    // just doing a redirect. We can check for this edge case by
    // checking if the set statusCode is in the 300~ range.
    //
    if (prototype.view) {
      prototype.view = path.resolve(prototype.directory, prototype.view);
      temper.prefetch(prototype.view, prototype.engine);
    } else if (!(prototype.statusCode >= 300 && prototype.statusCode < 400)) {
      return next(new Error(
        'The '+ name +' pagelet for path '+ router +' should have a .view property.'
      ));
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
        pipe: pipe,
        transform: {
          before: pipe.emits && pipe.emits('transform:pagelet:before'),
          after: pipe.emits && pipe.emits('transform:pagelet:after')
        }
      }, step);
    }, function optimized(error, children) {
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
