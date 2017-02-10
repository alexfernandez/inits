'use strict';

/**
 * Tests for init system for Node.js.
 * (C) 2015 Alex Fernández.
 */


// requires
require('prototypes');
var Log = require('log');
var testing = require('testing');
var inits = require('../lib/initSystem.js');

// globals
var log = new Log('info');


function testInitSystem(callback)
{
	var system = inits.create();
	system.options.exitProcess = false;
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
	var system = inits.create();
	system.options.exitProcess = false;
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

function testSeveralTasks(callback)
{
	var system = inits.create();
	system.options.exitProcess = false;
	var witness = {};
	system.on('error', function(error)
	{
		testing.failure(error, callback);
	});
	system.init(function(next)
	{
		witness.init1 = true;
		log.debug('init1');
		next(null);
	});
	system.init(function(next)
	{
		witness.init2 = true;
		log.debug('init2');
		next(null);
	});
	system.standalone(function(next)
	{
		testing.assert(witness.init1, 'Should call init1', callback);
		testing.assert(witness.init2, 'Should call init2', callback);
		witness.standalone = true;
		log.debug('standalone');
		next();
	});
	system.finish(function(next)
	{
		witness.finish1 = true;
		log.debug('finish1');
		next(null);
	});
	system.finish(function(next)
	{
		witness.finish2 = true;
		log.debug('finish2');
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(witness.finish1, 'Should call finish1', callback);
		testing.assert(witness.finish2, 'Should call finish2', callback);
		testing.success(callback);
	});
}

function testErrors(callback)
{
	var system = inits.create();
	system.options.exitProcess = false;
	system.options.showErrors = false;
	system.options.stopOnError = true;
	system.on('error', function(error)
	{
		if (error.contains('init1'))
		{
			testing.success(callback);
		}
		else
		{
			testing.failure('Invalid error: ' + error);
		}
	});
	system.init(function(next)
	{
		next('init1');
	});
	system.init(function(next)
	{
		next('init2');
	});
	system.start(function(next)
	{
		next('start');
	});
	system.finish(function(next)
	{
		next('finish1');
	});
	system.finish(function(next)
	{
		next('finish2');
	});
}

function testErrorWithoutListener(callback)
{
	var system = inits.create();
	system.options.exitProcess = false;
	system.options.showErrors = false;
	system.options.stopOnError = true;
	system.init(function(next)
	{
		next('init1');
		testing.success(callback);
	});
	system.finish(function(next)
	{
		testing.failure('Should not finish', callback);
		next('fail');
	});
	system.on('end', function()
	{
		testing.failure('Should not end', callback);
	});
}

function testConstraints(callback)
{
	var system = inits.create();
	system.log = log;
	system.options.exitProcess = false;
	var firstRun = false;
	var secondRun = false;
	var thirdRun = false;
	function first(next)
	{
		testing.assert(!secondRun, 'First should run before second', callback);
		testing.assert(!thirdRun, 'First should run before third', callback);
		firstRun = true;
		next();
	}
	function second(next)
	{
		testing.assert(firstRun, 'Second should run after first', callback);
		testing.assert(!thirdRun, 'Second should run before third', callback);
		secondRun = true;
		next();
	}
	function third(next)
	{
		testing.assert(firstRun, 'Third should run after first', callback);
		testing.assert(secondRun, 'Third should run after second', callback);
		thirdRun = true;
		next();
		testing.success(callback);
	}
	system.init(third).after(second);
	system.init(second);
	system.init(first).before(second);
}

/**
 * Run all tests.
 */
exports.test = function(callback)
{
	testing.run([
		testInitSystem,
		testStandalone,
		testSeveralTasks,
		testErrors,
		testErrorWithoutListener,
		testConstraints,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	log = new Log('debug');
	inits.standalone(exports.test);
}

