'use strict';

/**
 * Sample use of init system for Node.js.
 * (C) 2015 Alex Fernández.
 */


// requires
require('prototypes');
var Log = require('log');
var testing = require('testing');
var inits = require('../lib/initSystem.js');

// globals
var log = new Log('debug');


function testSample(callback)
{
	inits.options.exitProcess = false;
	var witness = {};
	inits.on('error', function(error)
	{
		testing.failure(error, callback);
	});
	inits.init(function(next)
	{
		witness.init = true;
		log.debug('init');
		next(null);
	});
	inits.start(function(next)
	{
		testing.assert(witness.init, 'Should call init', callback);
		witness.start = true;
		log.debug('start');
		next(null);
	});
	inits.on('ready', function()
	{
		testing.assert(witness.start, 'Should call start', callback);
		inits.shutdown();
	});
	inits.stop(function(next)
	{
		testing.assert(witness.start, 'Should call start', callback);
		witness.stop = true;
		log.debug('stop');
		next(null);
	});
	inits.finish(function(next)
	{
		testing.assert(witness.stop, 'Should call stop', callback);
		witness.finish = true;
		log.debug('finish');
		next(null);
	});
	inits.on('end', function()
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
		testSample,
	], callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	exports.test(testing.show);
}

