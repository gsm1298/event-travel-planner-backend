import express from 'express';
import { Organization } from '../business/Organization.js';
import { User } from '../business/User.js';
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';
import { AuthService } from './AuthService.js';
import { parse } from 'csv/sync'; // Import the CSV parser

// Init child logger instance
const log = logger.child({
    service: "organizationService", //specify module where logs are from
});

export class OrganizationService {
    /**
     * @constructor
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for organization operations
        this.app.post('/organization', this.createOrganization);
        this.app.get('/organization/users', this.getUsersInOrg);
        this.app.get('/organization/:id', this.getOrganizationById);
        this.app.get('/organizations', this.getAllOrganizations);
        this.app.put('/organization/:id', this.updateOrganization);
        this.app.post('/organization/:id/importUsers', this.importUsers);
        //this.app.delete('/organization/:id', this.deleteOrganization);
    }

    /** @type {express.RequestHandler} */
    async createOrganization(req, res) {
        try {
            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin"])) {
                log.verbose("unauthorized user attempted to create an organization", { userId: user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            // Validate request body
            const schema = Joi.object({
                name: Joi.string().min(3).required()
            });
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            // Use data from the request body
            const { name } = req.body;

            //Create Organization
            const newOrg = new Organization(null, name);

            //Save to DB
            const createdOrg = await newOrg.save();

            if (createdOrg) {
                log.verbose("New org created", { orgName: name });
                res.status(201).json({ message: "Organization created successfully", createdOrg });
            }
            else {
                res.status(500).json({ error: "Unable to create Organization." });
            }
        } catch (err) {
            console.error("Error at Create Organization:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async importUsers(req, res) {
        try {

            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin", "Org Admin"])) {
                log.verbose("unauthorized user attempted to import users", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            // joi validation for file data
            const schema = Joi.object({
                fileName: Joi.string().required(),
                fileType: Joi.string().valid("text/csv").required(),
                fileData: Joi.string().required()
            });

            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const { fileName, fileType, fileData } = req.body;

            // Decode Base64 data into a Buffer
            const buffer = Buffer.from(fileData, "base64");
            const csvContent = buffer.toString("utf-8");

            // Parse CSV data
            const records = parse(csvContent, {
                columns: true,      // First row as header
                skip_empty_lines: true,
                trim: true,
            });

            // joi validation for csv data
            const csvSchema = Joi.object({
                firstName: Joi.string().required(),
                lastName: Joi.string().required(),
                email: Joi.string().email().required(),
                phoneNum: Joi.string().required(),
                gender: Joi.string().valid('m', 'f').required(),
                title: Joi.string().valid('mr', 'mrs', 'ms', 'miss', 'dr').required(),
                dob: Joi.date().required(),
                role: Joi.string().valid('Attendee', 'Event Planner', 'Finance Manager').required(),
            });

            // Validate each record against the schema  
            for (const record of records) {
                const { error } = csvSchema.validate(record);
                if (error) {
                    return res.status(400).json({ error: `Invalid record in CSV: ${error.details[0].message}` });
                }
            }

            // Create users from CSV data
            const users = records.map(record => new User
                (
                    null, record.firstName, record.lastName, record.email, record.phoneNum,
                    record.gender, record.title, null, {id: req.params.id}, null, null, null, null, record.dob
                )
            );

            await User.importUsers(users);

            return res.status(200).json({ message: "Users imported successfully" });

        } catch (err) {
            log.error("Error at Import Users:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async getOrganizationById(req, res) {
        try {
            const orgId = req.params.id;
            const org = await Organization.getOrg(orgId);
            if (org) {
                res.status(200).json(org);
            }
            else {
                res.status(404).json({ message: "Organization not found" });
            }
        } catch (err) {
            log.error("Error at Get Organization by ID:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async getAllOrganizations(req, res) {
        try {
            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin"])) {
                log.verbose("unauthorized user attempted to get all organizations", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }
            
            const orgs = await Organization.getOrgs();
            if (orgs) { res.status(200).json(orgs); }
            else { res.status(404).json({ message: "No Organizations found" }); }
        } catch (err) {
            log.error("Error at Get All Organizations:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async updateOrganization(req, res) {
        try {
            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin"])) {
                log.verbose("unauthorized user attempted to update an organization", { userId: res.locals.user.id, orgId: req.params.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            // Validate request body
            const schema = Joi.object({
                name: Joi.string().min(3).required()
            });
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const orgId = req.params.id;
            const name = req.body.name;

            // Retrieve the Organization by ID
            const org = await Organization.getOrg(orgId);
            if (!org) {
                res.status(404).json({ message: "Organization not found" });
                return;
            }

            // Update Org Object fields
            org.name = name;

            // Update Org in DB
            const updatedOrg = await org.save();
            if (updatedOrg) {
                log.verbose("orOrganization updated successfullygin", { orgName: updatedOrg });
                res.status(200).json({ message: "Organization updated successfully", updatedOrg });
            }
            else { res.status(500).json({ error: "Unable to update Organization." }); }
        } catch (err) {
            log.error("Error at Update Organization:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async getUsersInOrg(req, res) {
        try {
            const user = await User.GetUserById(res.locals.user.id);
            const users = await User.GetAllUsersFromOrg(user.org.id);
            if (users) {
                res.status(200).json(users);
            }
            else {
                res.status(404).json({ message: "No users found in Organization" });
            }
        } catch (err) {
            log.error("Error at Get Users in Organization:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
}