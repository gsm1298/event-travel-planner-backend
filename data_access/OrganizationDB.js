//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { Organization } from '../business/Organization.js';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess : "organizationDb", //specify module where logs are from
});

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
                        } 
                        else { resolve(null); }
                    } 
                    else {
                        log.error("database query error from GetOrganizationById", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetOrganizationById", error);
                reject(error);
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
                        } 
                        else { resolve(null); }
                    } 
                    else {
                        log.error("database query error from GetAllOrganizations", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from GetAllOrganizations", error);
                reject(error);
            }
        });
    }

    /**
     * Creates an Organization
     * @param {Organization} org
     * @returns {Organization | null} the created organization object if successful or null if not
     */
    CreateOrganization(org) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    INSERT INTO organization (name)
                        VALUES (?)`;
                this.con.query(str, [org.name], (err, result) => {
                    if (!err) {
                        if (result.insertId > 0) {
                            log.verbose("organization created", { orgName: org.name });
                            resolve(new Organization(result.insertId, org.name));
                        } 
                        else { resolve(null); }
                    } 
                    else {
                        log.error("database query error from CreateOrganization", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from CreateOrganization", error);
                reject(error);
            }
        });
    }

    /**
     * Updates an Organization
     * @param {Organization} org
     * @returns {Boolean} True or False based on if the update was successful
     */
    UpdateOrganization(org) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    UPDATE organization SET
                        organization.name = ?
                    WHERE organization.org_id = ?`;
                this.con.query(str, [org.name,org.id], (err, result) => {
                    if (!err) {
                        if (result.affectedRows > 0) {
                            log.verbose("organization updated", { orgName: org.name, orgId: org.id });
                            resolve(true);
                        } 
                        else { resolve(false); }
                    } 
                    else {
                        log.error("database query error from UpdateOrganization", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from UpdateOrganization", error);
                reject(error);
            }
        });
    }
}