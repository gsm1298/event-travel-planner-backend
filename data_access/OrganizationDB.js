//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { Organization } from '../business/Organization.js';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess: "organizationDb", //specify module where logs are from
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
            var str = `
                SELECT 
                    organization.org_id, organization.name, organization.created, organization.last_edited
                FROM organization
                WHERE organization.org_id = ?`;
            return this.executeQuery(str, [id], "GetOrganizationById")
                .then(rows => {
                    if (rows.length > 0) {
                        const row = rows[0];
                        resolve(new Organization(row.org_id, row.name));
                    }
                    resolve(null);
                }).catch(error => { reject(error); });
        }
        );
    }

    /**
     * Gets all Organizations.
     * @returns {Organization[] | null} An array of Organization objects if anything is found or null if not
     */
    GetAllOrganizations() {
        return new Promise((resolve, reject) => {
            var str = `
                SELECT 
                    organization.org_id, organization.name, organization.created, organization.last_edited
                FROM organization`;
            return this.executeQuery(str, [], "GetAllOrganizations")
                .then(rows => {
                    if (rows.length > 0) {
                        resolve(rows.map(row => new Organization(row.org_id, row.name)));
                    }
                    resolve(null);
                }).catch(error => { reject(error); });
        });
    }


    /**
     * Creates an Organization
     * @param {Organization} org
     * @returns {Organization | null} the created organization object if successful or null if not
     */
    CreateOrganization(org) {
        var str = `
            INSERT INTO organization (name)
            VALUES (?)`;
        return this.executeQuery(str, [org.name], "CreateOrganization")
            .then(result => {
                if (result.insertId > 0) {
                    log.verbose("organization created", { orgName: org.name });
                    resolve(new Organization(result.insertId, org.name));
                }
                resolve(null);
            }).catch(error => { reject(error); });
    }

    /**
     * Updates an Organization
     * @param {Organization} org
     * @returns {Boolean} True or False based on if the update was successful
     */
    UpdateOrganization(org) {
        var str = `
            UPDATE organization SET
                organization.name = ?
            WHERE organization.org_id = ?`;
        return this.executeQuery(str, [org.name, org.id], "UpdateOrganization")
            .then(result => {
                if (result.affectedRows > 0) {
                    log.verbose("organization updated", { orgName: org.name, orgId: org.id });
                    resolve(true);
                }
                resolve(false);
            }).catch(error => { reject(error); });
    }
}