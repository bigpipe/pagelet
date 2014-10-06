'use strict';

var jstringify = require('json-stringify-safe')
  , fabricate = require('fabricator')
  , debug = require('diagnostics')
  , dot = require('dot-component')
  , Stream = require('stream')
  , fuse = require('fusing')
  , async = require('async')
  , path = require('path');

//
// Cache long prototype lookups to increase speed + write shorter code.
//
var slice = Array.prototype.slice;

//
// Methods that needs data buffering.
//
var operations = 'POST, PUT, DELETE, PATCH'.toLowerCase().split(', ');

/**
 * A pagelet is the representation of an item, section, column or widget.
 * It's basically a small sandboxed application within your application.
 *
 * @constructor
 * @api public
 */
function Pagelet(options) {
  if (!(this instanceof Pagelet)) return new Pagelet(options);

  this.fuse();
  options = options || {};
  options.temper = options.temper || options.pipe.temper;

  var writable = this.writable
    , readable = this.readable;

  readable('pipe', options.pipe);               // Actual pipe instance.

  writable('params', {});                       // Params extracted from the route.
  writable('enabled', []);                      // Contains all enabled pagelets.
  writable('disabled', []);                     // Contains all disable pagelets.
  writable('_active', null);                    // Are we active.
  writable('substream', null);                  // Substream from Primus.
  writable('req', options.req);                 // Incoming HTTP request.
  writable('res', options.res);                 // Incoming HTTP response.
  writable('temper', options.temper);           // Attach the Temper instance.

  //
  // Add an correctly namespaced debug method so it easier to see which pagelet
  // is called by just checking the name of it.
  //
  readable('debug', debug('pagelet:'+ this.name));
}

fuse(Pagelet, Stream, { emits: false });

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
 * The Content-Type of the response. This defaults to text/html with a charset
 * preset. The charset does not inherit it's value from the `charset` option.
 *
 * @type {String}
 * @public
 */
Pagelet.writable('contentType', 'text/html; charset=UTF-8');

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
 * When enabled we will stream the submit of each form that is within a Pagelet
 * to the server instead of using the default full page refreshes. After sending
 * the data the resulting HTML will be used to only update the contents of the
 * pagelet.
 *
 * If you want to opt-out of this with one form you can add
 * a `data-pagelet-async="false"` attribute to the form element.
 *
 * @type {Boolean}
 * @public
 */
Pagelet.writable('streaming', false);

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
 * Reset the instance to it's original state and initialize it.
 *
 * @param {ServerRequest} req HTTP server request.
 * @param {ServerResponse} res HTTP server response.
 * @api private
 */
