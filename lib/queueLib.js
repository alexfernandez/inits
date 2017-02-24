'use strict';

/**
 * Init system for Node.js, task queue.
 * (C) 2017 Alex Fernández.
 */


// requires
require('prototypes');


exports.create = function(name)
{
	return new TaskQueue(name);
}

function TaskQueue(name)
{
	this.name = name;
	this.prioritized = {};
	this.unsorted = [];
}

TaskQueue.prototype.add = function(priority, task)
{
	if (!priority)
	{
		return this.unsorted.push(task);
	}
	if (!this.prioritized[priority])
	{
		this.prioritized[priority] = [];
	}
	this.prioritized[priority].push(task);
}

TaskQueue.prototype.next = function()
{
	var priorities = Object.keys(this.prioritized);
	priorities.sort();
	for (var i = 0; i < priorities.length; i++)
	{
		var priority = priorities[i];
		var branch = this.prioritized[priority];
		if (branch.length)
		{
			return branch.shift();
		}
	}
	return this.unsorted.shift();
}

TaskQueue.prototype.remaining = function()
{
	var total = this.unsorted.length;
	for (var priority in this.prioritized)
	{
		total += this.prioritized[priority].length;
	}
	return total;
}

