# Pagelet

In all of the following code examples we assume that the `Pagelet` variable is
either exposed as:

```js
var Pagelet = require('pagelet');
```

Or using the BigPipe framework:

```js
var Pagelet = require('bigpipe').Pagelet.
```

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

  render: function render() {
    // do stuff
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

### Pagelet: name

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

### Pagelet: RPC

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

[Backbone]: http://backbonejs.com
[BigPipe]: http://bigpipe.io
[Page]: http://bigpipe.io#page
