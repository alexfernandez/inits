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
var EVENTS = ['init', 'start', 'stop', 'finish'];


var InitSystem = function()
{
	var self = this;

	// attributes
	var callbackQueues = {};
	var flags = {};
	var standaloneCallback = null;
	var startingUp = false;
	var shuttingDown = false;
	var phase = 'pre';

	// init
	startup();


	function startup()
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
				reallyStartup();
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
		log.error('Error in phase %s: %s', phase, error);
	}

	function reallyStartup()
	{
		if (startingUp)
		{
			self.emit('error', 'Could not start up again');
			return;
		}
		startingUp = true;
		runAll('init', function(error)
		{
			if (error)
			{
				return self.emit('error', 'Could not run init callbacks: ' + error);
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
		phase = event;
		self.emit(event + 'ing');
		runQueue(callbackQueues[event], function(error)
		{
			if (error)
			{
				return callback(error);
			}
			flags[event] = true;
			self.emit(event + 'ed');
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
			self.shutdown();
		});
	}

	self.shutdown = function()
	{
		if (shuttingDown)
		{
			return self.emit('error', 'Could not shutdown again');
		}
		shuttingDown = true;
		runAll('stop', function(error)
		{
			if (error)
			{
				return self.emit('error', 'Could not run stop callbacks: ' + error);
			}
			runAll('finish', function(error)
			{
				if (error)
				{
					return self.emit('error', 'Could not run finish callbacks: ' + error);
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
	system.init(function(next)
	{
		witness.init = true;
		log.debug('init');
		next(null);
	});
	system.start(function(next)
	{
		testing.assert(witness.init, 'Should call init', callback);
		witness.start = true;
		log.debug('start');
		next(null);
	});
	system.on('ready', function()
	{
		testing.assert(witness.start, 'Should call start', callback);
		system.shutdown();
	});
	system.stop(function(next)
	{
		testing.assert(witness.start, 'Should call start', callback);
		witness.stop = true;
		log.debug('stop');
		next(null);
	});
	system.finish(function(next)
	{
		testing.assert(witness.stop, 'Should call stop', callback);
		witness.finish = true;
		log.debug('finish');
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(witness.finish, 'Should call finish', callback);
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
	system.init(function(next)
	{
		witness.init = true;
		log.debug('init');
		next(null);
	});
	system.standalone(function(next)
	{
		testing.assert(witness.init, 'Should call init', callback);
		witness.standalone = true;
		log.debug('standalone');
		next(null);
	});
	system.finish(function(next)
	{
		testing.assert(witness.standalone, 'Should call standalone', callback);
		witness.finish = true;
		log.debug('finish');
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(witness.finish, 'Should call finish', callback);
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

