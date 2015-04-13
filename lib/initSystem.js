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
	catchSignals: true,
	catchErrors: true,
	exitProcess: true,
	showErrors: true,
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
	var errored = false;
	var phase = 'pre';
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
				return manageInternalError('Could not add ' + event + ' to queue after it has run');
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
				self.emit('ready');
				if (self.options.logTimes)
				{
					var elapsedSeconds = (Date.now() - start) / 1000;
					log.info('Initialization took %s seconds', elapsedSeconds.toFixed(1));
				}
			});
		});
	}

	function manageInternalError(error)
	{
		self.emit('error', error);
		if (self.options.showErrors)
		{
			log.error('Error in phase %s: %s', phase, error);
		}
		startShutdownByError();
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
				return callback(error);
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
		}
		if (self.options.catchSignals)
		{
			process.on('SIGINT', function()
			{
				log.notice('User pressed control-C');
				signalled();
			});
			process.on('SIGTERM', function()
			{
				log.notice('Process killed');
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
		self.emit('error', 'Unexpected ' + type + ': ' + error);
		if (self.options.showErrors)
		{
			log.alert('Unexpected %s: %s', type, error);
			if (error.stack)
			{
				log.alert(error.stack);
			}
		}
		startShutdownByError();
	}

	function startShutdownByError()
	{
		if (errored)
		{
			if (self.options.exitProcess)
			{
				process.exit(1);
			}
			return;
		}
		errored = true;
		if (!shuttingDown)
		{
			self.shutdown();
		}
		if (phase == 'stop')
		{
			log.debug('failed during stop; run finish callbacks');
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
				log.error('Error while finishing in phase %s', phase);
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
					log.info('Shutdown took %s seconds', elapsedSeconds.toFixed(1));
				}
				self.emit('end');
				if (self.config.exitProcess)
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
		standaloneCallback(function(error)
		{
			if (error)
			{
				return manageInternalError('Could not run start callbacks: ' + error);
			}
			self.shutdown();
		});
	}
};

util.inherits(InitSystem, events.EventEmitter);
module.exports = new InitSystem();
// exported for tests
module.exports.InitSystem = InitSystem;

