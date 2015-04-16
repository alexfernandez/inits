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

An additional advantage of using `inits` is that all initialization code runs in a domain,
thus catching errors and uncaught exceptions.

## API

The following functions and events are exported directly by `inits`.

### inits.init(callback)

Add an asynchronous callback to the init phase.
The callback will receive a function parameter of the form
`function(error)`; see below.

Example:

```
inits.init(function(next)
{
    doSomething(function(error)
    {
        if (error)
        {
            console.error('failure: %s', error);
            next(error);
        }
        console.log('success');
        next(null);
    });
});
```

### inits.start(callback)

Add an asynchronous callback to be invoked when starting
(start phase, after init).

### inits.stop(callback)

Add an asynchronous callback to be invoked when stopping
(stop phase).

### inits.finish(callback)

Add an asynchronous callback to be invoked before finishing
(finish phase, after stop phase).

### inits.standalone(callback)

Set an asynchronous callback as a standalone task.
Useful when your script consists solely of a task
that must run after startup, followed by shutdown.

### Event: 'ready'

Sent when initialization has finished and the system is ready.

### Event: 'end'

Sent after the system has finished and is about to exit.
Can be used e.g. to call `process.exit()` (which `inits` doesn't do by itself).

### Event: 'error'

Sent when there is an error in any phase.

### Events: 'initing', 'starting', 'stopping', 'finishing'

Sent before the corresponding phases have run.

### Events: 'inited', 'started', 'stopped', 'finished'

Sent after the corresponding phases have run.

## Callbacks

All asynchronous callbacks passed to the four phases and to `standalone()`
must receive another callback of the form `function(error)`, following the Node.js convention;
and chain-call them at the end with either an error
or a falsy value (`null`, `undefined`, nothing) to signal success.

Example:

```
inits.init(function(next)
{
    DatabaseDriver.connect(url, function(error, connected)
    {
        if (error)
        {
            return next(error);
        }
        db = connected;
        next(null);
    });
});
```

Note how the callback `next` is invoked before the function ends;
this allows `inits` to run asynchronous tasks,
and to regain execution and run any other callbacks.

If your callback is synchronous, simply invoke the callback at the end:

```
inits.finish(function(next)
{
    db.close();
    next(null);
});
```

Note: the choice of callback parameters is not important,
we have used `next` here but `callback` elsewhere;
whatever is clearer to you.

## Options

To configure `inits` you can set some attributes in `inits.options`
that will modify how the init system behaves.

### catchErrors

If set to `true` (or any other truthy value),
`inits` will catch uncaught exceptions and errors
and shutdown automatically when any of those happens.
Default: `true`.

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

### No Dependencies

There is no dependency management in `inits`.
This is deliberate; it would be much more complex
for something that is not generally needed.
If you need a certain task to run before another one,
just run them in sequence.

### Guarantees

`inits` makes the following guarantees:

* All tasks in the `init` phase are run before the `start` phase.
* All tasks in the `start` phase are run before the `ready` event.
* Only one standalone task is called, after the `start` phase
and before the `stop` phase.
* All tasks in the `stop` phase are run after an error or a SIGTERM or SIGKILL signal.
* All tasks in the `finish` phase are run before finishing,
even if there is an error in the `stop` phase.
* The `end` event is only sent if shutdown finishes successfully,
which includes both the `stop` and `finish` phases.
* All tasks in any phase are chained serially and in the order they were added:
each task runs when the previous one has finished
(and invoked the parameter callback without an error).

If you notice any deviation from these behaviors,
please [report an issue](https://github.com/alexfernandez/inits/issues/new).

### Other Lifecycles

Sometimes four phases are not enough.
`inits` might be designed to support custom phases in the future
if there is interest; just create an issue if you are interested,
or even better, send a pull request.

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

