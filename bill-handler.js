var _ = require('lodash');
var deferred = require('deferred');
var moment = require('moment');
var Mustache = require('mustache');

var conn;

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
						conn.query("INSERT INTO BillSharers2Bills (billID, billSharerID) VALUES ("+
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
				distributeBills();
		})
		//
		return dfd.promise;
	}
}

var distributeBills = function(){
	console.log("distributeBills");
	//compile a list of bills
	conn.query(" SELECT "
	   + "s.name AS sharer, "
	   + "bt.name as typeName, "
	   + " b.amount AS total_amount, "
	   + " b.amount/(SELECT COUNT(*) "
	   + "  FROM BillSharers2Bills bbs2b "
	   + "  WHERE bbs2b.billID=b.billID) as share_amount "
	   + "FROM BillSharers s "
	   + " LEFT JOIN BillSharers2Bills bs2b ON bs2b.billSharerID=s.billSharerID "
	   + " LEFT JOIN Bills b on bs2b.billID=b.billID "
	   + " LEFT JOIN BillStates bs ON bs.billStateID=b.billStateID "
	   + " LEFT JOIN BillTypes bt ON bt.billTypeID=b.billTypeID "
	   + "WHERE bs.name='received' ORDER BY sharer", function(err, rows, fields){
		if(err) console.log(err);
		var people = [];
		rows.forEach(function(r){
			var person;
			if(!(person = _.find(people,{name:r.sharer})))
				person = people.push({name:r.sharer, bills:[]});
			person.bills.push({
				type: r.typeName,
				total_amount: r.total_amount,
				share_amount: r.share_amount
			});
		});
		people.forEach(function(person){
			fs.writeFileSync(person.name+'.email',
				Mustache.render(fs.readFileSync('template_email.mustache'),
					person));
		});
	});
}

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