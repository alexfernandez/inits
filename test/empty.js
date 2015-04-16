'use strict';

/**
 * An empty library using init system for Node.js.
 * (C) 2015 Alex Fernández.
 */


// requires
require('prototypes');
var Log = require('log');
var inits = require('../lib/initSystem.js');

// globals
var log = new Log('debug');


inits.finish(finish);

function finish(callback)
{
	log.notice('I have finished');
	callback(null);
}