Pagelet.readable('configure', function configure(req, res) {
  this.req = req;
  this.res = res;

  //
  // Set a number of properties on the response as it is available to all pagelets.
  // This will ensure the correct amount of pagelets are processed and that the
  // entire queue is written to the client.
  //
  res.n = 0;
  res.queue = [];
  res.ended = false;
  res.flushed = false;

  // @TODO rel prefetch for resources that are used on the next page?
  // @TODO cache manifest.

  this.res.statusCode = this.statusCode;
  this.res.setHeader('Content-Type', this.contentType);

  //
  // Emit a pagelet configuration event so plugins can hook in to this.
  //
  this.pipe.emit('pagelet:configure', this);
  res.once('close', this.emits('close'));

  //
  // If we have a `no_pagelet_js` flag, we should force a different
  // rendering mode. This parameter is automatically added when we've
  // detected that someone is browsing the site without JavaScript enabled.
  //
  // In addition to that, the other render modes only work if your browser
  // supports trailing headers which where introduced in HTTP 1.1 so we need
  // to make sure that this is something that the browser understands.
  // Instead of checking just for `1.1` we want to make sure that it just
  // tests for every http version above 1.0 as http 2.0 is just around the
  // corner.
  //
  if (
       'no_pagelet_js' in req.query && +req.query.no_pagelet_js === 1
    || !(req.httpVersionMajor >= 1 && req.httpVersionMinor >= 1)
  ) {
    this.debug('forcing `sync` instead of %s due lack of HTTP 1.1 or JS', this.mode);
    this.mode = 'sync';
  }

  if (this.initialize) {
    if (this.initialize.length) {
      this.debug('Waiting for `initialize` method before rendering');
      this.initialize(this.init.bind(this));
    } else {
      this.initialize();
      this.init();
    }
  } else {
    this.init();
  }

  return this;
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

  if (enabled) return this.enabled.filter(function filter(pagelet) {
    return pagelet.name === name;
  });

  var pagelets = this.pagelets
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
  var method = this.req.method.toLowerCase()
    , pagelet = this;

  //
  // Only start reading the incoming POST request when we accept the incoming
  // method for read operations. Render in a regular mode if we do not accept
  // these requests.
  //
  if (~operations.indexOf(method)) {
    var pagelets = this.child(this.req.query._pagelet)
      , reader = this.pipe.read(pagelet);

    this.debug('Processing %s request', method);

    async.whilst(function work() {
      return !!pagelets.length;
    }, function process(next) {
      var Child = pagelets.shift()
        , child;

      if (!(method in Pagelet.prototype)) return next();

      child = new Child({ temper: pagelet.temper });
      child.conditional(pagelet.req, pagelets, function allowed(accepted) {
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
  if (!this.pagelets.length) return this.emit('discover');

  var req = this.req
    , res = this.res
    , pagelet = this;

  //
  // We need to do an async map/filter of the pagelets, in order to this as
  // efficient as possible we're going to use a reduce.
  //
  async.reduce(this.pagelets, {
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
            pipe: pagelet.pipe,
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
    pagelet.disabled = children.disabled;
    pagelet.enabled = children.enabled;

    pagelet.enabled.forEach(function initialize(pagelet) {
      if ('function' === typeof pagelet.initialize) {
        pagelet.initialize();
      }
    });

    pagelet.debug('Initialized all allowed pagelets');
    pagelet.emit('discover');
  });
});

/**
 * Mode: sync
 * Output the pagelets fully rendered in the HTML template.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Pagelet} fluent interface.
 * @api private
 */
Pagelet.readable('sync', function render(err, data) {
  if (err) return this.end(err);

  var pagelet = this
    , pagelets, view;

  //
  // Because we're synchronously rendering the pagelets we need to discover
  // which one's are enabled before we send the bootstrap code so it can include
  // the CSS files of the enabled pagelets in the HEAD of the page so there is
  // styling available.
  //
  this.once('discover', function discovered() {
    view = pagelet.pipe.bootstrap(undefined, pagelet);
    pagelets = pagelet.enabled.concat(pagelet.disabled);

    async.map(pagelets, function each(pagelet, next) {
      pagelet.debug('Invoking pagelet %s/%s render', pagelet.name, pagelet.id);

      pagelet.render({ data: data }, next);
    }, function done(err, data) {
      if (err) return pagelet.pipe.end(err, pagelet);

      pagelets.forEach(function forEach(pagelet, index) {
        view = pagelet.pip.inject(view, data[index].view, pagelet);
      });

      //
      // We need to bump the pagelet.res.n to the length of the enabled pagelets
      // to trick the end function in to believing that ALL pagelets have been
      // flushed and that it can clean write queue and close the connection as
      // no more data is expected to arrive.
      //
      pagelet.res.n = pagelet.enabled.length;
      pagelet.res.queue.push(view);
      pagelet.pipe.end(null, pagelet);
    });
  }).discover();

  return this.debug('Rendering the pagelets in `sync` mode');
});

/**
 * Mode: Async
 * Output the pagelets as fast as possible.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Pagelet} fluent interface.
 * @api private
 */
Pagelet.readable('async', function render(err, data) {
  if (err) return this.end(err);

  var pagelet = this;
  this.once('discover', function discovered() {
    async.each(pagelet.enabled.concat(pagelet.disabled), function (pagelet, next) {
      pagelet.debug('Invoking pagelet %s/%s render', pagelet.name, pagelet.id);

      data = pagelet.pipe.compiler.pagelet(pagelet, pagelet.streaming);
      data.processed = ++pagelet.res.n;

      pagelet.render({
        data: data
      }, function rendered(err, content) {
        if (err) return next(err);

        pagelet.pipe.write(pagelet, content, next);
      });
    }, pagelet.pipe.end.bind(pagelet.pipe, null, pagelet));
  });

  this.res.queue.push(this.pipe.bootstrap(undefined, this));
  this.pipe.flush(this, true);
  this.discover();

  return this.debug('Rendering the pagelets in `async` mode');
});

/**
 * Mode: pipeline
 * Output the pagelets as fast as possible but in order.
 *
 * @param {Error} err Failed to process POST.
 * @param {Object} data Optional data from POST.
 * @returns {Pagelet} fluent interface.
 * @api private
 */
Pagelet.readable('pipeline', function render(err, data) {
  throw new Error('Not Implemented');
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
    , data = options.data || {}
    , temper = this.temper
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

    if (options.substream || pagelet.mode === 'sync') {
      data.view = content;
      return fn.call(context, undefined, data);
    }

    data.id = data.id || pagelet.id;                      // Pagelet id.
    data.mode = data.mode || pagelet.mode;                // Pagelet render mode.
    data.rpc = data.rpc || pagelet.RPC;                   // RPC methods.
    data.remove = active ? false : pagelet.remove;        // Remove from DOM.
    data.streaming = !!pagelet.streaming;                 // Submit streaming.
    data.parent = pagelet._parent;                        // Send parent name along.
    data.hash = {
      error: temper.fetch(pagelet.error).hash.client,     // MD5 hash of error view.
      client: temper.fetch(pagelet.view).hash.client      // MD5 hash of client view.
    };

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
      .replace(/\{pagelet:name\}/g, pagelet.name)
      .replace(/\{pagelet:template\}/g, content.replace(/<!--(.|\s)*?-->/, ''))
      .replace(/\{pagelet:data\}/g, data)
    );

    return pagelet;
  }

  return this.conditional(this.req, options.pagelets, function auth(enabled) {
    if (!enabled) return fragment('');

    //
    // Invoke the provided get function and make sure options is an object, from
    // which `after` can be called in proper context.
    //
    pagelet.get(function receive(err, result) {
      var view = temper.fetch(pagelet.view).server
        , content;

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
          pagelet.debug('render %s/%s resulted in a error', pagelet.name, pagelet.id, err);
          throw err; // Throw so we can capture it again.
        }

        content = view(result || {});
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
      if ('object' === typeof result && Array.isArray(query)) {
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
   * Create a new Substream.
   *
   * @param {Boolean} enabled Allowed to use this pagelet.
   * @returns {Pagelet}
   * @api private
   */
  return this.conditional(spark.request, [], function substream(enabled) {
    if (!enabled) return next(new Error('Unauthorized to access this pagelet'));

    var stream = pagelet.substream = spark.substream(pagelet.name)
      , log = debug('pagelet:primus:'+ pagelet.name);

    log('created a new substream');

    stream.once('end', pagelet.emits('end', function (arg) {
      log('closing substream');

      return arg;
    }));

    stream.on('data', function streamed(data) {
      log('incoming packet %s', data.type);

      switch (data.type) {
        case 'rpc':
          pagelet.call(data);
        break;

        case 'emit':
          Stream.prototype.emit.apply(pagelet, [data.name].concat(data.args));
        break;

        case 'get':
          pagelet.render({ substream: true }, function renderd(err, fragment) {
            stream.write({ type: 'fragment', frag: fragment, err: err });
          });
        break;

        case 'post':
        case 'put':
          if (!(data.type in pagelet)) {
            return stream.write({ type: data.type, err: new Error('Method not supported by pagelet') });
          }

          pagelet[data.type](data.body || {}, data.files || [], function processed(err, context) {
            if (err) return stream.write({ type: 'err', err: err });

            pagelet.render({ data: context, substream: true }, function rendered(err, fragment) {
              if (err) return stream.write({ type: 'err', err: err });

              stream.write({ type: 'fragment', frag: fragment, err: err });
            });
          });
        break;

        default:
          log('unknown packet type %s, ignoring packet', data.type);
        break;
      }
    });

    next(undefined, pagelet);
    return pagelet;
  });
});

/**
 * Simple emit wrapper that returns a function that emits an event once it's
 * called
 *
 * ```js
 * example.on('close', example.emits('close'));
 * ```
 *
 * @param {String} event Name of the event that we should emit.
 * @param {Function} parser The last argument, if it's a function is a arg parser
 * @api public
 */
Pagelet.prototype.emits = function emits() {
  var args = slice.call(arguments, 0)
    , self = this
    , parser;

  //
  // Assume that if the last given argument is a function, it would be
  // a parser.
  //
  if ('function' === typeof args[args.length - 1]) {
    parser = args.pop();
  }

  return function emit(arg) {
    if (!self.listeners(args[0]).length) return false;

    if (parser) {
      arg = parser.apply(self, arguments);
      if (!Array.isArray(arg)) arg = [arg];
    } else {
      arg = slice.call(arguments, 0);
    }

    return Stream.prototype.emit.apply(self, args.concat(arg));
  };
};

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
 * Call an RPC method.
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
      args: slice.call(arguments, 0),
      type: 'rpc',
      id: data.id
    });
  }].concat(data.args));
});

