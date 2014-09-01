
DROP DATABASE bill;
CREATE DATABASE bill;
USE bill;

CREATE TABLE EmailChecks (
	emailCheckID Integer NOT NULL AUTO_INCREMENT,
	checkTime DATETIME,
	PRIMARY KEY (emailCheckID)
);

/*--INSERT INTO EmailChecks (checkTime) VALUES ((NOW() - INTERVAL 5 HOUR));*/
INSERT INTO EmailChecks (checkTime) VALUES ('2014-07-08 00:00:00');

CREATE TABLE BillTypes (
	billTypeID Integer NOT NULL AUTO_INCREMENT,
	name Varchar(255),
	company Varchar(255),
	PRIMARY KEY (billTypeID)
);

INSERT INTO BillTypes (name,company) VALUES ("Water", "City of Houghton");
INSERT INTO BillTypes (name,company) VALUES ("Electric", "UPCO");
INSERT INTO BillTypes (name,company) VALUES ("Gas", "SEMCO");
INSERT INTO BillTypes (name,company) VALUES ("Internet", "Charter");

CREATE TABLE BillStates (
	billStateID Integer NOT NULL AUTO_INCREMENT,
	name Varchar(255),
	PRIMARY KEY (billStateID)
);

INSERT INTO BillStates (name) VALUES ("received");
INSERT INTO BillStates (name) VALUES ("distributed");
INSERT INTO BillStates (name) VALUES ("paid");

CREATE TABLE Bills (
	billID Integer NOT NULL AUTO_INCREMENT,
	received DATE,
	amount numeric(15,2),
	billTypeID Integer,
	billstateID Integer,
	PRIMARY KEY (billID)
);

CREATE TABLE BillSharers (
	billSharerID Integer NOT NULL AUTO_INCREMENT,
	name Varchar(255),
	email Varchar(255),
	PRIMARY KEY (billSharerID)
);
INSERT INTO BillSharers (name,email) VALUES ('Rui Hui', 'hurricane@tempesthostingservices.com');
INSERT INTO BillSharers (name,email) VALUES ('Khang', 'hurricane@tempesthostingservices.com');
INSERT INTO BillSharers (name,email) VALUES ('Felipe', 'hurricane@tempesthostingservices.com');
INSERT INTO BillSharers (name,email) VALUES ('Hurricane', 'hurricane@tempesthostingservices.com');


CREATE TABLE BillSharers2Bills (
	billSharerID Integer NOT NULL,
	billID Integer NOT NULL
);