'use strict';

/**
 * Run package tests.
 * (C) 2015 Alex Fernández.
 */

// requires
var testing = require('testing');
var Log = require('log');
var inits = require('../lib/initSystem.js');

// globals
var log = new Log('info');


/**
 * Run all module tests.
 */
exports.test = function(callback)
{
	log.debug('Running tests');
	var tests = {};
	var libs = [
		'../test/testInitSystem.js',
	];
	libs.forEach(function(lib)
	{
		tests[lib] = require(lib).test;
	});
	testing.run(tests, 5000, callback);
};

// run tests if invoked directly
if (__filename == process.argv[1])
{
	inits.standalone(exports.test);
}

