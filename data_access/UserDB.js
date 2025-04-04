//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { logger } from '../service/LogService.mjs';
//import { Event } from '../business/Event.js';

// Init child logger instance
const log = logger.child({
    dataAccess : "userDb", //specify module where logs are from
});

const baseUserQuery =
`
    SELECT 
        user.user_id, user.first_name, user.last_name, user.email, user.phone_num,
        user.gender, user.title, user.hashed_password, user.mfa_secret,
        user.profile_picture, user.org_id, organization.name AS 'org_name',
        user.known_traveler_number, user.department, user.role_id, role.name AS 'role_name',
        user.mfa_enabled, user.date_of_birth, user.last_login, user.created, user.last_edited
    FROM user
        LEFT JOIN organization ON user.org_id = organization.org_id
        LEFT JOIN role ON user.role_id = role.role_id
`;

export class UserDB extends DB {
    constructor() {
        super();
    }

    /**
     * Create a new event in the database
     * @param {User} user
     * @returns {Promise<Integer>} The ID of the inserted event
     */
    createUser(user) {
        return new Promise((resolve, reject) => {
            try {
                var query;
                var params;
                
                // Check if orgId is set in user obejct
                if (user.org?.id) {
                    // Check if role is set in userObject
                    if (user.role) {
                        query= `
                            INSERT INTO user (first_name, last_name, email, hashed_password, title, phone_num, gender, date_of_birth, profile_picture, org_id, role_id)
                            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT role.role_id FROM role.name = ? LIMIT 1))
                        `;
                        params = [user.firstName, user.lastName, user.email, user.hashedPass, user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, user.role];
                    }
                    else {
                        query= `
                            INSERT INTO user (first_name, last_name, email, hashed_password, title, phone_num, gender, date_of_birth, profile_picture, org_id, role_id)
                            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;
                        params = [user.firstName, user.lastName, user.email, user.hashedPass, user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, 1]; // Default to 1 (Attendee)
                    }
                } else { reject('Organization ID set'); }

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        if (result.insertId > 0) {
                            log.verbose("user created", { userId: user.id, userEmail: user.email, userOrgId: user.org.id }); // logging for user creation
                            resolve(result.insertId);
                        }
                        else { resolve(null); }
                    } 
                    else {
                        log.error("database query error from createUser", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from createUser", error);
                reject(error);
            }

        });
    }

    /**
     * Update an existing user in the database
     * @param {User} user
     * @returns {Promise<Boolean>} True if the update was successful
     */
    updateUser(user) {
        return new Promise((resolve, reject) => {
            try{
                const query = `
                    UPDATE user
                    SET  user.first_name = ?, last_name = ?, email = ?, hashed_password = ?, mfa_secret = ?, title = ?, phone_num = ?, gender = ?, date_of_birth = ?, profile_picture = ?, org_id = ?, mfa_enabled = ?
                    WHERE user.user_id = ?`;
                const params = [user.firstName, user.lastName, user.email, user.hashedPass, JSON.stringify(user.mfaSecret), user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, user.mfaEnabled, user.id];

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        log.verbose("user updated", { userId: user.id, userEmail: user.email, userOrgId: user.org.id }); // audit logging for updates
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        log.error("database query error from updateUser", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from updateUser", error);
                reject(error);
            }
        });
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
                                    row.phone_num, row.gender, row.title, row.profile_picture,
                                    new Organization(row.org_id, row.org_name),
                                    row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                                )
                            );
                            log.verbose("user requested by email", { userEmail: email, userId: row.user_id }); // auditing for what user was requested frm the db
                        }
                        else { resolve(null); }
                    }
                    else {
                        log.error("database query error from GetUserByEmail", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetUserByEmail", error);
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
                var str = baseUserQuery + `WHERE user.user_id = ?`;
                this.con.query(str, [id], function (err, rows, fields) {
                    if (!err) {
                        if (rows.length > 0) {
                            var row = rows[0];
                            resolve(
                                new User(
                                    row.user_id, row.first_name, row.last_name, row.email,
                                    row.phone_num, row.gender, row.title, row.profile_picture,
                                    new Organization(row.org_id, row.org_name),
                                    row.role_name, row.hashed_password, 
                                    JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                                )
                            );
                            log.verbose("user requested by id", { userEmail: row.email, userId: id }); // auditing for what user was requested frm the db
                        }
                        else { resolve(null); }
                    }
                    else {
                        log.error("database query error from GetUserById", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetUserById", error);
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
                                row.phone_num, row.gender, row.title, row.profile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password,
                                JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        log.error("database query error from GetAllUsers", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetAllUsers", error);
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
                                row.phone_num, row.gender, row.title, row.profile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password,
                                JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        log.error("database query error from GetAllUsersFromOrg", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetAllUsersFromOrg", error);
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
                                row.phone_num, row.gender, row.title, row.profile_picture,
                                new Organization(row.org_id, row.org_name),
                                row.role_name, row.hashed_password,
                                JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                            )
                            );
                            resolve(users);
                        }
                        else { resolve(null); }
                    }
                    else {
                        log.error("database query error from GetAllAttendeesInEvent", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetAllAttendeesInEvent", error);
                reject(error);
            }
        });
    }
}