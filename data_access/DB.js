import mysql from 'mysql2';
import dotenv from 'dotenv';
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';

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

    /**
     * Gets a user based on a given email.
     * @param {String} email
     * @returns {User} user object
     */
    GetUserByEmail(email) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    SELECT 
                        user.user_id, user.first_name, user.last_name, user.email, user.hashed_password, 
                        user.profile_picture, user.org_id, organization.name AS 'org_name',
                        user.known_traveler_number, user.department, user.role_id, role.name AS 'role_name',
                        user.2fa_enabled, user.last_login, user.created, user.last_edited
                    FROM user
                        LEFT JOIN organization ON user.org_id = organization.org_id
                        LEFT JOIN role ON user.role_id = role.role_id
                    WHERE user.email = ?`;
                this.con.query(str, [email], function (err, rows, fields) {
                    if (!err) {
                        if (rows.length > 0) {
                            var row = rows[0];
                            resolve(new User(row.user_id, row.first_name, row.last_name, row.email, row.hashed_password, 
                                new Organization(row.org_id, row.org_name), row.role_name)
                            );
                        } else { resolve(false); }
                    } else {
                        // TODO - error logging
                        console.log(err);
                        resolve(false);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.log(error);
                resolve(false);
            }
        });
    }
}