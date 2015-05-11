'use strict';

var EventEmitter = require('events').EventEmitter;

//
// Request stub
//
function Request(url, method) {
  this.headers = {};
  this.url = url || '';
  this.uri = require('url').parse(this.url, true);
  this.query = this.uri.query || {};
  this.method = method || 'GET';
}

require('util').inherits(Request, EventEmitter);

//
// Response stub
//
function Response() {
  this.setHeader = this.write = this.end = this.once = function noop() {};
}

//
// Expose the helpers.
//
exports.Request = Request;
exports.Response = Response;