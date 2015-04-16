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
var globalDomain = domain.create();

// constants
var EVENTS = ['init', 'start', 'stop', 'finish'];
var DEFAULT_OPTIONS = {
	catchSignals: true,
	catchErrors: true,
	exitProcess: true,
	showErrors: true,
	showTraces: false,
	logTimes: true,
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
	var phase = 'pre';
	self.log = new Log('info');
	self.options = {};
	self.options.overwriteWith(DEFAULT_OPTIONS);

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
				return manageInternalError('Could not add ' + event + ' to queue after it has run: ' + new Error().stack);
			}
			callbackQueues[event].push(callback);
		};
	}

	function reallyStartup()
	{
		if (startingUp)
		{
			return manageInternalError('Could not start up again');
		}
		startingUp = true;
		var start = Date.now();
		self.emit('startup');
		setupErrors();
		runAll('init', function(error)
		{
			if (error)
			{
				return manageInternalError('Could not run init callbacks: ' + error);
			}
			runAll('start', function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run start callbacks: ' + error);
				}
				if (self.options.logTimes)
				{
					var elapsedSeconds = (Date.now() - start) / 1000;
					self.log.info('Initialization took %s seconds', elapsedSeconds.toFixed(1));
				}
				self.emit('ready');
			});
		});
	}

	function manageInternalError(error)
	{
		if (self.listeners('error').length > 0)
		{
			self.emit('error', error);
		}
		if (self.options.showErrors)
		{
			var message = error;
			if (self.options.showTraces)
			{
				message = new Error(error).stack;
			}
			self.log.error('Error in phase %s: %s', phase, message);
		}
		startShutdownByError();
	}

	function runAll(event, callback)
	{
		if (flags[event])
		{
			return callback('Callbacks for ' + event + ' already run');
		}
		self.log.debug('Running queue for %s: %s callbacks', event, callbackQueues[event]);
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
				return callback(error);
			}
			return runQueue(queue, callback);
		});
	}

	function run(current, callback)
	{
		self.log.debug('Running callback: %s', current);
		globalDomain.run(function()
		{
			current(callback);
		});
	}

	function setupErrors()
	{
		if (self.options.catchErrors)
		{
			globalDomain.on('error', function(error)
			{
				manageUnexpectedError('error', error);
			});
			process.on('uncaughtException', function(error)
			{
				manageUnexpectedError('uncaught exception', error);
			});
			process.on('beforeExit', function()
			{
				if (!shuttingDown)
				{
					self.shutdown();
				}
			});
			process.on('exit', function()
			{
				if (!shuttingDown && self.options.showErrors)
				{
					self.log.warning('Unexpected exit, please see documentation: https://github.com/alexfernandez/inits#unexpected-exit');
				}
			});
		}
		if (self.options.catchSignals)
		{
			process.on('SIGINT', function()
			{
				self.log.notice('User pressed control-C');
				signalled();
			});
			process.on('SIGTERM', function()
			{
				self.log.notice('Process killed');
				signalled();
			});
		}
	}

	function manageUnexpectedError(type, error)
	{
		if (!self.options.catchErrors)
		{
			return;
		}
		if (self.listeners('error').length > 0)
		{
			self.emit('error', 'Unexpected ' + type + ': ' + error);
		}
		if (self.options.showErrors)
		{
			self.log.alert('Unexpected %s: %s', type, error);
			if (error.stack)
			{
				self.log.alert(error.stack);
			}
		}
		startShutdownByError();
	}

	function startShutdownByError()
	{
		if (!shuttingDown)
		{
			return self.shutdown();
		}
		if (phase == 'stop')
		{
			self.log.debug('failed during stop; run finish callbacks');
			runAll('finish', function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run finish callbacks: ' + error);
				}
			});
		}
		else
		{
			if (self.options.showErrors)
			{
				self.log.error('Error while finishing in phase %s', phase);
			}
			if (self.options.exitProcess)
			{
				process.exit(1);
			}
		}
	}

	function signalled()
	{
		if (!self.options.catchSignals)
		{
			return;
		}
		self.shutdown();
	}

	self.shutdown = function()
	{
		if (shuttingDown)
		{
			return manageInternalError('Could not shutdown again');
		}
		shuttingDown = true;
		var start = Date.now();
		self.emit('shutdown');
		runAll('stop', function(error)
		{
			if (error)
			{
				return manageInternalError('Could not run stop callbacks: ' + error);
			}
			runAll('finish', function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run finish callbacks: ' + error);
				}
				if (self.options.logTimes)
				{
					var elapsedSeconds = (Date.now() - start) / 1000;
					self.log.info('Shutdown took %s seconds', elapsedSeconds.toFixed(1));
				}
				self.emit('end');
				if (self.options.exitProcess)
				{
					process.exit(0);
				}
			});
		});
	};

	self.standalone = function(callback)
	{
		if (standaloneCallback)
		{
			return manageInternalError('Already have standalone callback');
		}
		standaloneCallback = callback;
		self.on('ready', runStandalone);
	};

	function runStandalone()
	{
		setImmediate(function()
		{
			standaloneCallback(function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run start callbacks: ' + error);
				}
				setImmediate(self.shutdown);
			});
		});
	}
};

util.inherits(InitSystem, events.EventEmitter);
module.exports = new InitSystem();
// exported for tests
module.exports.InitSystem = InitSystem;