/**
 * Destroy the pagelet and remove all the back references so it can be safely
 * garbage collected.
 *
 * @api public
 */
Pagelet.readable('destroy', function destroy() {
  if (this.substream) this.substream.end();

  this.temper = null;
  this.removeAllListeners();

  return this;
});

/**
 * Helper function to resolve assets on the pagelet.
 *
 * @param {String|Array} keys Name(s) of the property, e.g. [css, js].
 * @param {String} dir Optional absolute directory to resolve from.
 * @returns {Pagelet}
 * @api public
 */
Pagelet.resolve = function resolve(keys, dir) {
  var prototype = this.prototype;

  keys = Array.isArray(keys) ? keys : [keys];
  keys.forEach(function each(key) {
    if (!prototype[key]) return;

    var stack = Array.isArray(prototype[key])
      ? prototype[key]
      : [prototype[key]];

    prototype[key] = stack.filter(Boolean).map(function map(file) {
      if (/^(http:|https:)?\/\//.test(file)) return file;
      return path.resolve(dir || prototype.directory, file);
    });
  });

  return this;
};

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
    , dir = prototype.directory = prototype.directory || path.dirname(module.filename);

  prototype.error = prototype.error
    ? path.resolve(dir, prototype.error)
    : path.resolve(__dirname, 'error.html');

  //
  // Map all dependencies to an absolute path or URL.
  //
  Pagelet.resolve.call(this, ['css', 'js', 'dependencies']);

  //
  // Resolve the view to make sure an absolute path is provided to Temper.
  //
  if (prototype.view) prototype.view = path.resolve(dir, prototype.view);

  return module.exports = this;
};

