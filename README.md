# Pagelet [![Build Status][status]](https://travis-ci.org/bigpipe/pagelet) [![NPM version][npmimgurl]](http://badge.fury.io/js/pagelet) [![Coverage Status][coverage]](http://coveralls.io/r/bigpipe/pagelet?branch=master)

[status]: https://travis-ci.org/bigpipe/pagelet.png
[npmimgurl]: https://badge.fury.io/js/pagelet.png
[coverage]: http://coveralls.io/repos/bigpipe/pagelet/badge.png?branch=master

## Installation

In all of the following code examples we assume that the `Pagelet` variable is
either exposed as:

```js
var Pagelet = require('pagelet');
```

Or using the BigPipe framework:

```js
var Pagelet = require('bigpipe').Pagelet;
```

## Table of Contents

**Pagelet function**
- [Pagelet.extend](#pageletextend)
- [Pagelet.on](#pageleton)
- [Pagelet.traverse](#pagelettraverse)

**Pagelet instance**
- [Pagelet.name](#pageletname)
- [Pagelet.streaming](#pageletstreaming)
- [Pagelet.RPC](#pageletrpc)
- [Pagelet.mode](#pageletmode)
- [Pagelet.fragment](#pageletfragment)
- [Pagelet.remove](#pageletremove)
- [Pagelet.view](#pageletview)
- [Pagelet.error](#pageleterror)
- [Pagelet.engine](#pageletengine)
- [Pagelet.query](#pageletquery)
- [Pagelet.css](#pageletcss)
- [Pagelet.js](#pageletjs)
- [Pagelet.dependencies](#pageletdependencies)
- [Pagelet.get()](#pageletget)
- [Pagelet.authorize()](#pageletauthorize)
- [Pagelet.initialize()](#pageletinitialize)
- [Pagelet.pagelets](#pageletpagelets)
- [Pagelet.id](#pageletid)
- [Pagelet.substream](#pageletsubstream)
- [Pagelet._parent](#pageletparent)

### Pagelet.extend

The `.extend` method is used for creating a new Pagelet constructor. It
subclasses the `Pagelet` constructor just like you're used to when using
[Backbone]. It accepts an object which will be automatically applied as part of
the prototype:

```js
Pagelet.extend({
  js: 'client.js',
  css: 'sidebar.styl',
  view: 'templ.jade',

  get: function get() {
    // do stuff when GET is called via render
  }
});
```

### Pagelet.on

In [BigPipe] we need to know where the Pagelet is required from so we figure out
how to correctly resolve the relative paths of the `css`, `js` and `view`
properties.

So a full constructed Pagelet instance looks like:

```js
Pagelet.extend({
  my: 'prop',
  and: function () {}
}).on(module);
```

This has the added benefit of no longer needing to do `module.exports = ..` in
your code as the `Pagelet.on` method automatically does this for you.

### Pagelet.traverse

Recusively find and construct all pagelets. Uses the
[pagelets property](#pageletpagelets) to find additional child pagelets. Usually
there is no need to call this manually. [BigPipe] will make sure all pagelets
are recursively discovered. Traverse should be called with the name of the
parent pagelet, so each child has a proper reference.

```
Pagelet.extend({
  pagelets: {
    one: require('pagelet'),
    two: require('pagelet')
  }
}).traverse('parent name');
```

### Pagelet.name

_required:_ **writable, string**

Every pagelet should have a name, it's one of the ways that [BigPipe] uses to
identify which pagelet and where it should be loaded on the page. The name
should be an unique but human readable string as this will be used as value for
the `data-pagelet=""` attributes on your [Page], but this name is also when you
want to check if a `Pagelet` is available.

```js
Pagelet.extend({
  name: 'sidebar'
}).on(module);
```

If no `name` property has been set on the Pagelet it will take the `key` that
was used when you specified the pagelets for the [Page]:

```js
var Page = require('bigpipe').Page;

Page.extend({
  pagelets: {
    sidebar: '../yourpagelet.js',
    another: require('../yourpagelet.js')
  }
}).on(module);
```

### Pagelet.streaming

_optional:_ **writable, boolean**

When enabled we will stream the submit of each form that is within a Pagelet to
the server instead of using the default full page refreshes. After sending the
data the resulting HTML will be used to only update the contents of the pagelet.

If you want to opt-out of this with one form you can add a
`data-pagelet-async="false"` attribute to the form element.

```js
Pagelet.extend({
  streaming: true
});
```

### Pagelet.RPC

_optional:_ **writable, array**

The `RPC` array specifies the methods that can be remotely called from the
client/browser. Please note that they are not actually send to the client as
these functions will execute on the server and transfer the result back to the
client.

The first argument that these functions receive is an error first style callback
which is used to transfer the response back to the client. All other arguments
will be the arguments that were used to call the method on the client.

 ```js
Pagelet.extend({
  RPC: [ 'methodname' ],

  methodname: function methodname(reply, arg1, arg2) {

  }
}).on(module);
```

### Pagelet.mode

_optional:_ **writable, string**

Set the render mode the pagelet fragment. This will determine which client side
method will be called to create elements. For instance, this mode can be changed
to `svg` to generate SVG elements with the SVG namespaceURI.

**Default value**: `html`

```js
Pagelet.extend({
  mode: 'svg',
}).on(module);
```

### Pagelet.fragment

_optional:_ **writable, string**

A default fragment is provided via `Pagelet.fragment`, however it is
possible to overwrite this default fragment with a custom fragment. This fragment
is used by render to generate content with appropriate data to work with [BigPipe].
Change `Pagelet.fragment` if you'd like to invoke render and generate custom output.

**Default value**: see [pagelet.fragment][frag]

```js
Pagelet.extend({
  fragment: '<div>pagelet::template</div>',
}).on(module);
```

### Pagelet.remove

_optional:_ **writable, boolean**

This instructs our render engine to remove the pagelet placeholders from the DOM
structure if we're unauthorized. This makes it easier to create conditional
layouts without having to worry about DOM elements that are left behind.

**Default value**: `true`

```js
Pagelet.extend({
  authorize: auth,
  remove: false
}).on(module);
```

### Pagelet.view

_required:_ **writable, string**

The view is a reference to the template that we render inside the
`data-pagelet="<name>"` placeholders. Please make sure that your template can be
rendered on both the client and server side. Take a look at our [temper] project
for template engines that we support.

### Pagelet.error

_optional:_ **writable, string**

Just like the `Pagelet.view` this is a reference to a template that we will
render in your `data-pagelet="<name>"` placeholders but this template is only
rendered when:

1. We receive an `Error` argument in our callback that we supply to the
   `Pagelet#get` method.
2. Your `Pagelet.view` throws an error when we're rendering the template.

If this property is not set we will default to a template that ships with this
Pagelet by default. This template includes a small HTML fragment that states the
error.

### Pagelet.engine

_optional:_ **writable, string**

We attempt to detect the correct template engine based on filename as well as
the template engine's that we can require. It is possible that we make the wrong
assumption and you wanted to use `handlebars` for your `.mustache` based
templates but it choose to use `hogan.js` instead.

```js
Pagelet.extend({
  view: 'sidebar.mustache',
  engine: 'handlebars'
}).on(module);
```

**Please note that the engine needs to be compatible with the [temper] module
that we use to compile the templates**

### Pagelet.query

_optional:_ **writable, array**

For optimal performance the data that is send to the client will be minimal
and dependant on they query that is provided. Data can be supplied to the client
by listing the keys (nested paths in dot notation) of which the data should be
send to the client. In the example only the content of `mydata` and `nested.is`
will be send.

```js
Pagelet.extend({
  query: [ 'mydata', 'nested.is' ],
  get: function get(done) {
    done(null, {
      mydata: 'test',
      nested: { is: 'allowed', left: 'alone' },
      more: 'data'
    });
  }
}).on(module);
```

### Pagelet.css

_optional:_ **writable, string**

The location of the styling for **only this** pagelet. You should assume that
you bundle all the CSS that is required to fully render this pagelet. By
eliminating inherited CSS it will be easier for you to re-use this pagelet on
other pages as well as in other projects.

```js
Pagelet.extend({
  css: './my-little-pony.styl'
}).on(module);
```

**Please note that this doesn't have to be a `.css` file as we will
transparently pre-process these files for you. See the [smithy] project for the
compatible pre-processors.**

### Pagelet.js

_optional:_ **writable, string**

As you might have guessed, this is the location of the JavaScript that you want
to have loaded for your pagelet. We use [fortress] to sandbox this JavaScript in
a dedicated `iframe` so the code you write is not affected and will not affect
other pagelets on the same page. This also makes it relatively save to extend
the build-in primitives of JavaScript (adding new properties to Array etc).

Unlike the `view` and `css` we do not pre-process the JavaScript. But this does
not mean you cannot use CoffeeScript or other pre-processed languages inside a
Pagelet. It just means that you have to compile your files to a proper
JavaScript file and point to that location instead.

```js
Pagelet.extend({
  js: './library.js'
}).on(module);
```

**Please note that the sandboxing is not there as a security feature, it was
only designed to prevent code from different pagelets clashing with each other**

### Pagelet.dependencies

_optional:_ **writable, array**

An array of dependencies that your pagelet depends on which should be loaded in
advance and available on the page before any CSS or JavaScript is executed. The
files listed in this array can either a be CSS or JavaScript resource.

```js
pagelet.extend({
  dependencies: [
    'https://google.com/ga.js'
  ]
}).on(module);
```

### Pagelet.get()

_required:_ **writable, function**

Get provides the data that is used for rendering the output of the Pagelet.

The `get` method receives one argument:

- done: A completion callback which accepts two arguments. This callback should be
called when your custom implementation has finished gathering data from all sources.
Calling `done(error, data)` will allow the `render` method to complete its work.
The data provided to the callback will be used to render the actual Pagelet.

```js
Pagelet.extend({
  get: function get(done) {
    var data = { provide: 'data-async' };
    done(error, data);
  },
}).on(module);
```

### Pagelet.authorize()

_optional:_ **writable, function**

There is the possibility to create private pagelets. These pagelets could require
special permissions in your application in order to be used. An example of this
would a special administrator UI element. When a pagelet is unauthorized it can
be removed from DOM structure of the page. See [Pagelet: remove] for changing
this behaviour.

The authorize method receives 2 arguments:

- req: The incoming HTTP requirement.
- done: A completion callback which only accepts one argument, a boolean. If
  this boolean has been set to `true` the pagelet is authorized on the page and
  will be rendered as expected. When the argument evaluates as `false` (so also
  null, undefined, 0 etc) we assume that it's disallowed and should not be
  rendered.

```js
Pagelet.extend({
  authorize: function authorize(req, done) {
    done(true); // True indicates that the request is authorized for access.
  }
}).on(module);
```

### Pagelet.initialize()

_optional:_ **writable, function**

The pagelet has been initialised. If you have an authorization function this
function will only be called **after** a successful authorization. If no
authorization hook is provided it should be called instantly.

```js
Pagelet.extend({
  initialize: function () {
    this.once('event', function () {
      doStuff();
    });
  }
});
```

### Pagelet.pagelets

_optional:_ **writable, string|array|object**

Each pagelet can contain `n` child pagelets. Similar to using pagelets through
[BigPipe], the pagelets property can be a string (filepath to file or directory),
array or object containing multiple pagelets. All subsequent child pagelets will
be converged on one stack to allow full parallel initialization. The client will
handle deferred rendering of child pagelets, also see [_parent](#pageletparent).

```
Pagelet.extend({
  pagelets: {
    one: require('pagelet'),
    two: require('pagelet')
  }
});
```

### Pagelet.id

**read only**

The unique id of a given pagelet instance. Please note that this is not a
persistent id and will differ between every single initialised instance.

### Pagelet.substream

**read only**

The pagelet can also be initialised through [Primus] so it can be used for
real-time communication (and make things like [RPC](#pagelet-rpc) work). The
communication is done over a [substream] which allows Primus multiplex the
connection between various of endpoints.

### Pagelet._parent

**read only**

If the current pagelet is intialized from another pagelet, it will have a `_parent`
reference. The pagelets' parent name will be stored so that client-side
initialization is deferred till the parent is rendered.

## License

MIT

[Backbone]: http://backbonejs.com
[BigPipe]: http://bigpipe.io
[Page]: http://bigpipe.io#page
[temper]: http://github.com/bigpipe/temper
[smithy]: http://github.com/observing/smithy
[fortress]: http://github.com/bigpipe/fortress
[frag]: https://github.com/bigpipe/pagelet/blob/master/pagelet.fragment
[Primus]: https://github.com/primus/primus
[substream]: https://github.com/primus/substream
