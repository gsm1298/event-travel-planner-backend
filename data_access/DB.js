import mysql from 'mysql2';
import dotenv from 'dotenv';
//import { User } from '../business/User.js';
//import { Organization } from '../business/Organization.js';
//import { Event } from '../business/Event.js';

dotenv.config();

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
            if (err) throw err;
        });
    }

    close() {
        this.con.end();
    }
}