/**
 * Discover all pagelets recursive. Fabricate will create constructable instances
 * from the provided value of prototype.pagelets.
 *
 * @param {Pagelet} parent Reference to the parent pagelet.
 * @return {Array} collection of pagelets instances.
 * @api public
 */
Pagelet.traverse = function traverse(parent) {
  var pagelets = this.prototype.pagelets
    , log = debug('pagelet:'+ parent)
    , found = [];

  if (!parent || !pagelets) return found;

  pagelets = fabricate(pagelets, {
    source: this.prototype.directory,
    recursive: 'string' === typeof pagelets
  }).map(function each(Pagelet) {
    log('Recursive discovery of child pagelet %s', Pagelet.prototype.name);

    //
    // We need to extend the pagelet if it already has a _parent name reference
    // or will accidentally override it. This you have Pagelet with child
    // pagelet. And you extend the parent pagelet so it receives a new name. But
    // the extended parent and regular parent still point to the same child
    // pagelet. So when we try to traverse these pagelets we will override
    // _parent property unless we create a new fresh instance and set it on that
    // instead.
    //
    if (Pagelet.prototype._parent && Pagelet.prototype.name !== parent) {
      Pagelet = Pagelet.extend();
    }

    Pagelet.prototype._parent = parent;
    found.push(Pagelet);
  });

  return found;
};

//
// Expose the pagelet.
//
module.exports = Pagelet;
