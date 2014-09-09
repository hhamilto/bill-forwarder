
var _ = require('lodash');
var deferred = require('deferred');
var moment = require('moment');
var fs = require('fs');
var https = require('https');

module.exports = {
	checkPaypal: function(){
		console.log("Checking paypal");
		login()(function(token){
			console.log("sucessfully logged into paypal: " +token);
		})
	}
}

var login = function(){
	var dfd = deferred();
	fs.readFile("connections.json", function(err, data){
		console.log("read connections");
		if (err) throw err;
		paypalConfig = JSON.parse(data).paypal;
		var req = https.request({
			hostname: "api.sandbox.paypal.com",
			path: "/v1/oauth2/token?"+
			        "grant_type=client_credentials",
			auth: paypalConfig.client_id+":"+paypalConfig.secret,
			headers: {
				"Accept": "application/json",
				"Accept-Language": "en_US"
			}
		}, function(res){
			console.log("got response. status: " +res.statusCode);
			var buf = '';
			res.on('data', function(err,data){
				if(err) throw err;
				buf+=data;
			})
			res.on('end', function(err,data){
				console.log("resdata was: " +data)
				if(err) throw err;
				buf+=data;
				resObj = JSON.parse(buf);
				dfd.resolve(resObj['access_token']);
			});
		});
		req.end();
		req.on('error', function(){
			console.log(arguments);
		});
	});
	return dfd.promise;
}
