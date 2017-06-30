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
var queueLib = require('./queueLib.js');

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
	stopInParallel: false,
};

function InitSystem()
{
	this.taskQueues = {};
	this.flags = {};
	this.standaloneTask = null;
	this.startingUp = false;
	this.shuttingDown = false;
	this.finished = false;
	this.phase = 'pre';
	this.log = new Log('info');
	this.options = {};
	this.options.overwriteWith(DEFAULT_OPTIONS);
}

util.inherits(InitSystem, events.EventEmitter);

InitSystem.prototype.startup = function()
{
	var self = this;
	EVENTS.forEach(function(event)
	{
		self.taskQueues[event] = queueLib.create(event);
		self[event] = self.getAdder(event);
	});
	events.EventEmitter.call(self);
	setImmediate(function()
	{
		setTimeout(function()
		{
			self.reallyStartup();
		}, 0);
	});
};

InitSystem.prototype.getAdder = function(event)
{
	var self = this;
	return function(order, task)
	{
		if (self.flags[event])
		{
			return self.manageInternalError('Could not add ' + event + ' to queue after it has run: ' + new Error().stack);
		}
		if (typeof order == 'function')
		{
			task = order;
			order = null;
		}
		if (!task)
		{
			return self.manageInternalError('Could not add empty task to queue ' + event);
		}
		self.taskQueues[event].add(order, task);
	};
};

InitSystem.prototype.reallyStartup = function()
{
	var self = this;
	if (self.startingUp)
	{
		return self.manageInternalError('Could not start up again');
	}
	self.startingUp = true;
	var start = Date.now();
	self.emit('startup');
	self.setupErrors();
	self.runAll('init', function(error)
	{
		if (error)
		{
			return self.manageInternalError('Could not run init tasks: ' + error);
		}
		self.runAll('start', function(error)
		{
			if (error)
			{
				return self.manageInternalError('Could not run start tasks: ' + error);
			}
			if (self.options.logTimes)
			{
				var elapsedSeconds = (Date.now() - start) / 1000;
				self.log.info('Initialization took %s seconds', elapsedSeconds.toFixed(1));
			}
			self.startingUp = false;
			self.emit('ready');
		});
	});
};

InitSystem.prototype.manageInternalError = function(error)
{
	var self = this;
	if (self.listeners('error').length > 0)
	{
		self.emit('error', error);
	}
	if (self.options.showTraces)
	{
		error = new Error(error).stack;
	}
	self.startShutdownByError(util.format('Error in phase %s: %s', self.phase, error));
};

InitSystem.prototype.runAll = function(event, callback)
{
	var self = this;
	if (self.flags[event])
	{
		return callback('Tasks for ' + event + ' already run');
	}
	if (self.taskQueues[event].remaining())
	{
		self.log.debug('Running queue for %s: %s tasks', event, self.taskQueues[event].remaining());
	}
	self.phase = event;
	self.emitInProgress(event);
	var runner = 'runQueue';
	if (self.options[event + 'InParallel'])
	{
		runner = 'runInParallel';
	}
	self[runner](self.taskQueues[event], function(error)
	{
		if (error)
		{
			return callback(error);
		}
		self.flags[event] = true;
		self.emit(event + 'ed');
		return callback(null);
	});
};

InitSystem.prototype.emitInProgress = function(event)
{
	var self = this;
	self.emit(event + 'ing');
	if (event.endsWith('p'))
	{
		self.emit(event + 'ping');
	}
};

InitSystem.prototype.runQueue = function(queue, callback)
{
	var self = this;
	if (!queue.remaining())
	{
		return callback(null);
	}
	var current = queue.next();
	self.run(current, function(error)
	{
		if (error)
		{
			if (self.options.showErrors)
			{
				self.log.error('Error in phase %s: %s', self.phase, error);
			}
			if (self.options.stopOnError)
			{
				return callback(error);
			}
		}
		return self.runQueue(queue, callback);
	});
};

