'use strict';

/**
 * Init system for Node.js, task queue.
 * (C) 2017 Alex Fernández.
 */


// requires
require('prototypes');


exports.create = function()
{
	return new TaskQueue();
}

function TaskQueue(name)
{
	this.name = name;
	this.tasks = [];
}

TaskQueue.prototype.add = function(priority, task)
{
	if (typeof priority == 'function')
	{
		task = priority;
		priority = null;
	}
	this.tasks.push(task);
}

TaskQueue.prototype.next = function()
{
	return this.tasks.shift();
}

TaskQueue.prototype.remaining = function()
{
	return this.tasks.length;
}

