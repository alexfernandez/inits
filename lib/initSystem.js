'use strict';

/**
 * Init system for Node.js, main file.
 * (C) 2015 Alex Fernández.
 */


// requires
require('prototypes');
var Log = require('log');
var util = require('util');
var events = require('events');
var testing = require('testing');

// globals
var log = new Log('info');

// constants
var EVENTS = ['first', 'start', 'stop', 'last'];


var InitSystem = function()
{
	var self = this;

	// attributes
	var standaloneCallback = null;
	var flags = {};
	var callbackQueues = {};
	var initing = false;
	var finishing = false;

	// init
	init();


	function init()
	{
		EVENTS.forEach(function(event)
		{
			callbackQueues[event] = [];
			self[event] = getAdder(event);
		});
		events.EventEmitter.call(self);
		self.on('error', showError);
		setImmediate(function()
		{
			setTimeout(function()
			{
				reallyInit();
			}, 0);
		});
	}

	function getAdder(event)
	{
		return function(callback)
		{
			if (flags[event])
			{
				return self.emit('error', 'Could not add ' + event + ' to queue after it has run');
			}
			callbackQueues[event].push(callback);
		};
	}

	function showError(error)
	{
		log.error('Initialization error: %s', error);
	}

	function reallyInit()
	{
		if (initing)
		{
			self.emit('error', 'Could not init again');
			return;
		}
		initing = true;
		runAll('first', function(error)
		{
			if (error)
			{
				return self.emit('error', 'Could not run first callbacks: ' + error);
			}
			runAll('start', function(error)
			{
				if (error)
				{
					return self.emit('error', 'Could not run start callbacks: ' + error);
				}
				self.emit('ready');
				if (standaloneCallback)
				{
					runStandalone();
				}
			});
		});
	}

	function runAll(event, callback)
	{
		if (flags[event])
		{
			return callback('Callbacks for ' + event + ' already run');
		}
		runQueue(callbackQueues[event], function(error)
		{
			if (error)
			{
				return callback(error);
			}
			flags[event] = true;
			return callback(null);
		});
	}

	function runQueue(queue, callback)
	{
		if (!queue.length)
		{
			return callback(null);
		}
		var next = queue.shift();
		next(callback);
	}

	function runStandalone()
	{
		standaloneCallback(function(error)
		{
			if (error)
			{
				if (error)
				{
					return self.emit('error', 'Could not run start callbacks: ' + error);
				}
			}
		});
	}

	self.finish = function()
	{
		if (finishing)
		{
			return self.emit('error', 'Could not finish again');
		}
		finishing = true;
		runAll('stop', function(error)
		{
			if (error)
			{
				return self.emit('error', 'Could not run stop callbacks: ' + error);
			}
			runAll('last', function(error)
			{
				if (error)
				{
					return self.emit('error', 'Could not run last callbacks: ' + error);
				}
				self.emit('end');
			});
		});
	};
};

util.inherits(InitSystem, events.EventEmitter);
module.exports = InitSystem;

function testInitSystem(callback)
{
	var system = new InitSystem();
	system.on('error', function(error)
	{
		console.trace('here');
		testing.failure(error, callback);
	});
	system.first(function(next)
	{
		log.debug('first');
		next(null);
	});
	system.start(function(next)
	{
		log.debug('start');
		system.finish();
		next(null);
	});
	system.stop(function(next)
	{
		log.debug('stop');
		next(null);
	});
	system.last(function(next)
	{
		log.debug('last');
		next(null);
	});
	system.on('started', function()
	{
		system.finish();
	});
	system.on('end', function()
	{
		testing.success(callback);
	});
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
	log = new Log('debug');
	exports.test(testing.show);
}

