import express from 'express';
import { Event } from '../business/Event.js'; // Event model
import { AuthService } from './AuthService.js'; // Assuming you already have the AuthService
import { logger } from '../service/LogService.mjs'; // logging

// Init child logger instance
const log = logger.child({
    service : "eventService", //specify module where logs are from
});
export class EventService {
    /**
     * @constructor
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for event operations
        this.app.post('/events', this.createEvent);
        this.app.get('/events/:id', this.getEventById);
        this.app.get('/events', this.getEvents);
        this.app.put('/events/:id', this.updateEvent);
        this.app.delete('/events/:id', this.deleteEvent);
    }

    // ALL CRUD OPERATIONS BELOW
    
    /**
     * Create a new event and return the event ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async createEvent(req, res) {
        try {
            // Use data from the request body and authenticated user
            const { name, startDate, endDate, financeMan, inviteLink, description, pictureLink, maxBudget } = req.body;
            const userId = res.locals.user.id;  // user ID from authenticator middleware
            const userOrg = res.locals.user.org;  // user organization from authenticator middleware
            const currentBudget = maxBudget;

            // Create the event
            const newEvent = new Event(
                null,  // ID will be auto-generated
                name,
                userId,  // createdBy will be the current user
                financeMan,
                startDate,
                endDate,
                userOrg,  // org will be the current user's org
                inviteLink,
                description,
                pictureLink,
                maxBudget,
                currentBudget
            );
            
            log.verbose("creating new event", {
                name: newEvent.name,
                userId: newEvent.userId,  
                financeMan: newEvent.financeMan,
                startDate: newEvent.startDate,
                endDate: newEvent.endDate,
                userOrg: newEvent.userOrg,  
                inviteLink: newEvent.inviteLink,
                description: newEvent.description,
                pictureLink: newEvent.inviteLink,
                maxBudget: newEvent.maxBudget,
                currentBudget: newEvent.currentBudget
            })

            // Save event to the database
            const eventId = await newEvent.save();
            
            // Respond with the created event ID
            res.status(201).json({ message: "Event created successfully", eventId });
        } catch (err) {
            log.error("Error creating event:", err);
            res.status(500).json({ error: "Unable to create event." });
        }
    }

    /**
     * Get event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getEventById(req, res) {
        try {
            const eventId = req.params.id;
            const event = await Event.findById(eventId);
            if (event) {
                res.status(200).json(event);
            } else {
                res.status(404).json({ message: "Event not found" });
            }
        } catch (err) {
            log.error("Error retrieving event:", err);
            res.status(500).json({ error: "Unable to fetch event." });
        }
    }

    /**
     * Get events for a given user
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getEvents(req, res) {
        try {
            const events = await Event.getEvents(res.locals.user.id, res.locals.user.role);
            res.status(200).json(events);
        } catch (err) {
            log.error("Error retrieving events:", err);
            res.status(500).json({ error: "Unable to fetch events." });
        }
    }

    /**
     * Get all events
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getAllEvents(req, res) {
        try {
            const events = await Event.findAll();
            res.status(200).json(events);
        } catch (err) {
            log.error("Error retrieving all events:", err);
            res.status(500).json({ error: "Unable to fetch events." });
        }
    }

    /**
     * Update an existing event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async updateEvent(req, res) {
        try {
            const eventId = req.params.id;
            const eventData = req.body;
            const userId = res.locals.user.id;  // user ID from authenticator middleware

            // Retrieve the event by ID
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }

            // Ensure the user is authorized to update this event
            if (event.createdBy.id !== userId) {
                log.verbose("user attempted to make unauthorized event modifications", { userId: userId, event: event })
                return res.status(403).json({ message: "Unauthorized: You cannot update this event" });
            }

            // Update event properties
            Object.assign(event, eventData);  // Update only the provided fields

            var success = await event.save();  // Save updated event

            if (success) {
                log.verbose("Event updated successfully", { userId: userId, event: event, eventData: eventData });
                res.status(200).json({ message: "Event updated successfully" });
            }
            else {
                log.verbose("Could not update event", { userId: userId, event: event, eventData: eventData });
                res.status(500).json({ message: "Could not update event" });
            }
        } catch (err) {
            log.error("Error updating event:", err);
            res.status(500).json({ error: "Unable to update event." });
        }
    }

    /**
     * Delete an event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async deleteEvent(req, res) {
        try {
            const eventId = req.params.id;
            const userId = res.locals.user.id;  // user ID from authenticator middleware

            // Retrieve the event by ID
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }

            // Ensure the user is authorized to delete this event
            if (event.createdBy !== userId) {
                log.verbose("Unauthorized user attempt to delete event", { userId: userId, event: event })
                return res.status(403).json({ message: "Unauthorized: You cannot delete this event" });
            }

            await Event.delete(eventId);  // Delete the event from the database
            log.verbose("Authorized user deleted event", { userId: userId, event: event })
            res.status(200).json({ message: "Event deleted successfully" });
        } catch (err) {
            log.error("Error deleting event:", err);
            res.status(500).json({ error: "Unable to delete event." });
        }
    }
}
