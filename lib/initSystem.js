'use strict';

/**
 * Init system for Node.js, main file.
 * (C) 2015 Alex Fernández.
 */


// requires
require('prototypes');
var util = require('util');
var events = require('events');
var testing = require('testing');

// globals
var EVENTS = ['first', 'start', 'stop', 'last'];


var InitSystem = function()
{
	var self = this;

	// attributes
	var inited = false;
	var started = false;
	var standaloneCallback = null;

	// init
	init();


	function init()
	{
		events.EventEmitter.call(self);
		setImmediate(function()
		{
			setTimeout(function()
			{
				reallyInit();
			}, 0);
		});
	}

	function reallyInit()
	{
		if (inited)
		{
			self.emit('warning', 'Could not init again');
			return;
		}
		inited = true;
	}
};

util.inherits(InitSystem, events.EventEmitter);
module.exports = InitSystem;

function testInitSystem(callback)
{
	testing.success(callback);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([testInitSystem], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

