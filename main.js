var Imap = require('imap'),
		inspect = require('util').inspect;
var fs = require("fs");
var mysql = require("mysql");
var argv = require('optimist').argv;
var moment = require('moment');
var MailParser = require("mailparser").MailParser;
var _ = require('lodash');
var BillHandler = require('./bill-handler');

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
	}
];

//return bill objects:
/*{
	type:
	amount:
	dueDate:
}
*/
var parsers = {
	"Electric" : function(mail){
		//console.log(mail);
		return {
			type: 'Electric',
			amount: /Total Payment Amount: \$(\d+\.\d\d)/.exec(mail.text)[1],
			received: mail.date
		};
	},
	"Gas": function(mail){

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
	var f = imap.fetch(uids, {
		bodies: [
			//'HEADER.FIELDS (FROM TO SUBJECT DATE)',
			''
		],
		struct: true
	});
	f.on('message', function(msg, seqno) {
		console.log('Message #%d', seqno);
		var prefix = '(#' + seqno + ') ';
		msg.on('body', function(stream, info) {
			var mailparser = new MailParser();
			stream.on('data', mailparser.write.bind(mailparser));
			stream.once('end', mailparser.end.bind(mailparser))
			mailparser.on('end',function(message) {
				var match = matchers.reduce(function(p,c){
					console.log("Trying to match " + c.name);
					var bodyMatch = c.text.reduce(function(p,c){
						console.log(c);
						if(p)return true;
						return c.regex.test(message.text);
					},false);
					if(bodyMatch) return c.name;
					return p;
				},null);
				console.log("Match: "+ match)
				if(match){
					var bill = parsers[match](message);
					console.log(bill);
				}
			});
		});
	});
	f.once('error', function(err) {
		console.log('Fetch error: ' + err);
	});
	f.once('end', function() {
		console.log('Done fetching all messages!');
		imap.end();
		conn.end()
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
					parseMessages(uids);
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