InitSystem.prototype.runInParallel = function(queue, callback)
{
	var self = this;
	var total = queue.remaining();
	if (!total)
	{
		return callback(null);
	}
	var received = 0;
	while (queue.remaining())
	{
		var task = queue.next();
		self.run(task, function(error)
		{
			if (error)
			{
				if (self.options.showErrors)
				{
					self.log.error('Error in phase %s: %s', self.phase, error);
				}
				if (self.options.stopOnError && received < total)
				{
					received += total;
					return callback(error);
				}
			}
			received += 1;
			if (received == total)
			{
				return callback(null);
			}
		});
	}
};

InitSystem.prototype.run = function(current, callback)
{
	var self = this;
	self.log.debug('Running task: %s', current.name);
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
};

InitSystem.prototype.setupErrors = function()
{
	var self = this;
	if (self.options.catchErrors)
	{
		globalDomain.on('error', function(error)
		{
			self.manageCrash('error', error);
		});
		process.on('uncaughtException', function(error)
		{
			self.manageCrash('uncaught exception', error);
		});
		process.on('beforeExit', function()
		{
			if (!self.shuttingDown)
			{
				self.shutdown();
			}
		});
		process.on('exit', function()
		{
			if (!self.finished && self.options.showErrors)
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
			self.signalled();
		});
		process.on('SIGTERM', function()
		{
			self.log.notice('Process killed');
			self.signalled();
		});
	}
};

InitSystem.prototype.manageCrash = function(type, error)
{
	var self = this;
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
	self.startShutdownByError(util.format('Process crashed with %s: %s', type, error));
};

InitSystem.prototype.startShutdownByError = function(error)
{
	var self = this;
	if (self.options.showErrors)
	{
		self.log.error(error);
	}
	if (!self.startingUp && !self.shuttingDown)
	{
		return self.shutdown(1);
	}
	if (self.options.showErrors)
	{
		var when = 'starting up';
		if (self.shuttingDown)
		{
			when = 'shutting down';
		}
		self.log.warning('Error while %s: exiting', when);
	}
	if (self.options.exitProcess)
	{
		self.finished = true;
		process.exit(1);
	}
};

InitSystem.prototype.signalled = function()
{
	var self = this;
	if (!self.options.catchSignals)
	{
		return;
	}
	self.shutdown();
};

/**
 * Shut down. Pass an error code if you want process.exit(errorCode), otherwise 0.
 */
InitSystem.prototype.shutdown = function(errorCode)
{
	var self = this;
	if (self.shuttingDown)
	{
		if (self.options.showErrors)
		{
			self.log.warning('Could not shutdown again');
		}
		return;
	}
	self.shuttingDown = true;
	var start = Date.now();
	self.emit('shutdown');
	self.runAll('stop', function(error)
	{
		if (error)
		{
			return self.manageInternalError('Could not run stop tasks: ' + error);
		}
		self.runAll('finish', function(error)
		{
			if (error)
			{
				return self.manageInternalError('Could not run finish tasks: ' + error);
			}
			if (self.options.logTimes)
			{
				var elapsedSeconds = (Date.now() - start) / 1000;
				self.log.info('Shutdown took %s seconds', elapsedSeconds.toFixed(1));
			}
			self.emit('end');
			self.finished = true;
			if (self.options.exitProcess)
			{
				process.exit(errorCode || 0);
			}
		});
	});
};

InitSystem.prototype.standalone = function(task)
{
	var self = this;
	if (self.standaloneTask)
	{
		return self.manageInternalError('Already have standalone task');
	}
	self.standaloneTask = task;
	self.on('ready', self.runStandalone);
};

InitSystem.prototype.runStandalone = function()
{
	var self = this;
	self.phase = 'standalone';
	setImmediate(function()
	{
		self.standaloneTask(function(error)
		{
			if (error)
			{
				return self.manageInternalError('Could not run standalone task: ' + error);
			}
			setImmediate(function()
			{
				self.shutdown();
			});
		});
	});
};

function create()
{
	var initSystem = new InitSystem();
	initSystem.startup();
	return initSystem;
}

module.exports = create();
module.exports.create = create;

