[![Build Status](https://secure.travis-ci.org/alexfernandez/inits.png)](http://travis-ci.org/alexfernandez/inits)

[![Package quality](http://packagequality.com/badge/inits.png)](http://packagequality.com/#?package=inits)

# inits

A simple init system for Node.js.
Manages initialization tasks, and optionally also shutdown tasks.
Useful to simplify initialization of complex systems
with asynchronous tasks.

## Installation

Simply run:

```
npm install inits
```

Or add `inits` to your `package.json`:

```
"dependencies": {
    ...
    "inits": "*",
    ...
},
```

and run `npm install`.

## Rationale

The typical use case is this:
you have several asynchronous initialization tasks and you need to them to proceed orderly.
Sometimes your web server is starting up and accepting requests before your database connection is up,
so you are showing an error some of the time.
Your notification system is getting tripped by these errors.
So you add a delay to the database initialization but as your system grows in complexity
there are more and more initialization tasks and again errors creep up once in a while.

Same thing happens during shutdown:
you have a queue that accumulates data and writes it to the database every minute,
and you want to clear the queue before closing down.
But as a good citizen you also want to close your database connections.
Unless you are careful, the database may be closed when you try to write that data out.

`inits` adds an `init` phase where you can stick all of these asynchronous initialization tasks,
and a `start` phase to start up servers.
Symmetrically there is a `stop` phase during which servers and queues are closed,
and then a `finish` phase for final shutdown tasks.
Example:

```
inits.init(function(callback)
{
	db.initialize(function(error)
	{
		if (error) return callback(error);
		db.createPool(callback);
	});
});
inits.finish(function(callback)
{
	db.flush(function(error)
	{
		if (error) return callback(error);
		db.destroyPool(callback);
	});
});
```

An additional advantage of using `inits` is that all initialization code runs in a domain,
thus catching errors and uncaught exceptions.

## API

The following functions and events are exported directly by `inits`.

### inits.init(task)

Add an asynchronous task to the init phase.
The task will receive a callback parameter of the form
`function(error)`; see below.

Example:

```
inits.init(function(callback)
{
    doSomething(function(error)
    {
        if (error)
        {
            console.error('failure: %s', error);
            callback(error);
        }
        console.log('success');
        callback(null);
    });
});
```

### inits.start(task)

Add an asynchronous task to be invoked when starting
(start phase, after init).

### inits.stop(task)

Add an asynchronous task to be invoked when stopping
(stop phase).

### inits.finish(task)

Add an asynchronous task to be invoked before finishing
(finish phase, after stop phase).

### inits.standalone(task)

Set an asynchronous task as standalone.
Useful when your script consists solely of a task
that must run after startup, followed by shutdown.

### Event: 'ready'

Sent when initialization has finished and the system is ready.

### Event: 'shutdown'

Sent when the system is starting an ordered shutdown:
it will run the tasks for `stop` and `finish`, then exit.

### Event: 'end'

Sent after the system has finished and is about to exit.
Can be used e.g. to print a warning message.

### Event: 'error'

Sent when there is an error in any phase.

### Events: 'initing', 'starting', 'stopping', 'finishing'

Sent before the corresponding phases have run.

### Events: 'inited', 'started', 'stopped', 'finished'

Sent after the corresponding phases have run.

## Tasks

All asynchronous tasks passed to the four phases and to `standalone()`
must accept as parameter a callback of the form `function(error)`, following the Node.js convention;
and chain-call them at the end with either an error
or a falsy value (`null`, `undefined`, nothing) to signal success.

Example:

```
inits.init(function(callback)
{
    DatabaseDriver.connect(url, function(error, connected)
    {
        if (error)
        {
            return callback(error);
        }
        db = connected;
        callback(null);
    });
});
```

Note how the `callback` is invoked before the function ends;
this allows `inits` to run asynchronous tasks,
and to regain execution and run any other tasks.

If your task is synchronous, simply invoke the callback at the end:

```
inits.finish(function(callback)
{
    db.close();
    callback(null);
});
```

### Task Order

Tasks can be ordered to run in a certain sequence.
When adding a task you can specify its order as first parameter:

```
inits.init(1, function(callback)
{
    db.close();
    callback(null);
});
```

`inits` will run first all tasks with order `1`,
then all tasks with order `2`,
and so on.
Finally it will run all tasks without specific order.

## Options

To configure `inits` you can set some attributes in `inits.options`
that will modify how the init system behaves.

### catchErrors

If set to `true` (or any other truthy value),
`inits` will catch uncaught exceptions and errors
and shutdown automatically when any of those happens.
Default: `true`.

Example:

```
inits.options.catchErrors = false;
```

### catchSignals

If set to `true` (or any other truthy value),
`inits` will intercept SIGTERM and SIGKILL (e.g. control-C) signals
and shutdown when one of them is received.
Default: `true`.

### exitProcess

If set to `true` (or any other truthy value),
`inits` will exit after shutdown
(with code 0 if successful, or code 1 if it fails).
Default: `true`.

### showErrors

If set to `true` (or any other truthy value),
`inits` will show a log message for every error.
Default: `true`.

### showTraces

If set to `true` (or any other truthy value),
`inits` will show the trace for error messages.
Default: `false`.

### logTimes

If set to `true` (or any other truthy value),
`inits` will log how long initialization and shutdown took.
Default: `true`.

### stopOnError

If set to `true` (or any other truthy value),
if a task in any phase returns an error the phase will stop.
If `false` errors will just be logged (if configured).
Default: `false`.

### maxTaskTimeSec

If any task takes more than this number of seconds,
a warning will be shown on the log.
Default: 10.

### initInParallel, startInParallel, stopInParallel, finishInParallel

If any of these is set to `true`(or any other truthy value),
then tasks in the corresponding phase
(init, start, stop or finish)
are run in parallel.
Each task is invoked before waiting for the last one to end.
The phase will only end once all of the tasks have ended.
Default: `false`, which means tasks run in sequence.

## Lifecycle of a System

There are four distinct phases in `inits`:

* init,
* start,
* stop,
* and finish.

They are intended to be symmetric:
if a certain capability is open in `init`
it should be closed in `finish`,
and whatever starts in `start`
should be stopped in (surprise!) `stop`.

### Init Phase

Initialization tasks, ideal for low-level stuff
such as connecting to the database.
The init system will make sure that all `require`'d code files have been loaded
before starting this phase.

### Start Phase

Tasks to start the system, such as starting a web server.
These run after all `init` tasks have finished.

### Stop Phase

Tasks to stop the system, such as stopping any open servers.
These run when the system initiates shutdown: either by a signal
(SIGTERM, SIGKILL or control-C) or by an uncaught exception
or an error.

### Finish Phase

Final shutdown tasks, such as disconnecting from the database:
whatever needs to be done before the system definitely closes down.

### Guarantees

`inits` makes the following guarantees:

* All tasks in the `init` phase are run before the `start` phase.
* All tasks in the `start` phase are run before the `ready` event.
* Only one standalone task is called, after the `start` phase
and before the `stop` phase.
* All tasks in the `stop` phase are run after an error or a SIGTERM or SIGKILL signal.
* All tasks in the `finish` phase are run before finishing,
except if there is an error while starting up or shutting down.
(*Note*: before version 0.1.15 finish tasks were run if there were
errors during any phase.)
* The `end` event is only sent if shutdown finishes successfully,
which includes both the `stop` and `finish` phases.
* When no order is specified,
all tasks in any phase are chained serially and in the order they were added:
each task runs when the previous one has finished
(but only if it invoked the parameter callback without an error).
* When order is specified, tasks with a given order will run before all other tasks with larger order,
and after all other tasks with smaller order.
* Tasks with specified order will run before tasks without specified order.

These guarantees only apply if tasks do not finish in error.
In that case the process will try to shutdown,
but if the error happens while starting up or shutting down
`inits` will just exit.

If you notice any deviation from these behaviors,
please [report an issue](https://github.com/alexfernandez/inits/issues/new).

### Other Lifecycles

Sometimes four phases are not enough.
`inits` might be designed to support custom phases in the future
if there is interest; just create an issue if you are interested,
or even better, send a pull request.

### Unexpected Exit

In Node.js v0.12.x and io.js, there is an event
[beforeExit](https://nodejs.org/api/process.html#process_event_beforeexit)
that can be used to force an ordered shutdown when there is nothing else to do
and the event loop empties.
However in Node.js v0.10.x there is no official way to catch this situation;
the process can just finish without running the `stop` or `finish` tasks.
rather than rely on complex intervals we have opted to just
let Node.js finish, but alert the user about this.

If you don't want your process to exit unexpectedly you can use a `standalone` task.
You may also create a `setInterval()`,
or just keep your servers running and not call `unref()` on them.
In this last case your processes will keep running and only exit
when the appropriate signal arrives.
All of these methods will prevent your process from finishing without
running the `stop` and `finish` tasks.

## Full example

How to make a web server that connects to a MongoDB database.
We will hook database startup to the `init` phase,
and server start to the `start` phase.
On `stop` we stop the server,
and on `finish` we close the connection to the database.

``` javascript
var inits = require('inits');
var MongoClient = require('mongodb').MongoClient
var mongodb = require('mongodb');
var http = require('http');

var db;

inits.init(function(callback)
{
    MongoClient.connect(url, function(error, connected)
    {
        if (error)
        {
            return callback(error);
        }
        db = connected;
        callback(null);
    });
});
inits.start(function(callback)
{
    server = http.createServer(listener);
    server.on('error', function(error)
    {
        return callback(error);
    });
    server.on('listening', function()
    {
        callback(null);
    });
});
inits.stop(function(callback)
{
    server.close(callback);
});
inits.finish(function(callback)
{
    db.close();
    callback(null);
});
```

## Licensed under The MIT License

Copyright (c) 2015 Alex Fernández <alexfernandeznpm@gmail.com>
and [contributors](https://github.com/alexfernandez/inits/graphs/contributors).

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

