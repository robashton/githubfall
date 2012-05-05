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
server.listen(PORT);

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
      io.sockets.emit('push', data);
    });
  }
}

var processEvent = function(event) {
  var handler = eventHandlers[event.type];
  if(!handler) return;
  handler(event);
};

var processData = function(data) {
  var eventArray = JSON.parse(data);
  for(var i =0 ; i < eventArray.length; i++)
    processEvent(eventArray[i]);
};

setInterval(function() {
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
}, 5000);