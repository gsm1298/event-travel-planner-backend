import express from 'express';
import { Organization } from '../business/Organization.js'

export class OrganizationService {
    /**
     * @constructor
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for organization operations
        this.app.post('/organization', this.createOrganization);
        this.app.get('/organization/:id', this.getOrganizationById);
        this.app.get('/organizations', this.getAllOrganizations);
        this.app.put('/organization/:id', this.updateOrganization);
        //this.app.delete('/organization/:id', this.deleteOrganization);
    }

    /** @type {express.RequestHandler} */
    async createOrganization(req, res) {
        // Use data from the request body
        const { name } = req.body;

        //Create Organization
        const newOrg = new Organization(null, name);

        //Save to DB
        const createdOrg = await newOrg.createOrg(name);

        if (createdOrg) {
            res.status(201).json({ message: "Organization created successfully", createdOrg });
        }
        else {
            res.status(500).json({ error: "Unable to create Organization." });
        }
    }

    /** @type {express.RequestHandler} */
    async getOrganizationById(req, res) {
        const orgId = req.params.id;
        const org = await Organization.getOrg(orgId);
        if (org) {
            res.status(200).json(org);
        } else {
            res.status(404).json({ message: "Organization not found" });
        }
    }

    /** @type {express.RequestHandler} */
    async getAllOrganizations(req, res) {
        const orgs = await Organization.getOrgs();
        if (orgs) { res.status(200).json(orgs); }
        else { res.status(404).json({ message: "No Organizations found" }); }
    }

    /** @type {express.RequestHandler} */
    async updateOrganization(req, res) {
        const orgId = req.params.id;
        const name = req.body.name;

        // Retrieve the Organization by ID
        const org = await Organization.getOrg(orgId);
        if (!org) {
            res.status(404).json({ message: "Organization not found" });
            return;
        }

        const updatedOrg = await org.updateOrg(name);
        if (updatedOrg) {
            res.status(200).json({ message: "Organization updated successfully", updatedOrg });
        }
        else { res.status(500).json({ error: "Unable to update Organization." }); }
    }
}