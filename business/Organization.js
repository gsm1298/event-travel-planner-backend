import { OrganizationDB } from "../data_access/OrganizationDB.js";
import { logger } from '../service/LogService.mjs'

// Init child logger instance
const log = logger.child({
    business : "Organizaiton", //specify module where logs are from
});

/**
 * @Class Organization
 */
export class Organization {
    /**
     * @constructor
     * @param {Integer} id
     * @param {String} name
     */
    constructor(id = null, name = null) {
        this.id = id;
        this.name = name;
    }

    /**
     * Gets an Organization by ID. 
     * If successful return the Organization object, if not null
     * @param {Integer} orgID
     * @returns {Organization | null}
     * @throws {Error}
     */
    static async getOrg(orgID) {
        const db = new OrganizationDB();

        try{
            const org = await db.GetOrganizationById(orgID);

            //Check if the Organization exists
            if (org) {
                return org;
            } 
            else {
                return null;
            }
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying to get org by id"));
        } finally { db.close(); }
    }

    /**
     * Get all Organizations. 
     * If successful return an array of Organization objects, if not null
     * @returns {Organization[] | null}
     * @throws {Error}
     */
    static async getOrgs() {
        const db = new OrganizationDB();

        try {
            const orgs = await db.GetAllOrganizations();

            //Check if there are Organizations in the array
            if (orgs && orgs.length > 0) {
                return orgs;
            } 
            else { return null; }
        } catch (error) {
             log.error(error);
             log.error(new Error("Error trying to get orgs"));
        } finally { db.close(); }
    }

     /**
     * Updates or Creates an Organization. 
     * If successful return the Organization object, if not null
     * @returns {Organization | null}
     * @throws {Error}
     */
     async save() {
        const db = new OrganizationDB();

        try {
            if (this.id != null) {
                const updateOrg = await db.UpdateOrganization(this);
                log.verbose("organization updated / saved", { orgId: this.id }); // audit logging from within the org js constructor file.
                //Check if Organization was successfully updated
                if (updateOrg) { return this; }
                else { return null; }
            } 
            else {
                const newOrg = await db.CreateOrganization(this);

                //Check if Organization was successfully added
                if (newOrg) { Object.assign(this, newOrg); return this; }
                else { return null; }
            }
        } catch (error) {
             log.error(error);
             log.error(new Error("Error trying save org"));
        } finally { db.close(); }
    }
}