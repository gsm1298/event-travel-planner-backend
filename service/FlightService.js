import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { Duffel } from '@duffel/api';
import { User } from '../business/User.js';
import { Flight } from '../business/Flight.js';
import { Util } from '../business/Util.js';
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';
import Amadeus from 'amadeus';
import { Email } from '../business/Email.js';
import { Event } from '../business/Event.js';
import { AuthService } from './AuthService.js';

// Init child logger instance
const log = logger.child({
    service : "flightService", //specify module where logs are from

});

//Initialize env config and load in env for appropriate modules
dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

const duffel = new Duffel({
    token: `${process.env.duffelToken}`
})

const amadeus = new Amadeus({
    clientId: `${process.env.amadeusToken}`,
    clientSecret: `${process.env.amadeusSecret}`
})

// Flight Service Class
export class FlightService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {
        app.post('/flights/search', this.search);

        app.post('/flights/hold', this.hold);

        app.post('/flights/booking', this.booking);

        app.get('/flights/eventflights/:id', this.getEventFlights);
    }


    // Endpoints -----------------------------------------------------------------

    // Search for Flight
    /**@type {express.RequestHandler} */
    async search(req, res) {

        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to search for a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }

        // Init some variables
        var input = req.body;
        var origin_airport;

        // JOI Validation
        const schema = Joi.object({
            lat: Joi.number().unsafe().required(),
            long: Joi.number().unsafe().required(),
            departure_date: Joi.string().isoDate().required(),
            return_date: Joi.string().isoDate().optional(),
            destination: Joi.string().required(),
            type: Joi.number().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Call to Amadeus to return list of closest airport codes
        // Accepts in a longitude and latitude value provided by Google Places API from Front
        try {
            await amadeus.referenceData.locations.airports.get({
                latitude: input.lat, longitude: input.long
            }).then(resp => {
                origin_airport = resp.data[0].iataCode;
            })
        } catch (err) {
            log.error("Error at Flight Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        // Instantiate vars before the try/catch block for scoping
        var offers;
        var data = [];

        try {
            // Generate offer search and call Duffel api
            // Generate one-way or round trip based on input type value
            if(input.type == 0) {
                await duffel.offerRequests.create({
                    slices: [
                        {
                            origin: origin_airport,
                            destination: input.destination,
                            departure_date: input.departure_date
                        }
                    ],
                    passengers: [
                        {
                            type: "adult"
                        }
                    ],
                    cabin_class: "economy"
                }).then(resp =>
                    offers = resp
                )
            } else if (input.type == 1) {
                offers = await duffel.offerRequests.create({
                    slices: [
                        {
                            origin: origin_airport,
                            destination: input.destination,
                            departure_date: input.departure_date
                        },
                        {
                            origin: input.destination,
                            destination: origin_airport,
                            departure_date: input.return_date
                        }
                    ],
                    passengers: [
                        {
                            type: "adult"
                        }
                    ],
                    cabin_class: "economy"
                }).then(resp =>
                    offers = resp
                )
            } else {
                throw new Error("Invalid Flight Type!");
            }


            // Parse through api data and store necessary info to data
            offers.data.offers.forEach((o) => {
                if(o.payment_requirements.payment_required_by == null) {
                    return;
                }

                // Init empty array to hold parsed slice data
                var slices = []
    
                // Stop count for Nonstop/Connecting
                var stops = o.slices[0].segments.length; 

                // Call Utils to parse
                o.slices.forEach((s) => slices.push(Util.parseSlice(s)));

                // Format Duffel data
                data.push({
                    offer_id: o.id,
                    passenger_id: o.passengers[0].id,
                    airline: o.owner.name,
                    price: o.total_amount,
                    duration: o.slices[0].duration,
                    destination_airport: o.slices[0].destination.iata_code,
                    origin_airport: o.slices[0].origin.iata_code,
                    logo: o.owner.logo_symbol_url,
                    flight_class: o.slices[0].fare_brand_name,
                    flight_type: slices[0].flight_type,
                    details: slices
                })

            });

            res.status(200).send(JSON.stringify(data));
        } catch (err) {
            log.error("Error at Offer Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    // Place Flight on Hold
    /**@type {express.RequestHandler} */
    async hold(req, res) {
        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to hold a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }
        
        var input = req.body;
        var user;

        // JOI Validation
        const schema = Joi.object({
            offerID: Joi.string().required(),
            passID: Joi.string().required(),
            flight: Joi.object().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        try {
            user = await User.GetUserById(res.locals.user.id);
        } catch (error) {
            log.error("uncaught user get request from flightservice");
            res.status(500).json({error: "Internal Server Error"});
        }

        try {
            // Create Datetime object for DB insert
            var deptdate = new Date((input.flight.date).slice(0,11) + input.flight.depart_time + ":00.000Z");
            var arrdate = new Date((input.flight.date).slice(0,11) + input.flight.arrive_time + ":00.000Z");

            // Create hold on given flight offer
            var confirmation = await duffel.orders.create({
                selected_offers: [input.offerID],
                type: "hold",
                passengers: [
                    {
                        id: input.passID,
                        given_name: user.firstName,
                        family_name: user.lastName,
                        title: user.title,
                        gender: user.gender,
                        phone_number: "+1" + user.phoneNum,
                        email: user.email,
                        born_on: user.dob
                    }
                ]
            })

            // Formatted response data from Duffel
            var data = {
                id: confirmation.data.id,
                offer_id: confirmation.data.offer_id,
                total: confirmation.data.total_amount,
                expiration: confirmation.data.payment_status.payment_required_by,
                guarantee: confirmation.data.payment_status.price_guarantee_expires_at
            }

            // Insert new hold into DB
            var newHold = new Flight(null, res.locals.user.id, input.flight.price, deptdate, 
            input.flight.depart_loc, arrdate, input.flight.arrive_loc, 1, 
            null, null, null, null, null, data.id);
            newHold.save();

            // Notify user via email
            const email = new Email('no-reply@jlabupch.uk', user.email, "Flight on Hold", `Your flight to ${data.destination_airport} has been placed on hold.`);
            await email.sendEmail();

            res.status(200).send(JSON.stringify(data));
            log.verbose("user flight hold confirmed", { email: user.email, confirmationID: confirmation.data.id });

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Book Flight
    /**@type {express.RequestHandler} */
    async booking(req, res) {

        // Check if the user is a finance Manager
        if (!AuthService.authorizer(req, res, ["Finance Manager"])) {
            log.verbose("unauthorized user attempted to book a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }
        
        // const schema = Joi.object({
        //     id: Joi.string().required(),
        //     price: Joi.number().positive().required()
        // });

        // const { error } = schema.validate(req.body);
        // if (error) {
        //     return res.status(400).json({ error: error.details[0].message });
        // }

        var input = req.body;

        try {
            var flight = await Flight.getFlightByID(input.flightID);
            if(!flight) {
                return res.status(404).json({ error: "Flight not found" });
            }

            // UNCOMMENT TO ENABLE PAYMENT THROUGH DUFFLE
            // Payment Creation 
            // var confirmation = await duffel.payments.create({
            //     'order_id': input.id,
            //     'payment': {
            //         'type': 'balance',
            //         'amount': input.price,
            //         'currency': 'USD'
            //     }
            // })

            // Update DB record
            if(input.selection == 0) {
                flight.status = 2; // Need to double check
            } else {
                flight.order_id = "TEMP"
                flight.approved_by = res.locals.user.id
                flight.confirmation_code = "Confirmed"
            }
            flight.save();

            // Updated the event history if flight was approved
            const event = await Event.findById(flight.event_id);
            await event.updateEventHistory(res.locals.user.id, flight.flight_id);
            

            // Send email to user
            // const email = new Email('no-reply@jlabupch.uk', user.email, "Flight Booked", `Your flight to ${flight.destination_airport} has been booked.`);
            // await email.sendEmail();

            res.status(200).json({ success: 'Flight Booked' });
            log.verbose("flight booked", { flightID: flight.flight_id });

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Get all Flights for input Event
    // For Finance Use
    /**@type {express.RequestHandler} */
    async getEventFlights(req, res) {
        console.log(req.params.id);

        try {
            const eventID = req.params.id;
            const flights = await Flight.getFlightsByEvent(eventID);
            if(flights) {
                res.status(200).json(flights);
            } else {
                res.status(400).json({ message: "Flights not found" });
            }
        } catch (error) {
            log.error("Error retrieving flights for event:", error);
            res.status(500).json({ error: "Unable to fetch flights" });
        }
    }
}