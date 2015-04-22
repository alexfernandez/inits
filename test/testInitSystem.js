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
	var system = new inits.InitSystem();
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
	var system = new inits.InitSystem();
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

function testSeveralCallbacks(callback)
{
	var system = new inits.InitSystem();
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
	var system = new inits.InitSystem();
	system.options.exitProcess = false;
	system.options.showErrors = false;
	system.options.stopOnError = true;
	var init1 = false;
	system.on('error', function(error)
	{
		if (error.contains('init1'))
		{
			init1 = true;
			return;
		}
		else if (error.contains('finish1'))
		{
			testing.assert(init1, 'Should catch init1 error', callback);
			testing.success(callback);
		}
		else
		{
			testing.failure('Invalid error ' + error);
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
	var system = new inits.InitSystem();
	system.options.exitProcess = false;
	system.options.showErrors = false;
	system.options.stopOnError = true;
	var finish = false;
	system.init(function(next)
	{
		next('init1');
	});
	system.finish(function(next)
	{
		finish = true;
		next(null);
	});
	system.on('end', function()
	{
		testing.assert(finish, 'Should have finished', callback);
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
		testSeveralCallbacks,
		testErrors,
		testErrorWithoutListener,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	log = new Log('debug');
	inits.standalone(testing.toShow(exports.test));
}

