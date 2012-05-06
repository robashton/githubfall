var
  path = require('path'),
  http = require('http'),
  paperboy = require('paperboy'),
  socketio = require('socket.io'),
  https = require('https'),
  _ = require('underscore')

  PORT = 8003,
  WEBROOT = path.join(path.dirname(__filename), 'site');

var server = http.createServer(function(req, res) {
  var ip = req.connection.remoteAddress;
  paperboy
    .deliver(WEBROOT, req, res)
    .otherwise(function(err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end("Error 404: File not found");
    });
});

var io = socketio.listen(server);
io.configure({
  'log level': 0
});
server.listen(PORT);

var allEvents = []; // TODO: Remove this when not debugging!
var eventQueue = [];
var timeUntilNextEvents = 10000;
var last_created_at = new Date();
var overlapped = false;

var updateTimers = function() {
  if(overlapped) {
    timeUntilNextEvents += 1000;
    overlapped = false;
  } else {
    timeUntilNextEvents -= 1000;
  }
}

io.sockets.on('connection', function(socket) {
  for(var i in allEvents)
    socket.emit('push', allEvents[i]);
});

var fetchRepoInfo = function(name, cb) {
 var request = https.get({ host: 'api.github.com', path: '/repos/' + name}, function(res) {
    var data = '';
    res.on('data', function (chunk) {
      data += chunk;
    });
    res.on('end', function() {
      cb(JSON.parse(data));
    });
  }).on('error', function(e) {
    console.error(e);
  });
};

var createDataFromPushEvent = function(data, cb) {
  fetchRepoInfo(data.repo.name, function(repo) {
    cb({
      language: repo.language,
      actor: data.actor,
      payload: data.payload
    });
  });
};

var eventHandlers = {
  "PushEvent": function(event) {
    createDataFromPushEvent(event, function(data) {
      eventQueue.push(data);
      allEvents.push(data);
    });
  }
}

var processEvent = function(event) {
  if(event.created_at < last_created_at) {
    console.log('Skipping event', event.created_at);
    overlapped = true;
    return;
  }
  console.log('Processing event', event.created_at);
  last_created_at = event.created_at;
  var handler = eventHandlers[event.type];
  if(!handler) return;
  handler(event);
};

var processData = function(data) {
  var eventArray = JSON.parse(data);
  for(var i = eventArray.length-1 ; i >= 0; i--) {
    processEvent(eventArray[i]);
  }
  updateTimers();
};

var downloadEvents = function() {
 var request = https.get({ host: 'api.github.com', path: '/events'}, function(res) {
    var data = '';
    res.on('data', function (chunk) {
      data += chunk;
    });
    res.on('end', function() {
      processData(data);
    });
  }).on('error', function(e) {
    console.error(e);
  });

  setTimeout(downloadEvents, timeUntilNextEvents);
  console.log('Waiting ' + timeUntilNextEvents + ' until reading API again');
};

var broadcastEvent = function() {
  if(eventQueue.length === 0) return;
  var event = eventQueue.shift();
  io.sockets.emit('push', event);
};

downloadEvents();
setInterval(broadcastEvent, 500)