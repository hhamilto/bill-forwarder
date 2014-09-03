// this mainly does the checking email
// and parseing of bills from the emails
var Imap = require('imap'),
		inspect = require('util').inspect;
var fs = require("fs");
var mysql = require("mysql");
var argv = require('optimist').argv;
var moment = require('moment');
var MailParser = require("mailparser").MailParser;
var _ = require('lodash');
var BillHandler = require('./bill-handler');
var deferred = require('deferred');
var crypto = require('crypto');
var spawn = require('child_process').spawn

var Latch = function(n,cb){
	return function(){
		if(!--n) cb();
	};
};

var connections = JSON.parse(fs.readFileSync("connections.json"));
var matchers = [
	{
		name:"Electric",
		text: [{
			regex: />The following payment has been scheduled for Upper Peninsula Power Company/
		}]
	},{
		name:"Gas",
		text: [{
			regex: /SEMCO ENERGY Gas Company/
		}]
	},{
		name:"Water",
		text: [{
			regex: /Subject: WATER BILL/
		}]
	}
];


var parsers = {
	"Electric" : function(mail){
		return deferred({
			type: 'Electric',
			amount: /Total Payment Amount: \$(\d+\.\d\d)/.exec(mail.text)[1],
			received: mail.date
		});
	},
	"Gas": function(mail){
		return deferred({
			type: 'Gas',
			amount: /Balance Due:\s*[\s\S]{1,2}\s*> \$(\d+\.\d\d)/.exec(mail.text)[1],
			received: mail.date
		});
	},
	"Water": function(mail){
		var child = spawn('pdftotext', [
		'/dev/stdin',
		'-']);
		//hope thats a pdf.
		var fileNam = crypto.randomBytes(4).readUInt32LE(0)+'.pdf';
		fs.writeFile(fileNam, mail.attachments[0].content, function(err){
			if(err) throw err
			// evidently fileNam gets overwritten on each call, so as the first
			// pdftotext ends, it deletes the file out from under the first pdftotext. 
			// weirdest thing I've seen todate in node. :(
			var fileName = fileNam;
			var child = spawn('pdftotext', [
				'-layout',
				'-enc',
				'UTF-8',
				fileName,
				'-']);
			var output = '';
			var stderr = '';
			child.stdout.on('data', function(data) {
				output += data;
			});
			child.stderr.on('data', function(data) {
				stderr += data;
			});
			child.on('exit', function(code){
				if (code !== 0) console.log("pdftotext didn't do so hot.");
				var obj = {};
				if(/TOTAL DUE\s*\$(\d+\.\d\d)/.exec(output) == null){
					console.log("DEBUG OUTPUT: "+ output);
					console.log("DEBUG STDERR: "+ stderr);
				}

				dfd.resolve({
					type: 'Water',
					amount: /TOTAL DUE\s*\$(\d+\.\d\d)/.exec(output)[1],
					received: mail.date
				});
				fs.unlink(fileName);
			});
		});
		var dfd = deferred();
		return dfd.promise;
	}
}
var conn = mysql.createConnection(_.defaults(connections.db,{
	multipleStatements: true
}));
conn.connect();
BillHandler.init(conn);

var imap = new Imap(_.defaults(connections.email,{
	port: 993,
	tls: true,
	//debug: console.log,
	tlsOptions: {
		rejectUnauthorized:false
	}
}));

function openInbox(cb) {
	imap.openBox('INBOX', true, cb);
}

var parseMessages = function(uids){
	console.log("messageCount: "+ uids.length)
	msgLatch = Latch(uids.length, function(){
		conn.query("INSERT INTO EmailChecks (checkTime) VALUES (NOW())");
		BillHandler.processBills()(function(t){
			console.log("Ending run. Result: " + t);
			conn.end();
			imap.end();
		});
	});
	var f = imap.fetch(uids, {
		bodies: [''],
		struct: true
	});
	f.on('message', function(msg, seqno) {
		msg.on('body', function(stream, info) {
			var mailparser = new MailParser();
			stream.on('data', mailparser.write.bind(mailparser));
			stream.once('end', mailparser.end.bind(mailparser))
			mailparser.on('end',function(message) {
				var match = matchers.reduce(function(p,c){
					var bodyMatch = c.text.reduce(function(p,c){
						if(p)return true;
						return c.regex.test(message.text);
					},false);
					if(bodyMatch) return c.name;
					return p;
				},null);
				if(match){
				console.log("Match: "+ match)
					var bill = parsers[match](message);
					BillHandler.addBill(bill)(function(){
						msgLatch();
					});
				}else
					msgLatch();
			});
		});
	});
	f.once('error', function(err) {
		console.log('Fetch error: ' + err);
	});
	f.once('end', function() {
		console.log('Done fetching all messages!');
		//imap.end();
	});
}

var getMail = function(){
	imap.once('ready', function() {
		openInbox(function(err, box) {
			if (err) throw err;
			conn.query("SELECT checkTime FROM EmailChecks ORDER BY checkTime DESC LIMIT 1", function(err,	rows, fields) {
				if (err) throw err;
				imap.search([['FROM', 'John Hamilton'],['SINCE',
					        moment(rows[0].checkTime)
					        .format('MMMM D, YYYY')]] ,function(err,uids){
					console.log("searchin");
					if (err) throw err;
					if(uids.length>0) parseMessages(uids);
					else conn.end(),imap.end();
				});
			});
		});
	});
}

if(argv["cleardb"]){
	console.log("clearin db");
	conn.query(String(fs.readFileSync("migration.sql")), function(){
		getMail();
	});
}else{
	getMail();
}


imap.once('error', function(err) {
	console.log(err);
});

imap.once('end', function() {
	console.log('Connection ended');
});



imap.connect();


