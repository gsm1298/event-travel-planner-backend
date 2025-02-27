//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
//import { Event } from '../business/Event.js';

const baseUserQuery =
`
    SELECT 
        user.user_id, user.first_name, user.last_name, user.email, user.phone_num,
        user.gender, user.title, user.hashed_password, 
        user.profile_picture, user.org_id, organization.name AS 'org_name',
        user.known_traveler_number, user.department, user.role_id, role.name AS 'role_name',
        user.2fa_enabled, user.last_login, user.created, user.last_edited
    FROM user
        LEFT JOIN organization ON user.org_id = organization.org_id
        LEFT JOIN role ON user.role_id = role.role_id
`;

export class UserDB extends DB {
    constructor() {
        super();
    }

    /**
     * Gets a user based on a given email.
     * @param {String} email
     * @returns {User} user object
     */
    GetUserByEmail(email) {
        return new Promise((resolve, reject) => {
            try {
                var str = baseUserQuery + 'WHERE user.email = ?';

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
                        }
                        else { resolve(null); }
                    }
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Gets a user based on a given id.
     * @param {Integer} id
     * @returns {User} user object
     */
    GetUserById(id) {
        return new Promise((resolve, reject) => {
            try {
                var str = baseUserQuery + `WHERE user.id = ?`;
                this.con.query(str, [id], function (err, rows, fields) {
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
                        }
                        else { resolve(null); }
                    }
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Gets all users.
     * @returns {User[]} Array of user object
     */
    GetAllUsers() {
        return new Promise((resolve, reject) => {
            try {
                var str = baseUserQuery;
                this.con.query(str, function (err, rows) {
                    if (!err) {
                        if (rows.length > 0) {
                            const users = rows.map(row => new User(
                                row.user_id, row.first_name, row.last_name, row.email,
                                row.phone_num, row.gender, row.title, row.pofile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
    * Gets all users in an org.
    * @param {Integer} orgId
    * @returns {User[]} Array of user object
    */
    GetAllUsersFromOrg(orgId) {
        return new Promise((resolve, reject) => {
            try {
                var str = baseUserQuery + `WHERE user.org_id = ?`;
                this.con.query(str, [orgId], function (err, rows) {
                    if (!err) {
                        if (rows.length > 0) {
                            const users = rows.map(row => new User(
                                row.user_id, row.first_name, row.last_name, row.email,
                                row.phone_num, row.gender, row.title, row.pofile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
    * Gets all attendees of an event.
    * @param {Integer} eventId
    * @returns {User[]} Array of user object
    */
    GetAllAttendeesInEvent(eventId) {
        return new Promise((resolve, reject) => {
            try {
                var str = baseUserQuery +
                    `
                            LEFT JOIN attendee on user.user_id = attendee.user_id
					    WHERE attendee.event_id = ?
                    `;
                this.con.query(str, [eventId], function (err, rows) {
                    if (!err) {
                        if (rows.length > 0) {
                            const users = rows.map(row => new User(
                                row.user_id, row.first_name, row.last_name, row.email,
                                row.phone_num, row.gender, row.title, row.pofile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }
}