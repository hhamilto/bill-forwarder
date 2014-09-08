// this inserts bills into the database 
// and sends notifications as necessary
var _ = require('lodash');
var deferred = require('deferred');
var moment = require('moment');
var Mustache = require('mustache');
var fs = require('fs');
var sprintf = require('sprintf').sprintf;
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
	host: 'tempesthostingservices.com',
	auth: {
		user: 'hurricane',
		pass: 'imapassword'
	},
	tls: {
		rejectUnauthorized: false
	}
});

var conn;
//xxx todo: read from file.
var email_template =
   'Dear {{name}},\n'
 + '\n'
 + 'These bills are due as a house:\n'
 + '\n'
 + '                Received    Amount\n'
 + '{{#bills}}\n'
 + '{{output}}\n'
 + '{{/bills}}\n'
 + '__________________________________\n'
 + '{{total}}\n'
 + '{{shareTotal}}\n'
 + '\n'
 + 'The bills were split {{numSharers}} ways.\n'
 + '\n'
 + 'Please pay via paypal to hhamilto@mtu.edu\n'

var Latch = function(n,cb){
	return function(){
		if(!--n) cb();
	};
};

module.exports = {
	init: function(mysql){
		conn = mysql;
	},
	addBill: function(billdfd){
		var dfd = deferred();
		billdfd(function(bill){
			//console.log(bill)
			conn.query("INSERT INTO Bills (received, amount, billTypeID, billStateID) VALUES ("+
				" '"+moment(bill.received).format('YYYY-MM-DD')+"'," +
				" "+bill.amount+"," +
				" (SELECT billTypeID FROM BillTypes WHERE name='"+bill.type+"'),"+
				" (SELECT billStateID FROM BillStates WHERE name='received'))", function(err, result) {
				if (err) throw err;
				//split among splitters
				conn.query("SELECT billSharerID FROM BillSharers",function(err, rows, fields){
					if (err) throw err;
					var latch = Latch(rows.length, function(){
						dfd.resolve(true);
					})
					rows.forEach(function(r){
						conn.query("INSERT INTO BillShares (billID, billSharerID) VALUES ("+
							result.insertId+", "+
							r.billSharerID+")"
							,function(err, result){
							latch();
						});
					});
				});
			});
		});
		return dfd.promise;
	},
	processBills: function(){
		var dfd = deferred();
		// check to see if we should send bills
		shouldDistribute()(function(result){
			if(!result)
				dfd.resolve(result);
			else
				distributeBills()(dfd.resolve);
		})
		//
		return dfd.promise;
	}
}

var distributeBills = function(){
	var dfd = deferred();
	//compile a list of bills
	conn.query(" SELECT "
	   + " s.name AS sharer, "
	   + " s.email AS sharer_email, "
	   + " bt.name as typeName, "
	   + " b.amount AS total_amount, "
	   + " b.received, "
	   + " b.amount/(SELECT COUNT(*) "
	   + "  FROM BillShares bbs2b "
	   + "  WHERE bbs2b.billID=b.billID) as share_amount "
	   + "FROM BillSharers s "
	   + " LEFT JOIN BillShares bs2b ON bs2b.billSharerID=s.billSharerID "
	   + " LEFT JOIN Bills b on bs2b.billID=b.billID "
	   + " LEFT JOIN BillStates bs ON bs.billStateID=b.billStateID "
	   + " LEFT JOIN BillTypes bt ON bt.billTypeID=b.billTypeID "
	   + "WHERE bs.name='received' ORDER BY sharer", function(err, rows, fields){
		if(err) console.log(err);
		var people = [];
		rows.forEach(function(r){
			var person;
			if(!(person = _.find(people,{name:r.sharer})))
				people.push({name:r.sharer,email:r.sharer_email, bills:[]}),
				person=people[people.length-1];
			person.bills.push({
				output: sprintf("%-15.15s%s  %7s", 
				                 r.typeName,
				                 moment(r.received).format('YYYY-MM-DD'),
				                 sprintf("$%.2f",r.total_amount)),
				totalAmount: r.total_amount,
				shareAmount: r.share_amount
			});
		});
		var maillatch = Latch(people.length, function(){
			dfd.resolve('success sending emails');
		});
		people.forEach(function(person){
			person.numSharers = people.length;
			person.total = sprintf('Total                      %7s',sprintf("$%.2f",person.bills.reduce(function(p,c){
				return p+c.totalAmount;
			},0)));
			person.shareTotal = sprintf('Your Share:                %7s',sprintf("$%.2f",person.bills.reduce(function(p,c){
				return p+c.shareAmount
			},0)));
			sendEmail(person)(maillatch);
		});
	});
	return dfd.promise;
}

var sendEmail = function(person){
	var dfd = deferred();
	transporter.sendMail = function(o,cb){
		cb();
	};
	transporter.sendMail({
		from: 'Hurricane Hamilton <hurricane@tempesthostingservices.com>', // sender address
		to: person.email, // list of receivers
		subject: '907 Ruby Utility Bills', // Subject line
		text: Mustache.render(email_template,person)
	}, function(err, info){
		if(err) console.log(err);
		else
			dfd.resolve(info);
	});
	return dfd.promise;
};

var shouldDistribute = function(){
		var dfd = deferred();
		var latch = Latch(2, function(){
				dfd.resolve(false);
			})
		//if any one bill is over 20 days old
		conn.query(" SELECT COUNT(*) AS count FROM Bills b "
			       + " LEFT JOIN BillStates bs ON bs.billStateID=b.billStateID"
			       + " WHERE received < NOW()- INTERVAL 20 DAY AND "
			       + " bs.name='received'", function(err, rows){
			if(err) console.log(err);
			if(rows[0].count>0)
				dfd.resolve(true);
			else
				latch();
		});
		//or if there are three
		conn.query(" SELECT COUNT(*) AS count FROM Bills b "
			       + " LEFT JOIN BillStates bs ON bs.billStateID=b.billStateID"
			       + " WHERE bs.name='received'", function(err, rows){
			if(err) console.log(err);
			if(rows[0].count>=3)
				dfd.resolve(true);
			else
				latch();
		});
		return dfd.promise;
}


//bind
_.bindAll(module.exports);