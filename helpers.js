'use strict';

var path = require('path');

/**
 * Helper function to resolve assets on the pagelet.
 *
 * @param {Function} constructor The Pagelet constructor
 * @param {String|Array} keys Name(s) of the property, e.g. [css, js].
 * @param {String} dir Optional absolute directory to resolve from.
 * @returns {Pagelet}
 * @api private
 */
exports.resolve = function resolve(constructor, keys, dir) {
  var prototype = constructor.prototype;

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

  return constructor;
};
