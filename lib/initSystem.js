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
var domain = require('domain');

// globals
var log = new Log('info');
var globalDomain = domain.create();

// constants
var EVENTS = ['init', 'start', 'stop', 'finish'];
var DEFAULT_OPTIONS = {
	catchErrors: true,
	catchSignals: true,
	showErrors: true,
};


var InitSystem = function()
{
	var self = this;

	// attributes
	var callbackQueues = {};
	var flags = {};
	var standaloneCallback = null;
	var startingUp = false;
	var shuttingDown = false;
	var errored = false;
	var phase = 'pre';
	var options = DEFAULT_OPTIONS;
	self.options = {};

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
		self.emit('startup');
		options.overwriteWith(self.options);
		setupErrors();
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
		var current = queue.shift();
		run(current, function(error)
		{
			if (error)
			{
				return current(error);
			}
			return runQueue(queue, callback);
		});
	}

	function run(current, callback)
	{
		globalDomain.run(function()
		{
			current(callback);
		});
	}

	function setupErrors()
	{
		if (options.showErrors)
		{
			self.on('error', showError);
		}
		if (options.catchErrors)
		{
			globalDomain.on('error', function(error)
			{
				manageError('error', error);
			});
			process.on('uncaughtException', function(error)
			{
				manageError('uncaught exception', error);
			});
		}
		if (options.catchSignals)
		{
			process.on('SIGINT', function()
			{
				log.notice('User pressed control-C');
				self.shutdown();
			});
			process.on('SIGTERM', function()
			{
				log.notice('Process killed');
				self.shutdown();
			});
		}
	}

	function manageError(type, error)
	{
		log.alert('Unexpected %s%s', type, error);
		if (error.stack)
		{
			log.alert(error.stack);
		}
		if (!errored)
		{
			errored = true;
			self.shutdown();
		}
	}

	self.shutdown = function()
	{
		if (shuttingDown)
		{
			return self.emit('error', 'Could not shutdown again');
		}
		shuttingDown = true;
		self.emit('shutdown');
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
};

util.inherits(InitSystem, events.EventEmitter);
module.exports = InitSystem;
// exported for tests
module.exports.InitSystem = InitSystem;

