//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { Organization } from '../business/Organization.js';

export class OrganizationDB extends DB {
    constructor() {
        super();
    }

    /**
     * Gets an Organization based on an ID.
     * @param {Integer} id
     * @returns {Organization | null} Organization object if found or null if not
     */
    GetOrganizationById(id) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    SELECT 
                        organization.org_id, organization.name, organization.created, organization.last_edited
                    FROM organization
                    WHERE organization.org_id = ?`;
                this.con.query(str, [id], function (err, rows, fields) {
                    if (!err) {
                        if (rows.length > 0) {
                            var row = rows[0];
                            resolve(new Organization(row.org_id, row.name));
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

    /**
     * Gets all Organizations.
     * @returns {Organization[] | null} An array of Organization objects if anything is found or null if not
     */
    GetAllOrganizations() {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    SELECT 
                        organization.org_id, organization.name, organization.created, organization.last_edited
                    FROM organization`;
                this.con.query(str, function (err, rows, fields) {
                    if (!err) {
                        if (rows.length > 0) {
                            resolve( rows.map( row => new Organization(row.org_id, row.name)) );
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

    /**
     * Creates an Organization
     * @param {String} name
     * @returns {Organization | null} the created organization object if successful or null if not
     */
    CreateOrganization(name) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    INSERT INTO organization (name)
                        VALUES (?)`;
                this.con.query(str, [name], (err, result) => {
                    if (!err) {
                        if (result.insertId > 0) {
                            resolve(new Organization(result.insertId, name));
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

    /**
     * Updates an Organization based on ID
     * @param {Integer} id
     * @param {String} name
     * @returns {Boolean} True or False based on if the update was successful
     */
    UpdateOrganization(id,name) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    UPDATE organization SET
                        organization.name = ?
                    WHERE organization.org_id = ?`;
                this.con.query(str, [id, name], (err, result) => {
                    if (!err) {
                        if (result.affectedRows > 0) {
                            resolve(true);
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