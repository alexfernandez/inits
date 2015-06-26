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
	stopOnError: true,
	maxTaskTimeSec: 10,
};


var InitSystem = function()
{
	var self = this;

	// attributes
	var taskQueues = {};
	var flags = {};
	var standaloneTask = null;
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
			taskQueues[event] = [];
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
		return function(task)
		{
			if (flags[event])
			{
				return manageInternalError('Could not add ' + event + ' to queue after it has run: ' + new Error().stack);
			}
			if (!task)
			{
				return manageInternalError('Could not add empty task to queue ' + event);
			}
			taskQueues[event].push(task);
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
				return manageInternalError('Could not run init tasks: ' + error);
			}
			runAll('start', function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run start tasks: ' + error);
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
		if (self.options.showTraces)
		{
			error = new Error(error).stack;
		}
		startShutdownByError(util.format('Error in phase %s: %s', phase, error));
	}

	function runAll(event, callback)
	{
		if (flags[event])
		{
			return callback('Tasks for ' + event + ' already run');
		}
		self.log.debug('Running queue for %s: %s tasks', event, taskQueues[event].length);
		phase = event;
		emitInProgress(event);
		runQueue(taskQueues[event], function(error)
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

	function emitInProgress(event)
	{
		self.emit(event + 'ing');
		if (event.endsWith('p'))
		{
			self.emit(event + 'ping');
		}
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
				if (self.options.showErrors)
				{
					self.log.error('Error in phase %s: %s', phase, error);
				}
				if (self.options.stopOnError)
				{
					return callback(error);
				}
			}
			return runQueue(queue, callback);
		});
	}

	function run(current, callback)
	{
		self.log.debug('Running task: %s', current);
		var timeout = setTimeout(function()
		{
			self.log.warning('Task %s is taking more than %s seconds', current.name, self.options.maxTaskTimeSec);
		}, self.options.maxTaskTimeSec * 1000);
		timeout.unref();
		globalDomain.run(function()
		{
			current(function(error)
			{
				clearTimeout(timeout);
				callback(error);
			});
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
		if (error.stack)
		{
			error = error.stack;
		}
		startShutdownByError(util.format('Unexpected %s: %s', type, error));
	}

	function startShutdownByError(error)
	{
		if (self.options.showErrors)
		{
			self.log.error(error);
		}
		if (!startingUp && !shuttingDown)
		{
			return self.shutdown(1);
		}
		shuttingDown = true;
		if (self.options.exitProcess)
		{
			process.exit(1);
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

	/**
	 * Shut down. Pass an error code if you want process.exit(errorCode), otherwise 0.
	 */
	self.shutdown = function(errorCode)
	{
		if (shuttingDown)
		{
			if (self.options.showErrors)
			{
				self.log.warning('Could not shutdown again');
			}
			return;
		}
		shuttingDown = true;
		var start = Date.now();
		self.emit('shutdown');
		runAll('stop', function(error)
		{
			if (error)
			{
				return manageInternalError('Could not run stop tasks: ' + error);
			}
			runAll('finish', function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run finish tasks: ' + error);
				}
				if (self.options.logTimes)
				{
					var elapsedSeconds = (Date.now() - start) / 1000;
					self.log.info('Shutdown took %s seconds', elapsedSeconds.toFixed(1));
				}
				self.emit('end');
				if (self.options.exitProcess)
				{
					process.exit(errorCode || 0);
				}
			});
		});
	};

	self.standalone = function(task)
	{
		if (standaloneTask)
		{
			return manageInternalError('Already have standalone task');
		}
		standaloneTask = task;
		self.on('ready', runStandalone);
	};

	function runStandalone()
	{
		phase = 'standalone';
		setImmediate(function()
		{
			standaloneTask(function(error)
			{
				if (error)
				{
					return manageInternalError('Could not run standalone task: ' + error);
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

