var express = require('express');
var router = express.Router();
var twilio = require('twilio');
var client = new twilio.RestClient();
var redis = require('redis-url').connect(process.env.REDISTOGO_URL);
var moment = require('moment');

/* GET home page. */
router.get('/', function(req, res) {
  // get current bacon status
  // redis.lrange("status", "0", "-1", function(err, values) {
  //   var updates = [];
  //   values.forEach(function(value, i) {
  //     update = JSON.parse(value);
  //     update.pretty_date = moment(update.date).fromNow();
  //     updates.push(update);
  //   })
  //   res.render('index', { title: 'Bacon Status', 
  //                         updates: updates,
  //                       });
  // })

  res.render('index');
});

router.post('/sms_test', function(req,res) {
  console.log("Test SMS received");

  var from = req.param('From');
  var message_sid = req.param('MessageSid');
  var body = req.param('Body');

  console.log("From: " + from + ", body: " + body);

  var twiml_resp = new twilio.TwimlResponse();
  twiml_resp.message('Okay');
  console.log(twiml_resp.toString());

  res.end();

});

router.post('/sms', function(req, res) {
  // deets
  console.log("SMS received");

  var from = req.param('From');
  var message_sid = req.param('MessageSid');
  var body = req.param('Body');

  console.log("INCOMING: " + from + ", body: " + body);

  redis.sismember("kir", from, function(err, values) {
    if(values==0) {
      // new number: add user, save status, broadcast status
      console.log(from + " is not a member");
      redis.sadd("kir", from, function(err, values) {
        if(!err) {
          console.log("Added " + from + " to user database");
          overflow_status = {date: new Date(), status: body};
          redis.lpush("status", JSON.stringify(overflow_status), function(err, values) {
            if(!err) {
              // don't broadcast the signup flow
              // broadcast(from, body);

              var twiml_resp = new twilio.TwimlResponse();
              twiml_resp.message('Hi. Tell me when KIR overflow starts and I\'ll tell everyone else. Say "status" for the latest update. "Bye" to quit.');
              console.log(twiml_resp.toString());
              res.send(twiml_resp.toString());
            } else {
              console.log("DB error adding status");
              res.end();
            }
          })
        } else {
          console.log("Error adding user to redis");
          res.end();
        }
      })
    } else {
      // existing member
      console.log(from + " is a member, parsing body");

      // unsubscribe
      if(body.toLowerCase()=="stop" || body.toLowerCase()=="bye") {
        redis.srem("kir", from, function(err, values) {
          if(!err) {
            console.log("Removing " + from);
            var twiml_resp = new twilio.TwimlResponse();
            twiml_resp.message('Got it. We won\'t text you anymore.');
            console.log(twiml_resp.toString());
            res.send(twiml_resp.toString());
          } else {
            console.log("DB error removing " + from);
            res.end();
          }
        })
      } 

      // get current status
      else if(body.toLowerCase()=="status") {
        console.log("Requesting status from " + from);
        redis.lrange("status", "0", "0", function(err, values) {
          // really assume one here, but let's put it into a loop, right? ugly!
          values.forEach(function(value, i) {
            status = JSON.parse(value);
            status.pretty_date = moment(status.date).fromNow();
            var twiml_resp = new twilio.TwimlResponse();

            console.log("Sending status to " + from + " : " + status.status);
            twiml_resp.message(status.status + '(' + status.pretty_date + ')');
            res.send(twiml_resp.toString());
          })
        })
      }

      // status update
      else {
        console.log("Logging overflow status: " + body);
        overflow_status = {date: new Date(), status: body};
        redis.lpush("status", JSON.stringify(overflow_status), function(err, values) {
          if(!err) {
            broadcast(from, body);
            var twiml_resp = new twilio.TwimlResponse();
            twiml_resp.message('Got it.');
            console.log(twiml_resp.toString());
            res.send(twiml_resp.toString());                
          } else {
            console.log("DB error adding status");
            res.end();
          }
        })
      }
    }
  })
});

function broadcast(from, status) {
  redis.smembers("kir", function(err, values) {
    if(!err) {
      values.forEach(function(user, i) {
        if( user != from ) {
          say (user, status);
        }
      })
    } else {
      console.log("Error fetching users from redis for broadcast.");
    }
  })
}

function say(to, body) {
  client.sendSms({
      to: to,
      from: '15092288394',
      body: body
  }, function(error, message) {
      if (!error) {
          console.log('Sent message to ' + to + ". SID:");;
          console.log(message.sid);
          console.log('Message sent on:');
          console.log(message.dateCreated);
      } else {
          console.log('Oops! There was an error sending a response.');
      }
  });
}

module.exports = router;
