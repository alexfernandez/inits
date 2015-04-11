# inits

A simple init system for Node.js.
Manages initialization tasks, and optionally also shutdown tasks.
Useful to simplify initialization of complex systems.

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

## Phases

There are four distinct phases in `inits`:

* init
* start
* stop
* finish

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



