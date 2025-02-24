import { OrganizationDB } from "../data_access/OrganizationDB.js";

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
     */
    static async getOrg(orgID) {
        const db = new OrganizationDB();

        const org = await db.GetOrganizationById(orgID);

        //Check if the Organization exists
        if (org) {
            return org;
        } 
        else {
            return null;
        }
    }

    /**
     * Get all Organizations. 
     * If successful return an array of Organization objects, if not null
     * @returns {Organization[] | null}
     */
    static async getOrgs() {
        const db = new OrganizationDB();

        const orgs = await db.GetAllOrganizations();

        //Check if there are Organizations in the array
        if (orgs && orgs.length > 0) {
            return orgs;
        } 
        else { return null; }
    }

     /**
     * Updates or Creates an Organization. 
     * If successful return the Organization object, if not null
     * @returns {Organization | null}
     */
     async save() {
        const db = new OrganizationDB();

        if (this.id != null) {
            const updateOrg = await db.UpdateOrganization(this);

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
    }
}