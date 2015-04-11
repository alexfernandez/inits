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

Initialization tasks, such as connecting to the database.
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

### Callbacks

All callbacks passed to the four phases must receive another callback
of the form `function(error)` following the Node.js convention,
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

Note: the choice of callback names is not important,
we have used `next` here but `callback` elsewhere;
whatever is clearer to you.

### No Dependencies

There is no dependency management in `inits`.
This is deliberate; it would be much more complex
for something that is not generally needed.
If you need a certain task to run before another one,
just run them in sequence.

### Other Lifecycles

Sometimes four phases are not enough.
`inits` might be designed to support custom phases in the future
if there is interest; just create an issue if you are interested,
or even better, send a pull request.

## API

The following functions and events are available.

### inits.init(callback)

Add a callback to the initialization.

### inits.start(callback)

Add a callback to be called when starting (after initialization).

### inits.stop(callback)

Add a callback to be called when stopping.

### inits.finish(callback)

Add a callback to be called before finishing.

### inits.standalone(callback)

Set a callback as a standalone task.
Useful when your script consists solely of a task
that must run after startup, followed by shutdown.

### Event: 'ready'

Sent when initialization has finished and the system is ready.

### Event: 'end'

Sent after the system has finished and is about to exit.
Can be used e.g. to call `process.exit()` (which `inits` doesn't do by itself).

### Event: 'error'

Sent when there is an error in any phase.

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

### showErrors

If set to `true` (or any other truthy value),
`inits` will show a log message for every error.
Default: `true`.

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



