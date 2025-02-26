//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
//import { Event } from '../business/Event.js';

export class UserDB extends DB {
    constructor() {
        super();
    }

    // ALL USER METHODS BELOW

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
                        user.user_id, user.first_name, user.last_name, user.email, user.phone_num,
                        user.gender, user.title, user.hashed_password, 
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
                            resolve(
                                new User(
                                    row.user_id, row.first_name, row.last_name, row.email, 
                                    row.phone_num, row.gender, row.title, row.pofile_picture,
                                    new Organization(row.org_id, row.org_name), 
                                    row.role_name, row.hashed_password
                                )
                            );
                        } else { resolve(null); }
                    } else {
                        // TODO - error logging
                        console.log(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.log(error);
                reject(error);
            }
        });
    }
}