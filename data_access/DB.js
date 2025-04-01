import mysql from 'mysql2';
import dotenv from 'dotenv';
import path from 'path';
//import { User } from '../business/User.js';
//import { Organization } from '../business/Organization.js';
//import { Event } from '../business/Event.js';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess : "generalDb", //specify module where logs are from
});

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

/**
 * @Class DB
 */
export class DB {
    constructor(con = mysql) {
        //change database credentials
        this.con = mysql.createConnection({
            host: process.env.host,
            port: process.env.port,
            user: process.env.user,
            password: process.env.password,
            database: process.env.database
        });
        this.con.connect(function (err) {
            if (err) log.error("error in database access", err);
        });
    }

    close() {
        this.con.end();
    }
}