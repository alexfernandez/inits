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
	this.ordered = {};
	this.unsorted = [];
}

TaskQueue.prototype.add = function(order, task)
{
	if (!order)
	{
		return this.unsorted.push(task);
	}
	if (!this.ordered[order])
	{
		this.ordered[order] = [];
	}
	this.ordered[order].push(task);
}

TaskQueue.prototype.next = function()
{
	var indexes = Object.keys(this.ordered);
	indexes.sort();
	for (var i = 0; i < indexes.length; i++)
	{
		var order = indexes[i];
		var branch = this.ordered[order];
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
	for (var order in this.ordered)
	{
		total += this.ordered[order].length;
	}
	return total;
}

