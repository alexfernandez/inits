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

	self.standalone = function(callback)
	{
		if (standaloneCallback)
		{
			return self.emit('error', 'Already have standalone callback');
		}
		standaloneCallback = callback;
		self.on('ready', runStandalone);
	};

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
			self.finish();
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
	var witness = {};
	system.on('error', function(error)
	{
		testing.failure(error, callback);
	});
	system.first(function(next)
	{
		witness.first = true;
		log.debug('first');
		next(null);
	});
	system.start(function(next)
	{
		testing.assert(witness.first, 'Should call first', callback);
		witness.start = true;
		log.debug('start');
		next(null);
	});
	system.on('ready', function()
	{
		testing.assert(witness.start, 'Should call start', callback);
		system.finish();
	});
	system.stop(function(next)
	{
		testing.assert(witness.start, 'Should call start', callback);
		witness.stop = true;
		log.debug('stop');
		next(null);
	});
	system.last(function(next)
	{
		testing.assert(witness.stop, 'Should call stop', callback);
		witness.last = true;
		log.debug('last');
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(witness.last, 'Should call last', callback);
		testing.success(callback);
	});
}

function testStandalone(callback)
{
	var system = new InitSystem();
	var witness = {};
	system.on('error', function(error)
	{
		console.trace('here');
		testing.failure(error, callback);
	});
	system.first(function(next)
	{
		witness.first = true;
		log.debug('first');
		next(null);
	});
	system.standalone(function(next)
	{
		testing.assert(witness.first, 'Should call first', callback);
		witness.standalone = true;
		log.debug('standalone');
		next(null);
	});
	system.last(function(next)
	{
		testing.assert(witness.standalone, 'Should call standalone', callback);
		witness.last = true;
		log.debug('last');
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(witness.last, 'Should call last', callback);
		testing.success(callback);
	});
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testInitSystem,
		testStandalone,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	log = new Log('debug');
	exports.test(testing.show);
}

