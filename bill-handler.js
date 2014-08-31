var _ = require('lodash');
var conn;

module.exports = {
	init: function(mysql){
		conn = mysql;
	}
	addBill: function(bill){
		conn.query("INSERT INTO Bills (received")
	},
	processBills: function(){
		// check to see if we should send bills
	}
}

var shouldDistribute(){
	return new promise
}

//bind
_.bindAll(module.exports);